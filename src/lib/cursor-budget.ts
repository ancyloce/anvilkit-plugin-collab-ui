import type { PresenceState } from "@anvilkit/plugin-version-history";

/**
 * Default ceiling on simultaneously rendered remote cursors (review U1).
 *
 * Each `<RemoteCursor>` mounts two `motion` springs (each an rAF loop), so an
 * uncapped room of N concurrently moving peers drives ~2N animation loops plus
 * per-frame style writes. Typical rooms sit well under this, so the cap is
 * inert until a room gets large; past it, only the most-recently-moved cursors
 * animate. You can rarely track more than a couple dozen moving cursors at once
 * anyway, so the dropped ones cost nothing visible.
 */
export const DEFAULT_MAX_CURSORS = 24;

const EMPTY_CURSOR_IDS: ReadonlySet<string> = new Set();

interface CursorRecord {
	/** Last observed cursor position, as a cheap "x,y" signature. */
	readonly sig: string;
	/** Monotonic sequence stamped whenever `sig` changed (higher = more recent). */
	readonly seq: number;
}

/**
 * Caller-owned recency scratch state for {@link selectCursorPeers}. The React
 * hook holds one in a ref so recency survives across renders; it is passed in
 * explicitly so the selection logic itself stays a pure, unit-testable
 * function.
 */
export interface CursorBudgetState {
	seq: number;
	readonly recency: Map<string, CursorRecord>;
}

export function createCursorBudgetState(): CursorBudgetState {
	return { seq: 0, recency: new Map() };
}

function cursorSignature(cursor: PresenceState["cursor"]): string {
	return cursor ? `${cursor.x},${cursor.y}` : "";
}

/**
 * Choose which peers may render a live cursor, capped to `max` (review U1).
 *
 * - Under the cap: returns every cursor-bearing peer (fast path — the cap is
 *   inert for typical rooms). Peers without a cursor are always excluded.
 * - Over the cap: returns the `max` **most-recently-moved** cursor peers, so an
 *   idle peer never displaces one the user can actually see moving. A plain
 *   `slice` would pin an arbitrary subset; recency keeps the visible set the
 *   active one and minimises mount/unmount churn at the boundary.
 * - `max <= 0`: returns an empty set (used when cursors are toggled off).
 *
 * Mutates `state` to track per-peer move recency and to prune peers that left
 * the room or dropped their cursor, so the recency map can never outgrow the
 * live peer set. Pure aside from that caller-owned scratch state.
 */
export function selectCursorPeers(
	peers: readonly PresenceState[],
	max: number,
	state: CursorBudgetState,
): ReadonlySet<string> {
	if (max <= 0) {
		state.recency.clear();
		return EMPTY_CURSOR_IDS;
	}

	const live = new Set<string>();
	for (const frame of peers) {
		if (!frame.cursor) continue;
		const id = frame.peer.id;
		live.add(id);
		const sig = cursorSignature(frame.cursor);
		const prev = state.recency.get(id);
		if (prev === undefined || prev.sig !== sig) {
			state.seq += 1;
			state.recency.set(id, { sig, seq: state.seq });
		}
	}

	// Prune peers that left the room or dropped their cursor. We always record
	// before pruning, so a simultaneous leave+join makes the map larger than
	// `live` and this branch runs — keeping the map bounded by the peer count.
	if (state.recency.size > live.size) {
		for (const id of state.recency.keys()) {
			if (!live.has(id)) state.recency.delete(id);
		}
	}

	if (live.size <= max) return live;

	// Over budget: keep the `max` highest (most recent) sequence stamps. Every
	// live id has a record from the loop above, so the `?? 0` is only defensive.
	const ranked = [...live].sort(
		(a, b) =>
			(state.recency.get(b)?.seq ?? 0) - (state.recency.get(a)?.seq ?? 0),
	);
	const kept = new Set<string>();
	for (let i = 0; i < max; i += 1) {
		const id = ranked[i];
		if (id !== undefined) kept.add(id);
	}
	return kept;
}
