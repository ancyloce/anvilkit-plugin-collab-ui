import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the public subpath surface of `@anvilkit/collab-ui`.
 *
 * The package intentionally exposes only the root entry (`.`) and the
 * documented `./components/*` subpath (see README). A broad `"./*"` catch-all
 * (mapping to `./dist/*`) would silently promote every internal helper
 * (`lib/anon-identity`, `lib/conflict-key`, `context`, …) into stable public
 * API. This test fails if that catch-all is reintroduced (regression M5).
 */
describe("package.json exports surface", () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const pkgPath = resolve(here, "../../package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
		exports: Record<string, unknown>;
	};

	it("keeps the documented root and ./components/* subpaths", () => {
		expect(pkg.exports).toHaveProperty(["."]);
		expect(pkg.exports).toHaveProperty(["./components/*"]);
	});

	it("does not expose a broad ./* catch-all that leaks internals", () => {
		expect(Object.keys(pkg.exports)).not.toContain("./*");
	});

	it("only declares intentional, explicit subpaths", () => {
		// Every export key must be the root or an explicit, scoped subpath —
		// never a bare top-level wildcard that maps straight onto ./dist/*.
		const allowed = new Set([".", "./components/*"]);
		for (const key of Object.keys(pkg.exports)) {
			expect(allowed.has(key)).toBe(true);
		}
	});
});
