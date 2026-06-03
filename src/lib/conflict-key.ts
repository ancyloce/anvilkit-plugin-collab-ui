import type { ConflictEvent } from "@anvilkit/plugin-collab-yjs";

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
 * both. Mirrors `peerIdentitySignature`'s collision-proof keying.
 */
export function conflictKey(event: ConflictEvent): string {
	return JSON.stringify([
		event.at,
		event.localPeer.id,
		event.remotePeer?.id ?? null,
		event.nodeIds,
	]);
}
