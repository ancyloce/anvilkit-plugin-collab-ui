/**
 * @file Tests for `createCollabPlugin()` (task_014).
 *
 * Validates the registration shape contract from plan §3.5:
 *
 * - Returns a single `StudioPlugin` with `meta = @anvilkit/collab`.
 * - `register()` produces a registration carrying hooks (from the
 *   internal data plugin), one provider (`collab-ui`), two overlays
 *   (`collab-presence` at canvas, `collab-conflicts` at notifications),
 *   and one slot (`collaborators`).
 * - Toggling each UI knob's `enabled: false` removes the corresponding
 *   contribution.
 * - The host-provided `onIdentityChange` callback fires when the
 *   provider's `self` changes downstream.
 *
 * The yjs adapter is mocked at the module boundary so we don't need to
 * spin up a real `Y.Doc` (which would require adding `yjs` as a direct
 * devDep — it's only available transitively today).
 */

import { act, render, renderHook } from "@testing-library/react";
import type { PeerInfo } from "@anvilkit/plugin-version-history";
import { beforeEach, describe, expect, it, vi } from "vitest";

import packageJson from "../../package.json";
import { createFakeAdapter } from "./test-utils.js";

// Hold the fake adapter created per-test in a hoisted variable that the
// mock factory closes over. The mock replaces the *full* module surface
// to avoid pulling in `selection-bridge.js` → `@dnd-kit` → `ResizeObserver`
// (jsdom doesn't supply it, and the consolidated factory never touches
// that branch at registration time).
const adapterRef = vi.hoisted(() => ({
	current: null as ReturnType<typeof createFakeAdapter>["adapter"] | null,
}));

vi.mock("@anvilkit/plugin-collab-yjs", () => {
	// Re-export a minimal subset: `createCollabPlugin` (used by the
	// factory to build the inner data plugin) and `createYjsAdapter`
	// (used to build the adapter). Everything else this module exports
	// is type-only and erased at compile time, so test code never needs
	// the runtime values.
	return {
		createYjsAdapter: vi.fn(() => {
			if (!adapterRef.current) {
				throw new Error(
					"adapterRef.current is null; test setup must populate it before createCollabPlugin runs",
				);
			}
			return adapterRef.current;
		}),
		// P2 — the factory now wraps the adapter for save coalescing.
		// Identity stub (no debounce) so existing assertions about the
		// inner data plugin / adapter wiring stay unchanged.
		createDebouncedAdapter: vi.fn((adapter: unknown) => adapter),
		// `createCollabDataPlugin` is the data plugin our factory wraps.
		// We provide a minimal stub that returns hooks so the registration
		// inherits the expected shape.
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
				hooks: {
					onInit: vi.fn(),
					onDataChange: vi.fn(),
					onDestroy: vi.fn(),
				},
			}),
		})),
	};
});

// Import AFTER the mock is registered.
import { useCollabContext } from "../context.js";
import { createCollabPlugin } from "../plugin.js";

function makeCtx() {
	return {
		getData: () => ({ root: { props: {} }, content: [], zones: {} }),
		getPuckApi: vi.fn(),
		studioConfig: {} as never,
		log: vi.fn(),
		emit: vi.fn(),
		registerAssetResolver: vi.fn(),
	};
}

const ALICE: PeerInfo = {
	id: "alice",
	displayName: "Alice",
	color: "#f43f5e",
};

// A doc stub — `createYjsAdapter` is mocked, so the value only needs to
// satisfy the type, not provide real Yjs semantics.
const FAKE_DOC = {} as never;

beforeEach(() => {
	const { adapter } = createFakeAdapter();
	adapterRef.current = adapter;
});

describe("createCollabPlugin — plugin shape", () => {
	it("returns a StudioPlugin with the @anvilkit/collab meta", () => {
		const plugin = createCollabPlugin({ doc: FAKE_DOC, self: ALICE });
		expect(plugin.meta.id).toBe("@anvilkit/collab");
		expect(plugin.meta.name).toBe("Collaboration");
		expect(typeof plugin.register).toBe("function");
	});

	// Metadata drift guard: META.version is derived from package.json,
	// so a Changesets bump can never leave the runtime version stale.
	it("exposes a meta.version that matches package.json", () => {
		const plugin = createCollabPlugin({ doc: FAKE_DOC, self: ALICE });
		expect(plugin.meta.version).toBe(packageJson.version);
	});

	it("registration carries lifecycle hooks inherited from the data plugin", async () => {
		const plugin = createCollabPlugin({ doc: FAKE_DOC, self: ALICE });
		const registration = await plugin.register(makeCtx());
		expect(registration.hooks).toBeDefined();
		// The yjs data plugin contributes onInit + onDataChange + onDestroy.
		expect(typeof registration.hooks?.onInit).toBe("function");
		expect(typeof registration.hooks?.onDataChange).toBe("function");
		expect(typeof registration.hooks?.onDestroy).toBe("function");
	});

	it("contributes one provider (collab-ui), two overlays, one slot", async () => {
		const plugin = createCollabPlugin({ doc: FAKE_DOC, self: ALICE });
		const registration = await plugin.register(makeCtx());

		expect(registration.providers).toHaveLength(1);
		expect(registration.providers?.[0]?.id).toBe("collab-ui");
		expect(typeof registration.providers?.[0]?.component).toBe("function");

		expect(registration.overlays).toHaveLength(2);
		const overlayById = new Map(
			(registration.overlays ?? []).map((o) => [o.id, o]),
		);
		expect(overlayById.get("collab-presence")?.placement).toBe("canvas");
		expect(overlayById.get("collab-conflicts")?.placement).toBe(
			"notifications",
		);

		expect(registration.slots).toHaveLength(1);
		expect(registration.slots?.[0]?.id).toBe("collaborators");
		expect(typeof registration.slots?.[0]?.component).toBe("function");
	});

	it("omits the presence overlay when presence.enabled is false", async () => {
		const plugin = createCollabPlugin({
			doc: FAKE_DOC,
			self: ALICE,
			presence: { enabled: false },
		});
		const registration = await plugin.register(makeCtx());
		const ids = (registration.overlays ?? []).map((o) => o.id);
		expect(ids).toEqual(["collab-conflicts"]);
	});

	it("omits the conflict toaster when notifications.enabled is false", async () => {
		const plugin = createCollabPlugin({
			doc: FAKE_DOC,
			self: ALICE,
			notifications: { enabled: false },
		});
		const registration = await plugin.register(makeCtx());
		const ids = (registration.overlays ?? []).map((o) => o.id);
		expect(ids).toEqual(["collab-presence"]);
	});

	it("omits the collaborators slot when collaboratorsStack.enabled is false", async () => {
		const plugin = createCollabPlugin({
			doc: FAKE_DOC,
			self: ALICE,
			collaboratorsStack: { enabled: false },
		});
		const registration = await plugin.register(makeCtx());
		expect(registration.slots).toBeUndefined();
	});
});

describe("createCollabPlugin — runtime behavior", () => {
	it("provider component wraps children with CollabUIProvider so hooks resolve", async () => {
		const plugin = createCollabPlugin({ doc: FAKE_DOC, self: ALICE });
		const registration = await plugin.register(makeCtx());
		const ProviderComponent = registration.providers?.[0]?.component;
		expect(ProviderComponent).toBeDefined();

		// Renderhook inside the provider — useCollabContext() must resolve.
		const wrapper = ({ children }: { children: React.ReactNode }) => {
			const Component = ProviderComponent as React.ComponentType<{
				children: React.ReactNode;
			}>;
			return <Component>{children}</Component>;
		};
		const { result } = renderHook(() => useCollabContext(), { wrapper });
		expect(result.current.self.id).toBe("alice");
		expect(result.current.self.displayName).toBe("Alice");
	});

	it("fires onIdentityChange when the provider's self updates", async () => {
		const onIdentityChange = vi.fn();
		const plugin = createCollabPlugin({
			doc: FAKE_DOC,
			self: ALICE,
			onIdentityChange,
		});
		const registration = await plugin.register(makeCtx());
		const ProviderComponent = registration.providers?.[0]
			?.component as React.ComponentType<{ children: React.ReactNode }>;

		let capturedUpdateSelf:
			| ((patch: { displayName?: string }) => void)
			| undefined;
		function Probe() {
			const { updateSelf } = useCollabContext();
			capturedUpdateSelf = updateSelf;
			return null;
		}

		render(
			<ProviderComponent>
				<Probe />
			</ProviderComponent>,
		);

		// Per the IdentitySync contract: the bridge does NOT fire for
		// the initial value the host already passed in.
		expect(onIdentityChange).not.toHaveBeenCalled();

		// Mutate identity via the context's updateSelf — the bridge
		// fires once with the new value.
		act(() => {
			capturedUpdateSelf?.({ displayName: "Alice (renamed)" });
		});
		expect(onIdentityChange).toHaveBeenCalledTimes(1);
		expect(onIdentityChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ displayName: "Alice (renamed)" }),
		);

		// A second update to a different value fires again.
		act(() => {
			capturedUpdateSelf?.({ displayName: "Alice v3" });
		});
		expect(onIdentityChange).toHaveBeenCalledTimes(2);

		// A redundant update to the SAME value does not fire (dedupe).
		act(() => {
			capturedUpdateSelf?.({ displayName: "Alice v3" });
		});
		expect(onIdentityChange).toHaveBeenCalledTimes(2);
	});
});
