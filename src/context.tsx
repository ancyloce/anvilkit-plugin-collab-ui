"use client";

import type {
	ConflictEvent,
	ConnectionStatus,
	YjsSnapshotAdapter,
} from "@anvilkit/plugin-collab-yjs";
import type { PeerInfo, PresenceState } from "@anvilkit/plugin-version-history";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

export interface CollabSelf {
	readonly displayName: string;
	readonly color: string;
}

export interface CollabUIContextValue {
	readonly adapter: YjsSnapshotAdapter;
	readonly self: PeerInfo;
	readonly status: ConnectionStatus;
	readonly peers: readonly PresenceState[];
	readonly conflicts: readonly ConflictEvent[];
	readonly dismissConflict: (at: string) => void;
	readonly clearConflicts: () => void;
	readonly updateSelf: (patch: Partial<CollabSelf>) => void;
}

const CollabUIContext = createContext<CollabUIContextValue | null>(null);

export interface CollabUIProviderProps {
	readonly adapter: YjsSnapshotAdapter;
	/**
	 * The local peer's identity. The provider mirrors this through
	 * `adapter.presence.update` whenever the host calls `updateSelf`.
	 */
	readonly self: PeerInfo;
	readonly children: ReactNode;
}

export function CollabUIProvider(props: CollabUIProviderProps): ReactNode {
	const { adapter, children, self: selfProp } = props;
	const [self, setSelfState] = useState<PeerInfo>(selfProp);
	const [status, setStatus] = useState<ConnectionStatus>(() =>
		adapter.getStatus(),
	);
	const [peers, setPeers] = useState<readonly PresenceState[]>([]);
	const [conflicts, setConflicts] = useState<readonly ConflictEvent[]>([]);
	const selfRef = useRef(self);
	selfRef.current = self;

	useEffect(() => {
		setSelfState({
			id: selfProp.id,
			displayName: selfProp.displayName,
			color: selfProp.color,
		});
	}, [selfProp.id, selfProp.displayName, selfProp.color]);

	useEffect(() => {
		const unsub = adapter.onStatusChange(setStatus);
		return () => unsub();
	}, [adapter]);

	useEffect(() => {
		const unsub = adapter.onConflict((event) => {
			setConflicts((prev) => [...prev, event]);
		});
		return () => unsub();
	}, [adapter]);

	useEffect(() => {
		const presence = adapter.presence;
		if (!presence) return;
		const unsub = presence.onPeerChange((next) => {
			setPeers(dedupeRemotePeers(next, selfRef.current.id));
		});
		return () => unsub();
	}, [adapter]);

	useEffect(() => {
		// Mirror the current local identity into the awareness channel so
		// other peers see joins and settings changes even before a cursor
		// move or selection update.
		adapter.presence?.update({ peer: self });
	}, [adapter, self]);

	const dismissConflict = useCallback((at: string) => {
		setConflicts((prev) => prev.filter((event) => event.at !== at));
	}, []);

	const clearConflicts = useCallback(() => {
		setConflicts([]);
	}, []);

	const updateSelf = useCallback((patch: Partial<CollabSelf>) => {
		setSelfState((prev) => {
			const next: PeerInfo = {
				id: prev.id,
				displayName: patch.displayName ?? prev.displayName,
				color: patch.color ?? prev.color,
			};
			return next;
		});
	}, []);

	const value = useMemo<CollabUIContextValue>(
		() => ({
			adapter,
			self,
			status,
			peers,
			conflicts,
			dismissConflict,
			clearConflicts,
			updateSelf,
		}),
		[
			adapter,
			self,
			status,
			peers,
			conflicts,
			dismissConflict,
			clearConflicts,
			updateSelf,
		],
	);

	return (
		<CollabUIContext.Provider value={value}>
			{children}
		</CollabUIContext.Provider>
	);
}

export function useCollabContext(): CollabUIContextValue {
	const ctx = useContext(CollabUIContext);
	if (!ctx) {
		throw new Error(
			"useCollabContext must be called inside <CollabUIProvider>.",
		);
	}
	return ctx;
}

export function useCollabStatus(): ConnectionStatus {
	return useCollabContext().status;
}

export function useCollabPeers(): readonly PresenceState[] {
	return useCollabContext().peers;
}

export function useCollabSelf(): PeerInfo {
	return useCollabContext().self;
}

export function useCollabConflicts(): readonly ConflictEvent[] {
	return useCollabContext().conflicts;
}

export function useCollabAdapter(): YjsSnapshotAdapter {
	return useCollabContext().adapter;
}

function dedupeRemotePeers(
	peers: readonly PresenceState[],
	selfId: string,
): readonly PresenceState[] {
	const byId = new Map<string, PresenceState>();
	for (const frame of peers) {
		if (frame.peer.id === selfId) continue;
		const prev = byId.get(frame.peer.id);
		if (!prev) {
			byId.set(frame.peer.id, frame);
			continue;
		}
		byId.set(frame.peer.id, {
			peer: { ...prev.peer, ...frame.peer },
			cursor: frame.cursor ?? prev.cursor,
			selection: frame.selection ?? prev.selection,
		});
	}
	return Array.from(byId.values());
}
