"use client";

import type { ConflictEvent } from "@anvilkit/plugin-collab-yjs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";

import { useCollabConflictQueue } from "../context.js";
import { ForceResyncDialog } from "./force-resync-dialog.js";

export interface ConflictNoticeCenterProps {
  /**
   * Emitted only on overlap conflicts; future kinds (merge, etc.)
   * may fall through with a different severity. Override the
   * default copy by passing a `formatMessage` function.
   */
  readonly formatMessage?: (event: ConflictEvent) => string;
  readonly toasterPosition?: "top-right" | "bottom-right" | "top-center";
}

const DEFAULT_FORMAT = (event: ConflictEvent): string => {
  const peerName =
    event.remotePeer?.displayName ?? event.remotePeer?.id ?? "another peer";
  const nodeList = event.nodeIds.slice(0, 3).join(", ");
  return `${peerName}'s edit overlapped your unsaved change in ${nodeList}.`;
};

export function ConflictNoticeCenter(
  props: ConflictNoticeCenterProps,
): ReactNode {
  const { conflicts, dismissConflict } = useCollabConflictQueue();
  const formatter = props.formatMessage ?? DEFAULT_FORMAT;
  const seenRef = useRef<Set<string>>(new Set());
  const [resyncOpen, setResyncOpen] = useState(false);

  useEffect(() => {
    for (const event of conflicts) {
      // Key by more than `event.at`: two overlap conflicts can
      // share an ISO timestamp (same tick, different peers/nodes).
      // Keying by `at` alone silently dropped the second toast
      // (review §C6).
      const key = `${event.at}:${event.localPeer.id}:${
        event.remotePeer?.id ?? "unknown"
      }:${event.nodeIds.join("|")}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      toast(formatter(event), {
        id: key,
        duration: 8000,
        action: {
          label: "Force resync",
          onClick: () => setResyncOpen(true),
        },
        onDismiss: () => dismissConflict(event.at),
        onAutoClose: () => dismissConflict(event.at),
      });
    }
  }, [conflicts, dismissConflict, formatter]);

  return (
    <>
      <Toaster
        position={props.toasterPosition ?? "top-right"}
        richColors
        closeButton
        data-slot="conflict-notice-center"
      />
      <ForceResyncDialog open={resyncOpen} onOpenChange={setResyncOpen} />
    </>
  );
}
