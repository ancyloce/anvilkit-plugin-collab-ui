"use client";

import type {
	ConflictEvent,
	ConnectionStatus,
	MetricsSnapshot,
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
	useSyncExternalStore,
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
	/**
	 * Whether remote peer cursors should render. Single source of truth
	 * for the bundled `<CollabSettingsPopover>` toggle and the bundled
	 * `<PresenceLayer>` overlay (review §C3 / §4.3). A host that mounts
	 * `<PresenceLayer>` directly can still override per-instance via
	 * its `showCursors` prop.
	 */
	readonly showRemoteCursors: boolean;
	readonly setShowRemoteCursors: (show: boolean) => void;
}

// ── Split contexts (review §C2 / §4.4) ───────────────────────────────
//
// The provider feeds five independent contexts instead of one
// monolithic value. High-churn awareness frames update only
// `PeersContext`, so `SyncActivityIndicator` (status), the conflict
// toaster (conflicts), and the avatar identity no longer re-render on
// every remote cursor move. Public hooks below keep their exact prior
// signatures — each just reads the narrow context it needs.

const AdapterContext = createContext<YjsSnapshotAdapter | null>(null);

interface IdentityContextValue {
	readonly self: PeerInfo;
	readonly updateSelf: (patch: Partial<CollabSelf>) => void;
}
const IdentityContext = createContext<IdentityContextValue | null>(null);

const StatusContext = createContext<ConnectionStatus | null>(null);

const PeersContext = createContext<readonly PresenceState[] | null>(null);

interface ConflictsContextValue {
	readonly conflicts: readonly ConflictEvent[];
	readonly dismissConflict: (at: string) => void;
	readonly clearConflicts: () => void;
}
const ConflictsContext = createContext<ConflictsContextValue | null>(null);

interface CursorVisibilityContextValue {
	readonly showRemoteCursors: boolean;
	readonly setShowRemoteCursors: (show: boolean) => void;
}
const CursorVisibilityContext =
	createContext<CursorVisibilityContextValue | null>(null);

export interface CollabUIProviderProps {
	readonly adapter: YjsSnapshotAdapter;
	/**
	 * The local peer's identity. Host `self` is **authoritative**: the
	 * provider mirrors host changes into local state, and mirrors local
	 * `updateSelf` edits back out through `adapter.presence.update`. The
	 * factory's `onIdentityChange` is how the host's source of truth
	 * (auth profile, settings store, …) observes those local edits and
	 * keeps itself in sync (review §A3).
	 */
	readonly self: PeerInfo;
	readonly children: ReactNode;
}

/**
 * Subscribe to adapter connection status via `useSyncExternalStore`
 * (review §A2). Backing the status with the external store instead of
 * `useState`+`useEffect` removes the stale-status paint window during
 * concurrent renders. The snapshot reference only changes when
 * `adapter.onStatusChange` fires, so React's snapshot-stability
 * invariant holds even if `adapter.getStatus()` allocates.
 */
function useExternalStatus(adapter: YjsSnapshotAdapter): ConnectionStatus {
	const cacheRef = useRef<ConnectionStatus | undefined>(undefined);
	if (cacheRef.current === undefined) {
		cacheRef.current = adapter.getStatus();
	}
	const subscribe = useCallback(
		(onStoreChange: () => void) =>
			adapter.onStatusChange((next) => {
				cacheRef.current = next;
				onStoreChange();
			}),
		[adapter],
	);
	const getSnapshot = useCallback(
		() => cacheRef.current as ConnectionStatus,
		[],
	);
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Normalize a peer color before it enters local state / awareness.
 * Remote peer colors are already sanitized upstream by
 * `validatePeerInfo` / `validatePresenceState` in
 * `@anvilkit/plugin-collab-yjs` (review §B4/§B5); this guards the
 * **local** edit path so an invalid value from the settings popover
 * never reaches `adapter.presence.update`.
 */
function normalizeColor(
	input: string | undefined,
	fallback: string | undefined,
): string | undefined {
	if (typeof input !== "string") return fallback;
	const value = input.trim();
	if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
		return value;
	}
	return fallback;
}

export function CollabUIProvider(props: CollabUIProviderProps): ReactNode {
	const { adapter, children, self: selfProp } = props;
	const [self, setSelfState] = useState<PeerInfo>(selfProp);
	const [peers, setPeers] = useState<readonly PresenceState[]>([]);
	const [conflicts, setConflicts] = useState<readonly ConflictEvent[]>([]);
	const [showRemoteCursors, setShowRemoteCursors] = useState(true);
	const selfRef = useRef(self);
	selfRef.current = self;

	const status = useExternalStatus(adapter);

	useEffect(() => {
		setSelfState({
			id: selfProp.id,
			displayName: selfProp.displayName,
			color: selfProp.color,
		});
	}, [selfProp.id, selfProp.displayName, selfProp.color]);

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
				color:
					patch.color !== undefined
						? normalizeColor(patch.color, prev.color)
						: prev.color,
			};
			return next;
		});
	}, []);

	const identityValue = useMemo<IdentityContextValue>(
		() => ({ self, updateSelf }),
		[self, updateSelf],
	);

	const conflictsValue = useMemo<ConflictsContextValue>(
		() => ({ conflicts, dismissConflict, clearConflicts }),
		[conflicts, dismissConflict, clearConflicts],
	);

	const cursorVisibilityValue = useMemo<CursorVisibilityContextValue>(
		() => ({ showRemoteCursors, setShowRemoteCursors }),
		[showRemoteCursors],
	);

	return (
		<AdapterContext.Provider value={adapter}>
			<IdentityContext.Provider value={identityValue}>
				<StatusContext.Provider value={status}>
					<PeersContext.Provider value={peers}>
						<ConflictsContext.Provider value={conflictsValue}>
							<CursorVisibilityContext.Provider value={cursorVisibilityValue}>
								{children}
							</CursorVisibilityContext.Provider>
						</ConflictsContext.Provider>
					</PeersContext.Provider>
				</StatusContext.Provider>
			</IdentityContext.Provider>
		</AdapterContext.Provider>
	);
}

function useRequired<T>(ctx: T | null, hook: string): T {
	if (ctx === null) {
		throw new Error(`${hook} must be called inside <CollabUIProvider>.`);
	}
	return ctx;
}

export function useCollabAdapter(): YjsSnapshotAdapter {
	return useRequired(useContext(AdapterContext), "useCollabAdapter");
}

export function useCollabStatus(): ConnectionStatus {
	return useRequired(useContext(StatusContext), "useCollabStatus");
}

export function useCollabPeers(): readonly PresenceState[] {
	return useRequired(useContext(PeersContext), "useCollabPeers");
}

export function useCollabSelf(): PeerInfo {
	return useRequired(useContext(IdentityContext), "useCollabSelf").self;
}

/**
 * Identity tuple `{ self, updateSelf }`. Reads only `IdentityContext`,
 * so consumers do not re-render on cursor / status / conflict churn.
 */
export function useCollabIdentity(): IdentityContextValue {
	return useRequired(useContext(IdentityContext), "useCollabIdentity");
}

export function useCollabConflicts(): readonly ConflictEvent[] {
	return useRequired(useContext(ConflictsContext), "useCollabConflicts")
		.conflicts;
}

/**
 * Conflict queue plus its mutators. Reads only `ConflictsContext`.
 */
export function useCollabConflictQueue(): ConflictsContextValue {
	return useRequired(useContext(ConflictsContext), "useCollabConflictQueue");
}

/**
 * Shared remote-cursor visibility state (review §C3 / §4.3). The
 * bundled settings popover writes it; the bundled presence overlay
 * reads it.
 */
export function useCollabCursorVisibility(): CursorVisibilityContextValue {
	return useRequired(
		useContext(CursorVisibilityContext),
		"useCollabCursorVisibility",
	);
}

/**
 * Poll `adapter.metrics()` on an interval (review §C5 / §4.5).
 *
 * Returns the latest {@link MetricsSnapshot}, or `null` when the
 * adapter does not expose `metrics()`. The interval is cleared on
 * unmount and re-established if `adapter` or `pollMs` change.
 */
export function useCollabMetrics(pollMs = 5000): MetricsSnapshot | null {
	const adapter = useCollabAdapter();
	const [metrics, setMetrics] = useState<MetricsSnapshot | null>(() =>
		typeof adapter.metrics === "function" ? adapter.metrics() : null,
	);
	useEffect(() => {
		if (typeof adapter.metrics !== "function") {
			setMetrics(null);
			return;
		}
		const read = (): void => setMetrics(adapter.metrics());
		read();
		const id = setInterval(read, pollMs);
		return () => clearInterval(id);
	}, [adapter, pollMs]);
	return metrics;
}

/**
 * Back-compat composite hook. Returns the full
 * {@link CollabUIContextValue}. Prefer the narrow hooks
 * (`useCollabStatus`, `useCollabPeers`, …) in components — this hook
 * re-renders on **any** collab state change by design.
 */
export function useCollabContext(): CollabUIContextValue {
	const adapter = useCollabAdapter();
	const { self, updateSelf } = useCollabIdentity();
	const status = useCollabStatus();
	const peers = useCollabPeers();
	const { conflicts, dismissConflict, clearConflicts } =
		useCollabConflictQueue();
	const { showRemoteCursors, setShowRemoteCursors } =
		useCollabCursorVisibility();
	return useMemo<CollabUIContextValue>(
		() => ({
			adapter,
			self,
			status,
			peers,
			conflicts,
			dismissConflict,
			clearConflicts,
			updateSelf,
			showRemoteCursors,
			setShowRemoteCursors,
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
			showRemoteCursors,
			setShowRemoteCursors,
		],
	);
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
