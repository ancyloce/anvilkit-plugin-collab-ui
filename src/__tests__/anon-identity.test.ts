import { describe, expect, it } from "vitest";

import {
	colorForId,
	makeAnonSelf,
	resolveDisplayName,
} from "../lib/anon-identity.js";

describe("makeAnonSelf", () => {
	it("generates an anon-prefixed id, the Anonymous name, and a hex color", () => {
		const self = makeAnonSelf();
		expect(self.id).toMatch(/^anon-/);
		expect(self.displayName).toBe("Anonymous");
		// Hex (not HSL): the provider's normalizeHexColor only accepts hex.
		expect(self.color).toMatch(/^#[0-9a-f]{6}$/);
	});

	it("produces unique ids across calls", () => {
		expect(makeAnonSelf().id).not.toBe(makeAnonSelf().id);
	});

	it("accepts a host-supplied (already-localized) display name", () => {
		expect(makeAnonSelf("匿名").displayName).toBe("匿名");
	});
});

describe("resolveDisplayName (review U3)", () => {
	it("substitutes the localized label for a default anonymous peer", () => {
		const self = makeAnonSelf();
		expect(resolveDisplayName(self, "匿名")).toBe("匿名");
	});

	it("keeps a renamed anonymous peer's chosen name", () => {
		// Same anon-prefixed id, but a custom name → not the default sentinel.
		const renamed = { id: "anon-abc", displayName: "Alice" };
		expect(resolveDisplayName(renamed, "匿名")).toBe("Alice");
	});

	it("returns a named peer's name verbatim", () => {
		expect(
			resolveDisplayName({ id: "alice", displayName: "Alice" }, "匿名"),
		).toBe("Alice");
	});

	it("returns undefined for a non-anonymous peer with no name", () => {
		expect(resolveDisplayName({ id: "alice" }, "匿名")).toBeUndefined();
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
