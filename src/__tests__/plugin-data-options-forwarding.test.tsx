/**
 * @file Regression test for finding H1 (report 4.1.1):
 * `createCollabPlugin()` must forward the NEWER yjs adapter options —
 * `undo`, `snapshotPersistence`, `propGuards`, and `resolveConflict` —
 * through into the internal `createYjsAdapter()` call, not just the older
 * `mapName` / `useNativeTree` / `computeDelta` / `awarenessRateLimit` /
 * `persistence` set.
 *
 * Strategy: mock the yjs module boundary so `createYjsAdapter` is a spy,
 * call the factory with sentinel values for each new option, register the
 * plugin, and assert each sentinel reaches the adapter by REFERENCE
 * (`toBe`). Before the fix the factory drops these fields, so the four
 * `toBe(sentinel)` assertions go red (the options object has `undefined`
 * for each). The `mapName` assertion is a control that passes both
 * before and after.
 */

import type {
	PropGuardOptions,
	ResolveConflict,
	SnapshotPersistenceOptions,
	UndoOptions,
} from "@anvilkit/plugin-collab-yjs";
import type { PeerInfo } from "@anvilkit/plugin-version-history";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdapter } from "./test-utils.js";

const adapterRef = vi.hoisted(() => ({
	current: null as ReturnType<typeof createFakeAdapter>["adapter"] | null,
}));

vi.mock("@anvilkit/plugin-collab-yjs", () => ({
	createYjsAdapter: vi.fn(() => {
		if (!adapterRef.current) {
			throw new Error(
				"adapterRef.current is null; test setup must populate it before createCollabPlugin runs",
			);
		}
		return adapterRef.current;
	}),
	createDebouncedAdapter: vi.fn((adapter: unknown) => adapter),
	createCollabDataPlugin: vi.fn(() => ({
		meta: {
			id: "anvilkit-plugin-collab-yjs",
			name: "Collab (Yjs)",
			version: "0.0.0-test",
			coreVersion: "^0.1.0-alpha",
		},
		register: () => ({
			meta: {
				id: "anvilkit-plugin-collab-yjs",
				name: "Collab (Yjs)",
				version: "0.0.0-test",
				coreVersion: "^0.1.0-alpha",
			},
			hooks: { onInit: vi.fn(), onDataChange: vi.fn(), onDestroy: vi.fn() },
		}),
	})),
}));

vi.mock("@anvilkit/plugin-collab-yjs/transport", () => ({
	createManagedTransport: vi.fn(() => ({
		doc: {},
		awareness: undefined,
		connectionSource: () => () => undefined,
		destroy: () => undefined,
	})),
}));

// Import AFTER the mocks are registered.
import { createYjsAdapter } from "@anvilkit/plugin-collab-yjs";
import { createCollabPlugin } from "../plugin.js";

function makeCtx() {
	return {
		getData: () => ({ root: { props: {} }, content: [], zones: {} }),
		getPuckApi: vi.fn(),
		studioConfig: {} as never,
		log: vi.fn(),
		emit: vi.fn(),
		registerAssetResolver: vi.fn(),
		registerMessages: vi.fn(),
	};
}

const ALICE: PeerInfo = { id: "alice", displayName: "Alice", color: "#f43f5e" };
const FAKE_DOC = {} as never;

beforeEach(() => {
	const { adapter } = createFakeAdapter();
	adapterRef.current = adapter;
	vi.mocked(createYjsAdapter).mockClear();
});

describe("createCollabPlugin — newer data-layer option forwarding (H1)", () => {
	it("forwards undo / snapshotPersistence / propGuards / resolveConflict into createYjsAdapter", async () => {
		const undo: UndoOptions = { captureTimeout: 250 };
		const snapshotPersistence: SnapshotPersistenceOptions = {
			adapter: {
				saveSnapshot: () => undefined,
				loadSnapshot: () => undefined,
				listSnapshots: () => [],
				deleteSnapshot: () => undefined,
			},
		};
		const propGuards: PropGuardOptions = { maxBytes: 1024 };
		const resolveConflict: ResolveConflict = () => "local";

		const plugin = createCollabPlugin({
			doc: FAKE_DOC,
			self: ALICE,
			mapName: "custom-map",
			undo,
			snapshotPersistence,
			propGuards,
			resolveConflict,
		});
		await plugin.register(makeCtx());

		expect(createYjsAdapter).toHaveBeenCalledTimes(1);
		const opts = vi.mocked(createYjsAdapter).mock.calls.at(-1)?.[0];
		expect(opts).toBeDefined();

		// Control: an already-forwarded older option still reaches the adapter.
		expect(opts?.mapName).toBe("custom-map");

		// The four newer options must be forwarded by reference (these
		// assertions are red before the fix — the factory drops the fields).
		expect(opts?.undo).toBe(undo);
		expect(opts?.snapshotPersistence).toBe(snapshotPersistence);
		expect(opts?.propGuards).toBe(propGuards);
		expect(opts?.resolveConflict).toBe(resolveConflict);
	});
});
