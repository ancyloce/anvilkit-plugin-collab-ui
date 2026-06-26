import type { PresenceState } from "@anvilkit/plugin-version-history";

/**
 * Default ceiling on the TOTAL number of remote selection rings rendered
 * across all peers at once (review M4 / report 4.2.4).
 *
 * Each ring is a positioned overlay element whose rect comes from a
 * synchronous `getBoundingClientRect()` read. A pathological room — many peers
 * each multi-selecting many nodes — would otherwise mount `peers × nodes`
 * overlay DOM nodes without bound. Typical rooms sit far below this, so the cap
 * is inert until a room turns pathological; past it, the first `max` rings in
 * deterministic peer-then-node order survive and the rest are dropped. Mirrors
 * the cursor budget (`DEFAULT_MAX_CURSORS`) but counts the TOTAL, not per peer —
 * a per-peer cap still permits unbounded total DOM.
 */
export const DEFAULT_MAX_SELECTION_RINGS = 50;

/** A single (peer, selected node) pair that should render a selection ring. */
export interface SelectionRingTarget {
	readonly peerId: string;
	readonly nodeId: string;
}

/**
 * Flatten every peer's selected node ids into one `(peer, node)` list and cap
 * the TOTAL to `max` (review M4 / report 4.2.4).
 *
 * Ordering is deterministic: peers are walked in the order the awareness layer
 * reports them, and each peer's `selection.nodeIds` in their declared order, so
 * the surviving rings are the first `max` of that flattened sequence. This
 * matches `<PeerSelectionRings>` slicing each peer's selection from the front,
 * keeping the rendered rings consistent with this cap.
 *
 * - Under the cap: returns every `(peer, node)` pair (fast path; cap is inert).
 * - Over the cap: returns exactly `max` pairs, biased to the earliest peers.
 * - `max <= 0`: returns an empty list.
 *
 * Pure — reads nothing and mutates nothing outside its arguments.
 */
export function capSelectionRings(
	peers: readonly PresenceState[],
	max: number,
): SelectionRingTarget[] {
	if (max <= 0) return [];
	const rings: SelectionRingTarget[] = [];
	for (const frame of peers) {
		const nodeIds = frame.selection?.nodeIds;
		if (!nodeIds) continue;
		for (const nodeId of nodeIds) {
			rings.push({ peerId: frame.peer.id, nodeId });
			if (rings.length >= max) return rings;
		}
	}
	return rings;
}
