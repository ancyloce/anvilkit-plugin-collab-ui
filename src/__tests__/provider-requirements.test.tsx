import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { render, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SyncActivityIndicator } from "../components/sync-activity-indicator.js";
import {
	useCollabAdapter,
	useCollabContext,
	useCollabStatus,
} from "../context.js";

/**
 * Locks the provider-requirement contract documented in the README's
 * "Provider requirements" section (report 4.3.3):
 *
 *  1. Every hook / component reads collab context and THROWS synchronously when
 *     mounted outside `<CollabUIProvider>` (there is no built-in error
 *     boundary).
 *  2. The README documents this requirement AND the standalone-only
 *     `<CollabUII18nProvider>` requirement for localized copy outside `<Studio>`.
 *
 * The doc-assertion test is the red→green regression guard: it FAILS against a
 * README that lacks the requirements section and PASSES once it is present.
 */
describe("provider requirements — behavior", () => {
	it("throws when a context hook is called outside <CollabUIProvider>", () => {
		expect(() => renderHook(() => useCollabContext())).toThrow(
			/must be called inside <CollabUIProvider>/,
		);
		expect(() => renderHook(() => useCollabStatus())).toThrow(
			/must be called inside <CollabUIProvider>/,
		);
		expect(() => renderHook(() => useCollabAdapter())).toThrow(
			/must be called inside <CollabUIProvider>/,
		);
	});

	it("throws when a component is rendered outside <CollabUIProvider>", () => {
		expect(() => render(<SyncActivityIndicator />)).toThrow(
			/must be called inside <CollabUIProvider>/,
		);
	});
});

describe("provider requirements — documentation", () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const readmePath = resolve(here, "../../README.md");
	const readme = readFileSync(readmePath, "utf8");

	/**
	 * Extract the body of the "Provider requirements" section (any `##`/`###`
	 * heading) up to the next markdown heading. Couples the assertions to the
	 * dedicated section so removing the section turns the test red.
	 */
	function providerRequirementsSection(): string {
		const lines = readme.split("\n");
		const startIdx = lines.findIndex((line) =>
			/^#{2,3}\s+Provider requirements\s*$/.test(line),
		);
		if (startIdx === -1) return "";
		const body: string[] = [];
		for (let i = startIdx + 1; i < lines.length; i++) {
			const line = lines[i] ?? "";
			if (/^#{1,6}\s/.test(line)) break;
			body.push(line);
		}
		return body.join("\n");
	}

	it("documents the requirements in a dedicated section", () => {
		const section = providerRequirementsSection();
		expect(section).not.toBe("");
		// (a) hooks/components require CollabUIProvider and throw otherwise.
		expect(section).toContain("CollabUIProvider");
		expect(section).toMatch(/throw/i);
		// (b) standalone-only i18n provider requirement for localized copy.
		expect(section).toContain("CollabUII18nProvider");
	});

	it("ties the i18n requirement to standalone / outside-Studio use", () => {
		const section = providerRequirementsSection();
		expect(section).toMatch(/standalone|outside (a )?`?<?Studio/i);
	});
});
