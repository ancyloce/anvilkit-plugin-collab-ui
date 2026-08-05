/**
 * @file PLAN-0025 Phase 3.5 (P3.5-05) — Puck-native v2 compliance for
 * the collab UI: the per-package §15-gate-3 source scan (no sidecar /
 * sidecar editor commands). The UI layer holds presence/room chrome
 * only — document merge semantics live in `plugin-collab-yjs`, pinned
 * by its own compliance suite.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN = [
	"__anvilkit",
	"readAuthoringState",
	"writeAuthoringState",
	"ANVILKIT_AUTHORING_KEY",
	"EditorCommandPort",
	"applyEditorCommand",
	'"replaceRoot"',
] as const;

function sourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "__tests__") continue;
			files.push(...sourceFiles(path));
			continue;
		}
		if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
	}
	return files;
}

describe("Puck-native v2 compliance (P3.5-05, collab-ui)", () => {
	it("no source file references the sidecar or sidecar editor commands", () => {
		const offenders: string[] = [];
		for (const file of sourceFiles(join(__dirname, ".."))) {
			const source = readFileSync(file, "utf8");
			for (const marker of FORBIDDEN) {
				if (source.includes(marker)) offenders.push(`${file}: ${marker}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
