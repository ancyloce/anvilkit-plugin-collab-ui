"use client";

import type { ConflictEvent } from "@anvilkit/plugin-collab-yjs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";

import { useCollabContext } from "../context.js";
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
	const { conflicts, dismissConflict } = useCollabContext();
	const formatter = props.formatMessage ?? DEFAULT_FORMAT;
	const seenRef = useRef<Set<string>>(new Set());
	const [resyncOpen, setResyncOpen] = useState(false);

	useEffect(() => {
		for (const event of conflicts) {
			if (seenRef.current.has(event.at)) continue;
			seenRef.current.add(event.at);
			toast(formatter(event), {
				id: event.at,
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
			<ForceResyncDialog
				open={resyncOpen}
				onOpenChange={setResyncOpen}
			/>
		</>
	);
}
