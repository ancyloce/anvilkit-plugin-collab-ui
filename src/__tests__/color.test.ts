import { describe, expect, it } from "vitest";

import { normalizeHexColor } from "../lib/color.js";

describe("normalizeHexColor (review U4)", () => {
	it("passes valid #rgb / #rrggbb / #rrggbbaa through (trimmed)", () => {
		expect(normalizeHexColor("#abc", "#000000")).toBe("#abc");
		expect(normalizeHexColor("#3b82f6", "#000000")).toBe("#3b82f6");
		expect(normalizeHexColor("#3b82f6ff", "#000000")).toBe("#3b82f6ff");
		expect(normalizeHexColor("  #3b82f6  ", "#000000")).toBe("#3b82f6");
	});

	it("falls back for a malformed hex value (e.g. #zzz)", () => {
		// The old popover normalizer passed any leading-# string through; this
		// must reject invalid hex instead of rendering a broken swatch.
		expect(normalizeHexColor("#zzz", "#3b82f6")).toBe("#3b82f6");
		expect(normalizeHexColor("#12", "#3b82f6")).toBe("#3b82f6");
		expect(normalizeHexColor("#12345", "#3b82f6")).toBe("#3b82f6");
	});

	it("falls back for non-hex color syntaxes and empty/undefined input", () => {
		expect(normalizeHexColor("rgb(255,0,0)", "#3b82f6")).toBe("#3b82f6");
		expect(normalizeHexColor("red", "#3b82f6")).toBe("#3b82f6");
		expect(normalizeHexColor("", "#3b82f6")).toBe("#3b82f6");
		expect(normalizeHexColor(undefined, "#3b82f6")).toBe("#3b82f6");
	});

	it("preserves an undefined fallback (provider edit path)", () => {
		expect(normalizeHexColor("not-a-color", undefined)).toBeUndefined();
	});
});
