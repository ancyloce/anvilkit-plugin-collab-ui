import type { PresenceState } from "@anvilkit/plugin-version-history";
import { describe, expect, it } from "vitest";

import {
	capSelectionRings,
	DEFAULT_MAX_SELECTION_RINGS,
} from "../lib/selection-ring-budget.js";

function peer(id: string, nodeIds?: readonly string[]): PresenceState {
	return nodeIds ? { peer: { id }, selection: { nodeIds } } : { peer: { id } };
}

/** P peers each selecting N nodes, ids `p<i>` and `p<i>n<j>`. */
function grid(peers: number, nodes: number): PresenceState[] {
	return Array.from({ length: peers }, (_, i) =>
		peer(
			`p${i}`,
			Array.from({ length: nodes }, (_, j) => `p${i}n${j}`),
		),
	);
}

describe("capSelectionRings (review M4 / report 4.2.4)", () => {
	it("returns every (peer, node) ring when the total is under the cap", () => {
		const rings = capSelectionRings(grid(3, 2), DEFAULT_MAX_SELECTION_RINGS);
		expect(rings).toHaveLength(6);
		expect(rings.map((r) => `${r.peerId}:${r.nodeId}`)).toEqual([
			"p0:p0n0",
			"p0:p0n1",
			"p1:p1n0",
			"p1:p1n1",
			"p2:p2n0",
			"p2:p2n1",
		]);
	});

	it("caps the TOTAL rings across ALL peers, not per peer", () => {
		// 4 peers x 3 nodes = 12 candidate rings; cap 5. A per-peer cap of 5
		// would let every peer render all 3 (total 12) — this asserts the global
		// total is exactly 5, so a per-peer-only cap would FAIL this test.
		const rings = capSelectionRings(grid(4, 3), 5);
		expect(rings).toHaveLength(5);
		expect(rings.map((r) => `${r.peerId}:${r.nodeId}`)).toEqual([
			"p0:p0n0",
			"p0:p0n1",
			"p0:p0n2",
			"p1:p1n0",
			"p1:p1n1",
		]);
	});

	it("is deterministic in peer-then-node order at the cap boundary", () => {
		// 30 peers x 4 nodes = 120 candidates, default cap 50 → exactly 50, and
		// the surviving set is the first 50 of peer-then-node order.
		const rings = capSelectionRings(grid(30, 4), DEFAULT_MAX_SELECTION_RINGS);
		expect(rings).toHaveLength(50);
		// 50 / 4 = 12 full peers (48) + first 2 nodes of peer 12.
		expect(rings[47]).toEqual({ peerId: "p11", nodeId: "p11n3" });
		expect(rings[48]).toEqual({ peerId: "p12", nodeId: "p12n0" });
		expect(rings[49]).toEqual({ peerId: "p12", nodeId: "p12n1" });
	});

	it("returns an empty list when max <= 0 (rings rendered off)", () => {
		expect(capSelectionRings(grid(3, 2), 0)).toEqual([]);
		expect(capSelectionRings(grid(3, 2), -1)).toEqual([]);
	});

	it("skips peers without a selection", () => {
		const rings = capSelectionRings(
			[peer("a", ["x"]), peer("b"), peer("c", ["y", "z"])],
			DEFAULT_MAX_SELECTION_RINGS,
		);
		expect(rings.map((r) => r.peerId)).toEqual(["a", "c", "c"]);
	});
});
