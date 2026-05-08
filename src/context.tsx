"use client";

import type {
	ConflictEvent,
	ConnectionStatus,
	YjsSnapshotAdapter,
} from "@anvilkit/plugin-collab-yjs";
import type {
	PeerInfo,
	PresenceState,
} from "@anvilkit/plugin-version-history";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
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
	const { adapter, children } = props;
	const [self, setSelfState] = useState<PeerInfo>(props.self);
	const [status, setStatus] = useState<ConnectionStatus>(() =>
		adapter.getStatus(),
	);
	const [peers, setPeers] = useState<readonly PresenceState[]>([]);
	const [conflicts, setConflicts] = useState<readonly ConflictEvent[]>([]);
	const selfRef = useRef(self);
	selfRef.current = self;

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
		// Mirror initial self into the awareness channel so other peers
		// see us as soon as the provider mounts.
		presence.update({ peer: selfRef.current });
		const unsub = presence.onPeerChange((next) => {
			setPeers(
				next.filter((peer) => peer.peer.id !== selfRef.current.id),
			);
		});
		return () => unsub();
	}, [adapter]);

	const dismissConflict = useCallback((at: string) => {
		setConflicts((prev) => prev.filter((event) => event.at !== at));
	}, []);

	const clearConflicts = useCallback(() => {
		setConflicts([]);
	}, []);

	const updateSelf = useCallback(
		(patch: Partial<CollabSelf>) => {
			setSelfState((prev) => {
				const next: PeerInfo = {
					id: prev.id,
					displayName: patch.displayName ?? prev.displayName,
					color: patch.color ?? prev.color,
				};
				adapter.presence?.update({ peer: next });
				return next;
			});
		},
		[adapter],
	);

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
