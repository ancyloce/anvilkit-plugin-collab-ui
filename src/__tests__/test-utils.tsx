import type {
  ConflictEvent,
  ConnectionStatus,
  YjsSnapshotAdapter,
} from "@anvilkit/plugin-collab-yjs";
import type {
  PageIR,
  PeerInfo,
  PresenceState,
  SnapshotMeta,
} from "@anvilkit/plugin-version-history";
import type { ReactNode } from "react";

import { CollabUIProvider } from "../context.js";

export interface FakeAdapterControls {
  emitStatus: (status: ConnectionStatus) => void;
  emitConflict: (event: ConflictEvent) => void;
  emitPeers: (peers: readonly PresenceState[]) => void;
  forceResyncResolveWith: PageIR | null;
  forceResyncCalls: number;
}

export function createFakeAdapter(
  overrides: Partial<{
    initialStatus: ConnectionStatus;
    snapshots: readonly SnapshotMeta[];
  }> = {},
): { adapter: YjsSnapshotAdapter; controls: FakeAdapterControls } {
  let status: ConnectionStatus =
    overrides.initialStatus ?? ({ kind: "connecting" } as const);
  const statusListeners = new Set<(s: ConnectionStatus) => void>();
  const conflictListeners = new Set<(e: ConflictEvent) => void>();
  const peerListeners = new Set<(p: readonly PresenceState[]) => void>();

  const controls: FakeAdapterControls = {
    emitStatus(next) {
      status = next;
      for (const listener of statusListeners) listener(next);
    },
    emitConflict(event) {
      for (const listener of conflictListeners) listener(event);
    },
    emitPeers(peers) {
      for (const listener of peerListeners) listener(peers);
    },
    forceResyncResolveWith: null,
    forceResyncCalls: 0,
  };

  const adapter: YjsSnapshotAdapter = {
    save() {
      return "snap-fake";
    },
    list() {
      return overrides.snapshots ?? [];
    },
    load(_id) {
      throw new Error("fake adapter has no payload");
    },
    subscribe() {
      return () => undefined;
    },
    onConflict(callback) {
      conflictListeners.add(callback);
      return () => conflictListeners.delete(callback);
    },
    onStatusChange(callback) {
      statusListeners.add(callback);
      callback(status);
      return () => statusListeners.delete(callback);
    },
    getStatus() {
      return status;
    },
    async forceResync() {
      controls.forceResyncCalls += 1;
      return controls.forceResyncResolveWith;
    },
    destroy() {
      statusListeners.clear();
      conflictListeners.clear();
      peerListeners.clear();
    },
    presence: {
      update() {
        // no-op for fake adapter
      },
      onPeerChange(callback) {
        peerListeners.add(callback);
        callback([]);
        return () => peerListeners.delete(callback);
      },
    },
  };

  return { adapter, controls };
}

export function withProvider(
  adapter: YjsSnapshotAdapter,
  self: PeerInfo,
  children: ReactNode,
): ReactNode {
  return (
    <CollabUIProvider adapter={adapter} self={self}>
      {children}
    </CollabUIProvider>
  );
}
