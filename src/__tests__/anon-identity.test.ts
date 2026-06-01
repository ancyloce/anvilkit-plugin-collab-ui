import { describe, expect, it } from "vitest";

import { colorForId, makeAnonSelf } from "../lib/anon-identity.js";

describe("makeAnonSelf", () => {
	it("generates an anon-prefixed id, the Anonymous name, and a hex color", () => {
		const self = makeAnonSelf();
		expect(self.id).toMatch(/^anon-/);
		expect(self.displayName).toBe("Anonymous");
		// Hex (not HSL): the provider's normalizeColor only accepts hex.
		expect(self.color).toMatch(/^#[0-9a-f]{6}$/);
	});

	it("produces unique ids across calls", () => {
		expect(makeAnonSelf().id).not.toBe(makeAnonSelf().id);
	});
});

describe("colorForId", () => {
	it("is deterministic — same id maps to the same color", () => {
		expect(colorForId("alice")).toBe(colorForId("alice"));
		expect(colorForId("anon-1234")).toBe(colorForId("anon-1234"));
	});

	it("returns a valid hex color for any input", () => {
		for (const id of ["", "a", "alice", "anon-deadbeef", "🦊"]) {
			expect(colorForId(id)).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});
