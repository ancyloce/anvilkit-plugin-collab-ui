/**
 * @file Regression coverage for the `presencePublishing` factory option
 * (report 4.2.2 / M2): unify cursor + selection publishing for the default
 * `createCollabPlugin()` path.
 *
 * Before this change the factory only ever mounted the cursor-only
 * `<PresenceCursorBroadcaster>`; the Puck-aware `<CollabPresencePublisher>`
 * (which also publishes the Puck selection ring) existed but was never wired
 * into the factory. The factory now accepts
 * `presencePublishing: "cursor" | "cursor+selection"` and mounts the
 * combined publisher INSTEAD OF the cursor-only one when selection mode is
 * on — exactly one writer is ever mounted, so the two never clobber each
 * other's awareness frames.
 *
 * The two writer component modules are mocked with identifiable stubs so
 * this test asserts the FACTORY WIRES the correct component per mode without
 * needing a live `<Puck>` context (the real `<CollabPresencePublisher>` calls
 * `usePuckSelection()`, which requires `<Puck>`). The pure `selectPresenceWriter`
 * selector is unit-tested against the same stubs.
 */

import type { PeerInfo } from "@anvilkit/plugin-version-history";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdapter } from "./test-utils.js";

// Identifiable stubs for the two writer components so we can detect which
// one the factory mounts. Stubbing the REAL `collab-presence-publisher.js`
// also keeps its `usePuckSelection()` import from ever running (no `<Puck>`
// in jsdom).
vi.mock("../components/presence-cursor-broadcaster.js", () => ({
	PresenceCursorBroadcaster: (): ReactNode => (
		<div data-testid="writer-cursor-only" />
	),
}));
vi.mock("../components/collab-presence-publisher.js", () => ({
	CollabPresencePublisher: (): ReactNode => (
		<div data-testid="writer-cursor-selection" />
	),
}));

// Mock the data layer at the module boundary (same approach as plugin.test):
// the factory builds an adapter + inner data plugin we don't want to spin up.
const adapterRef = vi.hoisted(() => ({
	current: null as ReturnType<typeof createFakeAdapter>["adapter"] | null,
}));

vi.mock("@anvilkit/plugin-collab-yjs", () => ({
	createYjsAdapter: vi.fn(() => {
		if (!adapterRef.current) {
			throw new Error("adapterRef.current is null; populate it in beforeEach");
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
import { CollabPresencePublisher } from "../components/collab-presence-publisher.js";
import { PresenceCursorBroadcaster } from "../components/presence-cursor-broadcaster.js";
import { selectPresenceWriter } from "../lib/select-presence-writer.js";
import {
	type CreateCollabPluginOptions,
	createCollabPlugin,
} from "../plugin.js";

const ALICE: PeerInfo = { id: "alice", displayName: "Alice", color: "#f43f5e" };
const FAKE_DOC = {} as never;

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

/** Register the plugin and render its `collab-ui` provider subtree. */
async function renderProviderFor(options: CreateCollabPluginOptions) {
	const plugin = createCollabPlugin(options);
	const registration = await plugin.register(makeCtx());
	const ProviderComponent = registration.providers?.[0]
		?.component as React.ComponentType<{ children: React.ReactNode }>;
	return render(<ProviderComponent>{null}</ProviderComponent>);
}

beforeEach(() => {
	const { adapter } = createFakeAdapter();
	adapterRef.current = adapter;
});

describe("selectPresenceWriter — pure mode → component selector", () => {
	it("default 'cursor' mode picks the cursor-only broadcaster", () => {
		expect(selectPresenceWriter(true, "cursor")).toBe(
			PresenceCursorBroadcaster,
		);
	});

	it("'cursor+selection' mode picks the combined publisher INSTEAD", () => {
		expect(selectPresenceWriter(true, "cursor+selection")).toBe(
			CollabPresencePublisher,
		);
		// Never the cursor-only one — mounting both would clobber frames.
		expect(selectPresenceWriter(true, "cursor+selection")).not.toBe(
			PresenceCursorBroadcaster,
		);
	});

	it("returns null (mount nothing) when broadcasting is disabled", () => {
		expect(selectPresenceWriter(false, "cursor")).toBeNull();
		expect(selectPresenceWriter(false, "cursor+selection")).toBeNull();
	});
});

describe("createCollabPlugin — presencePublishing wiring", () => {
	it("accepts presencePublishing on CreateCollabPluginOptions (type exists)", () => {
		const opts: CreateCollabPluginOptions = {
			doc: FAKE_DOC,
			self: ALICE,
			presencePublishing: "cursor+selection",
		};
		expect(opts.presencePublishing).toBe("cursor+selection");
	});

	it("default mode mounts the cursor-only broadcaster, not the publisher", async () => {
		const { queryByTestId } = await renderProviderFor({
			doc: FAKE_DOC,
			self: ALICE,
		});
		expect(queryByTestId("writer-cursor-only")).not.toBeNull();
		expect(queryByTestId("writer-cursor-selection")).toBeNull();
	});

	it("'cursor+selection' mode mounts the combined publisher, not the broadcaster", async () => {
		const { queryByTestId } = await renderProviderFor({
			doc: FAKE_DOC,
			self: ALICE,
			presencePublishing: "cursor+selection",
		});
		expect(queryByTestId("writer-cursor-selection")).not.toBeNull();
		expect(queryByTestId("writer-cursor-only")).toBeNull();
	});

	it("mounts neither writer when presence.broadcastCursor is false", async () => {
		const { queryByTestId } = await renderProviderFor({
			doc: FAKE_DOC,
			self: ALICE,
			presencePublishing: "cursor+selection",
			presence: { broadcastCursor: false },
		});
		expect(queryByTestId("writer-cursor-selection")).toBeNull();
		expect(queryByTestId("writer-cursor-only")).toBeNull();
	});
});
