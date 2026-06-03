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
	use,
	useCallback,
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

/**
 * Upper bound on the provider's retained conflict window (F8). The
 * bundled `<ConflictNoticeCenter>` auto-closes toasts, but a host that
 * reads `useCollabConflicts()` for a custom panel (no toaster) would
 * otherwise grow the array for the whole session. Kept as a recent
 * window of the newest events.
 */
const MAX_CONFLICTS = 50;

/**
 * Stable identity for a conflict event. Composite (not the bare ISO
 * `at`) because two overlap conflicts can share a timestamp within one
 * tick — see M1 / review §C6. Used both as the sonner toast id and as
 * the `dismissConflict` key, so dismissing one never drops a
 * co-timestamped sibling unacknowledged.
 *
 * Encoded with `JSON.stringify` over a tuple (not `:`/`|` concatenation)
 * so a host-supplied peer id or a node id containing the separator char
 * cannot alias two genuinely-distinct conflicts into one key — which
 * would otherwise suppress the second toast and let one dismiss drop
 * both. Mirrors {@link peerIdentitySignature}'s collision-proof keying.
 */
export function conflictKey(event: ConflictEvent): string {
	return JSON.stringify([
		event.at,
		event.localPeer.id,
		event.remotePeer?.id ?? null,
		event.nodeIds,
	]);
}

export interface CollabUIContextValue {
	readonly adapter: YjsSnapshotAdapter;
	readonly self: PeerInfo;
	readonly status: ConnectionStatus;
	readonly peers: readonly PresenceState[];
	readonly conflicts: readonly ConflictEvent[];
	/**
	 * Dismiss a single conflict by its composite {@link conflictKey}.
	 * Keying by the bare ISO `at` would drop every co-timestamped
	 * conflict emitted in the same tick (M1).
	 */
	readonly dismissConflict: (key: string) => void;
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

// Roster-only peer identities (F5). The value reference changes only
// when the *set* of peer id/displayName/color changes — never on a
// cursor/selection-only frame — so `<PeerAvatarStack>` and other
// identity-only consumers skip cursor-churn re-renders.
const PeerIdentitiesContext = createContext<readonly PeerInfo[] | null>(null);

interface ConflictsContextValue {
	readonly conflicts: readonly ConflictEvent[];
	readonly dismissConflict: (key: string) => void;
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
	// `self` is the host's `selfProp` plus any local override applied via
	// `updateSelf` (the settings popover). The override is tagged with the
	// `selfProp` signature it was taken under, so a host identity change makes
	// it stale and `self` derives back to `selfProp` — the same reset the old
	// prop→state effect performed, without copying a prop into state.
	const [selfOverride, setSelfOverride] = useState<{
		readonly sig: string;
		readonly displayName?: string;
		readonly color?: string;
	} | null>(null);
	const [peers, setPeers] = useState<readonly PresenceState[]>([]);
	const [conflicts, setConflicts] = useState<readonly ConflictEvent[]>([]);
	const [showRemoteCursors, setShowRemoteCursors] = useState(true);

	// Collision-proof tuple key (mirrors `conflictKey` /
	// `peerIdentitySignature`): a separator char in a host id/displayName
	// must not alias two distinct identities into the same signature.
	const selfPropSig = JSON.stringify([
		selfProp.id,
		selfProp.displayName,
		selfProp.color,
	]);
	const self = useMemo<PeerInfo>(() => {
		const valid = selfOverride !== null && selfOverride.sig === selfPropSig;
		return {
			id: selfProp.id,
			displayName:
				valid && selfOverride.displayName !== undefined
					? selfOverride.displayName
					: selfProp.displayName,
			color:
				valid && selfOverride.color !== undefined
					? selfOverride.color
					: selfProp.color,
		};
	}, [
		selfProp.id,
		selfProp.displayName,
		selfProp.color,
		selfPropSig,
		selfOverride,
	]);

	const selfRef = useRef(self);
	selfRef.current = self;
	const selfPropSigRef = useRef(selfPropSig);
	selfPropSigRef.current = selfPropSig;

	const status = useExternalStatus(adapter);

	// F5 — derive a roster-only identity list whose reference only
	// changes when the id/displayName/color *set* changes, so avatar /
	// identity consumers don't re-render on cursor-only frames. (Computing
	// derived state into a ref during render is a standard cache pattern —
	// no external side effect.)
	const identitySigRef = useRef<string | undefined>(undefined);
	const identitiesRef = useRef<readonly PeerInfo[]>([]);
	const identitySig = peerIdentitySignature(peers);
	if (identitySigRef.current !== identitySig) {
		identitySigRef.current = identitySig;
		identitiesRef.current = peers.map((frame) => frame.peer);
	}
	const peerIdentities = identitiesRef.current;

	useEffect(() => {
		const unsub = adapter.onConflict((event) => {
			// F8 — retain only the most-recent window so a host reading
			// `useCollabConflicts()` for a custom panel (no auto-closing
			// toaster) cannot grow this unbounded for the session.
			setConflicts((prev) => {
				const next = [...prev, event];
				return next.length > MAX_CONFLICTS
					? next.slice(next.length - MAX_CONFLICTS)
					: next;
			});
		});
		return () => unsub();
	}, [adapter]);

	useEffect(() => {
		const presence = adapter.presence;
		if (!presence) return;
		const unsub = presence.onPeerChange((next) => {
			// F2 — keep `PeersContext` identity stable on no-op frames.
			// `dedupeRemotePeers` always allocates a fresh array, so
			// without this bail every coalesced inbound frame (H1) would
			// change the context value and re-render every
			// `useCollabPeers()` consumer even when no peer datum changed.
			setPeers((prev) => {
				const deduped = dedupeRemotePeers(next, selfRef.current.id);
				return peersShallowEqual(prev, deduped) ? prev : deduped;
			});
		});
		return () => unsub();
	}, [adapter]);

	useEffect(() => {
		// Mirror the current local identity into the awareness channel so
		// other peers see joins and settings changes even before a cursor
		// move or selection update.
		adapter.presence?.update({ peer: self });
	}, [adapter, self]);

	const dismissConflict = useCallback((key: string) => {
		// M1 — filter by the SAME composite key the toaster builds, not the
		// bare ISO `at`. Two overlap conflicts can share an `at` in one
		// tick; keying by `at` alone deletes the co-timestamped sibling
		// unacknowledged.
		setConflicts((prev) => prev.filter((event) => conflictKey(event) !== key));
	}, []);

	const clearConflicts = useCallback(() => {
		setConflicts([]);
	}, []);

	const updateSelf = useCallback((patch: Partial<CollabSelf>) => {
		// Snapshot the current effective identity, apply the patch, and tag it
		// with the live `selfProp` signature so a later host identity change
		// evicts this override (see the `self` derivation above).
		const current = selfRef.current;
		setSelfOverride({
			sig: selfPropSigRef.current,
			displayName: patch.displayName ?? current.displayName,
			color:
				patch.color !== undefined
					? normalizeColor(patch.color, current.color)
					: current.color,
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
		<AdapterContext value={adapter}>
			<IdentityContext value={identityValue}>
				<StatusContext value={status}>
					<PeersContext value={peers}>
						<PeerIdentitiesContext value={peerIdentities}>
							<ConflictsContext value={conflictsValue}>
								<CursorVisibilityContext value={cursorVisibilityValue}>
									{children}
								</CursorVisibilityContext>
							</ConflictsContext>
						</PeerIdentitiesContext>
					</PeersContext>
				</StatusContext>
			</IdentityContext>
		</AdapterContext>
	);
}

function useRequired<T>(ctx: T | null, hook: string): T {
	if (ctx === null) {
		throw new Error(`${hook} must be called inside <CollabUIProvider>.`);
	}
	return ctx;
}

export function useCollabAdapter(): YjsSnapshotAdapter {
	return useRequired(use(AdapterContext), "useCollabAdapter");
}

export function useCollabStatus(): ConnectionStatus {
	return useRequired(use(StatusContext), "useCollabStatus");
}

export function useCollabPeers(): readonly PresenceState[] {
	return useRequired(use(PeersContext), "useCollabPeers");
}

/**
 * Roster-only peer identities (id/displayName/color). The returned
 * array reference only changes when the *set* of identities changes —
 * not on cursor / selection frames (F5) — so identity-only consumers
 * like `<PeerAvatarStack>` skip cursor-churn re-renders. Excludes the
 * local peer (mirrors `useCollabPeers()`).
 */
export function useCollabPeerIdentities(): readonly PeerInfo[] {
	return useRequired(use(PeerIdentitiesContext), "useCollabPeerIdentities");
}

export function useCollabSelf(): PeerInfo {
	return useRequired(use(IdentityContext), "useCollabSelf").self;
}

/**
 * Identity tuple `{ self, updateSelf }`. Reads only `IdentityContext`,
 * so consumers do not re-render on cursor / status / conflict churn.
 */
export function useCollabIdentity(): IdentityContextValue {
	return useRequired(use(IdentityContext), "useCollabIdentity");
}

export function useCollabConflicts(): readonly ConflictEvent[] {
	return useRequired(use(ConflictsContext), "useCollabConflicts").conflicts;
}

/**
 * Conflict queue plus its mutators. Reads only `ConflictsContext`.
 */
export function useCollabConflictQueue(): ConflictsContextValue {
	return useRequired(use(ConflictsContext), "useCollabConflictQueue");
}

/**
 * Shared remote-cursor visibility state (review §C3 / §4.3). The
 * bundled settings popover writes it; the bundled presence overlay
 * reads it.
 */
export function useCollabCursorVisibility(): CursorVisibilityContextValue {
	return useRequired(use(CursorVisibilityContext), "useCollabCursorVisibility");
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
		const read = (): void =>
			setMetrics((prev) => {
				const next = adapter.metrics();
				// F7 — `metrics.snapshot()` allocates a fresh object every
				// call, so without this value-equality bail every poll re-
				// renders `SyncActivityIndicator` even when nothing changed
				// (the inconsistent sibling of the store-backed status path).
				return prev !== null && metricsShallowEqual(prev, next) ? prev : next;
			});
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
	// F6 — fast path for the common one-tab-per-user room: a single scan
	// that drops self and detects duplicate logical ids. The awareness
	// bridge already deduped by transport clientId, so a logical-id
	// collision (same user in multiple tabs) is rare; only then do we pay
	// for the merging `Map` below.
	const out: PresenceState[] = [];
	const seen = new Set<string>();
	let collision = false;
	for (const frame of peers) {
		const { id } = frame.peer;
		if (id === selfId) continue;
		if (seen.has(id)) {
			collision = true;
			break;
		}
		seen.add(id);
		out.push(frame);
	}
	if (!collision) return out;

	const byId = new Map<string, PresenceState>();
	for (const frame of peers) {
		const { id } = frame.peer;
		if (id === selfId) continue;
		const prev = byId.get(id);
		if (!prev) {
			byId.set(id, frame);
			continue;
		}
		byId.set(id, {
			peer: { ...prev.peer, ...frame.peer },
			cursor: frame.cursor ?? prev.cursor,
			selection: frame.selection ?? prev.selection,
		});
	}
	return Array.from(byId.values());
}

/**
 * F2 — shallow value-equality over the fields the presence UI renders
 * (id/displayName/color, cursor x/y, selection nodeIds). Lets the
 * `setPeers` updater preserve the previous array reference on no-op
 * inbound frames so `PeersContext` consumers don't re-render.
 */
function peersShallowEqual(
	a: readonly PresenceState[],
	b: readonly PresenceState[],
): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		const y = b[i];
		if (x === undefined || y === undefined) return false;
		if (
			x.peer.id !== y.peer.id ||
			x.peer.displayName !== y.peer.displayName ||
			x.peer.color !== y.peer.color
		) {
			return false;
		}
		if ((x.cursor?.x ?? null) !== (y.cursor?.x ?? null)) return false;
		if ((x.cursor?.y ?? null) !== (y.cursor?.y ?? null)) return false;
		const xs = x.selection?.nodeIds;
		const ys = y.selection?.nodeIds;
		if ((xs?.length ?? 0) !== (ys?.length ?? 0)) return false;
		if (xs && ys) {
			for (let j = 0; j < xs.length; j++) {
				if (xs[j] !== ys[j]) return false;
			}
		}
	}
	return true;
}

/**
 * F5 — a stable signature over the roster's id/displayName/color so the
 * provider can reuse the previous identities array reference across
 * cursor-only frames.
 */
function peerIdentitySignature(peers: readonly PresenceState[]): string {
	// JSON-encode so a user-controlled `displayName` containing the field
	// separator can't alias two distinct rosters into one signature.
	const parts: [string, string | null, string | null][] = [];
	for (const frame of peers) {
		parts.push([
			frame.peer.id,
			frame.peer.displayName ?? null,
			frame.peer.color ?? null,
		]);
	}
	return JSON.stringify(parts);
}

/**
 * F7 — value-equality over a {@link MetricsSnapshot} (flat numbers /
 * booleans plus the `degradedReasons` string array), so the metrics
 * poll can preserve the previous reference when nothing changed.
 */
function metricsShallowEqual(a: MetricsSnapshot, b: MetricsSnapshot): boolean {
	const keys = Object.keys(a) as (keyof MetricsSnapshot)[];
	if (keys.length !== Object.keys(b).length) return false;
	for (const key of keys) {
		const av = a[key];
		const bv = b[key];
		if (Array.isArray(av) && Array.isArray(bv)) {
			if (av.length !== bv.length) return false;
			for (let i = 0; i < av.length; i++) {
				if (av[i] !== bv[i]) return false;
			}
			continue;
		}
		if (av !== bv) return false;
	}
	return true;
}
