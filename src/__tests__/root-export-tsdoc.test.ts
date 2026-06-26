import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Documentation guard (report 4.3.4): every ROOT-EXPORTED `useCollab*` hook and
// every public prop-bag / label / value type re-exported from `src/index.ts`
// must carry a TSDoc block (a "/**" ... close) immediately above its
// declaration.
//
// The symbol list is derived dynamically FROM `src/index.ts`, so a future
// undocumented export (new hook or public type) re-breaks this test instead of
// slipping through. The matcher walks the lines above each declaration and
// requires a contiguous TSDoc block: a plain non-doc block comment, a stray
// brace / `const`, or nothing at all all fail it — so deleting a doc re-breaks
// it too.

const TSDOC_OPEN = "/**";
const BLOCK_CLOSE = "*/";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "..");
const indexPath = resolve(srcRoot, "index.ts");

function listSourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "__tests__") continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...listSourceFiles(full));
		} else if (/\.tsx?$/.test(entry.name) && full !== indexPath) {
			out.push(full);
		}
	}
	return out;
}

const indexSrc = readFileSync(indexPath, "utf8");

// ── Enumerate the public surface from index.ts ──────────────────────────────
// Hooks: every `useCollab*` identifier mentioned in the barrel.
const hookNames = [
	...new Set(indexSrc.match(/\buseCollab[A-Za-z0-9]+/g) ?? []),
];

// Public types: `type Foo` entries inside mixed `export { ... }` blocks PLUS
// any `export type { Foo, Bar } from ...` type-only re-exports.
const typeNameSet = new Set<string>();
for (const m of indexSrc.matchAll(/\btype\s+([A-Z][A-Za-z0-9_]*)/g)) {
	typeNameSet.add(m[1] as string);
}
for (const m of indexSrc.matchAll(/export\s+type\s*\{([^}]*)\}/g)) {
	for (const part of (m[1] as string).split(",")) {
		const name = part.trim();
		if (/^[A-Z][A-Za-z0-9_]*$/.test(name)) typeNameSet.add(name);
	}
}
const typeNames = [...typeNameSet];

const sourceFiles = listSourceFiles(srcRoot);
const fileLines = new Map<string, string[]>(
	sourceFiles.map((file) => [file, readFileSync(file, "utf8").split(/\r?\n/)]),
);

interface Definition {
	readonly file: string;
	readonly idx: number;
	readonly lines: string[];
}

function findDefinition(name: string): Definition | null {
	const re = new RegExp(`^export (?:interface|type|function) ${name}\\b`);
	for (const [file, lines] of fileLines) {
		for (let i = 0; i < lines.length; i++) {
			if (re.test(lines[i] as string)) return { file, idx: i, lines };
		}
	}
	return null;
}

// True iff a contiguous TSDoc block sits directly above the declaration at
// `idx` (only blank lines may intervene). A plain non-doc block comment, a
// code line, or nothing returns false.
function hasTsdocBefore(lines: string[], idx: number): boolean {
	let i = idx - 1;
	while (i >= 0 && (lines[i] as string).trim() === "") i--;
	if (i < 0) return false;
	const closer = (lines[i] as string).trim();
	// one-liner like `/** foo */`
	if (closer.startsWith(TSDOC_OPEN) && closer.endsWith(BLOCK_CLOSE))
		return true;
	if (!(closer === BLOCK_CLOSE || closer.startsWith("*"))) return false;
	for (; i >= 0; i--) {
		const t = (lines[i] as string).trim();
		if (t.startsWith(TSDOC_OPEN)) return true;
		if (!(t.startsWith("*") || t.endsWith(BLOCK_CLOSE))) return false;
	}
	return false;
}

describe("root-export TSDoc coverage (4.3.4)", () => {
	it("enumerates the public surface from index.ts", () => {
		// Sanity: the parser actually found the surface, including the symbols
		// cited in the finding and the later-added undo exports.
		expect(hookNames.length).toBeGreaterThanOrEqual(12);
		expect(typeNames.length).toBeGreaterThanOrEqual(18);
		for (const name of [
			"useCollabAdapter",
			"useCollabStatus",
			"useCollabPeers",
			"useCollabSelf",
			"useCollabConflicts",
			"useCollabUndoState",
		]) {
			expect(hookNames).toContain(name);
		}
		for (const name of [
			"CollabRoomBarProps",
			"CollabUndoState",
			"CollabUndoRedoControlsProps",
			"ConnectionRecoveryBannerProps",
			"PresencePublishingMode",
			"CollabUIProviderProps",
		]) {
			expect(typeNames).toContain(name);
		}
	});

	it("resolves a declaration site for every enumerated symbol", () => {
		const missing = [...hookNames, ...typeNames].filter(
			(name) => findDefinition(name) === null,
		);
		expect(missing, `No declaration found for: ${missing.join(", ")}`).toEqual(
			[],
		);
	});

	it("documents every root-exported hook with a TSDoc block", () => {
		const undocumented = hookNames.filter((name) => {
			const def = findDefinition(name);
			return def !== null && !hasTsdocBefore(def.lines, def.idx);
		});
		expect(
			undocumented,
			`Hooks missing a TSDoc block: ${undocumented.join(", ")}`,
		).toEqual([]);
	});

	it("documents every public prop-bag / type with a TSDoc block", () => {
		const undocumented = typeNames.filter((name) => {
			const def = findDefinition(name);
			return def !== null && !hasTsdocBefore(def.lines, def.idx);
		});
		expect(
			undocumented,
			`Public types missing a TSDoc block: ${undocumented.join(", ")}`,
		).toEqual([]);
	});
});
