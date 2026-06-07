import type { PresenceState } from "@anvilkit/plugin-version-history";
import { describe, expect, it } from "vitest";

import {
	createCursorBudgetState,
	DEFAULT_MAX_CURSORS,
	selectCursorPeers,
} from "../lib/cursor-budget.js";

function peer(id: string, cursor?: { x: number; y: number }): PresenceState {
	return cursor ? { peer: { id }, cursor } : { peer: { id } };
}

describe("selectCursorPeers (review U1)", () => {
	it("returns every cursor-bearing peer when the room fits under the cap", () => {
		const state = createCursorBudgetState();
		const ids = selectCursorPeers(
			[peer("a", { x: 1, y: 0 }), peer("b", { x: 2, y: 0 })],
			DEFAULT_MAX_CURSORS,
			state,
		);
		expect([...ids].sort()).toEqual(["a", "b"]);
	});

	it("excludes peers without a cursor even under the cap", () => {
		const state = createCursorBudgetState();
		const ids = selectCursorPeers(
			[peer("a", { x: 1, y: 0 }), peer("b") /* selection-only */],
			DEFAULT_MAX_CURSORS,
			state,
		);
		expect([...ids]).toEqual(["a"]);
	});

	it("returns an empty set when max <= 0 (cursors toggled off)", () => {
		const state = createCursorBudgetState();
		const ids = selectCursorPeers([peer("a", { x: 1, y: 0 })], 0, state);
		expect(ids.size).toBe(0);
		// Recency is cleared so a later re-enable starts fresh.
		expect(state.recency.size).toBe(0);
	});

	it("keeps exactly `max` cursors when the room exceeds the budget", () => {
		const state = createCursorBudgetState();
		const ids = selectCursorPeers(
			[
				peer("a", { x: 1, y: 0 }),
				peer("b", { x: 2, y: 0 }),
				peer("c", { x: 3, y: 0 }),
				peer("d", { x: 4, y: 0 }),
			],
			2,
			state,
		);
		expect(ids.size).toBe(2);
		// Seeded in order a,b,c,d → most-recent stamps are c and d.
		expect([...ids].sort()).toEqual(["c", "d"]);
	});

	it("prefers the most-recently-moved cursors, not an arbitrary slice", () => {
		const state = createCursorBudgetState();
		const frames = [
			peer("a", { x: 1, y: 0 }),
			peer("b", { x: 2, y: 0 }),
			peer("c", { x: 3, y: 0 }),
			peer("d", { x: 4, y: 0 }),
		];
		// First pass seeds a<b<c<d → {c,d} are freshest.
		expect([...selectCursorPeers(frames, 2, state)].sort()).toEqual(["c", "d"]);

		// `a` now moves (new coords); b/c/d unchanged (identical coords → no
		// new recency stamp). `a` becomes the freshest and displaces the
		// least-recent kept cursor.
		const moved = [
			peer("a", { x: 9, y: 9 }),
			peer("b", { x: 2, y: 0 }),
			peer("c", { x: 3, y: 0 }),
			peer("d", { x: 4, y: 0 }),
		];
		expect([...selectCursorPeers(moved, 2, state)].sort()).toEqual(["a", "d"]);
	});

	it("prunes peers that leave or drop their cursor so recency stays bounded", () => {
		const state = createCursorBudgetState();
		selectCursorPeers(
			[peer("a", { x: 1, y: 0 }), peer("b", { x: 2, y: 0 })],
			5,
			state,
		);
		expect(state.recency.size).toBe(2);

		// `a` leaves, `c` joins. The map must drop `a`, not accumulate it.
		const ids = selectCursorPeers(
			[peer("b", { x: 2, y: 0 }), peer("c", { x: 3, y: 0 })],
			5,
			state,
		);
		expect([...ids].sort()).toEqual(["b", "c"]);
		expect(state.recency.size).toBe(2);
		expect(state.recency.has("a")).toBe(false);
	});
});
