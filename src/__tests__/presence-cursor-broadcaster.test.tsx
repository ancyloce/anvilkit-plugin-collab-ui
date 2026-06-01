/**
 * @file Regression coverage for {@link PresenceCursorBroadcaster}.
 *
 * Guards the bug fixed alongside the managed-transport one-liner: the
 * consolidated `createCollabPlugin({ websocketUrl })` rendered remote
 * cursors but published none of its own, so peers never saw each other's
 * cursors. The broadcaster publishes the local pointer through
 * `adapter.presence.update`, translating canvas-iframe coordinates into
 * the parent viewport so both channels share one space.
 */

import type { PeerInfo } from "@anvilkit/plugin-version-history";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PresenceCursorBroadcaster } from "../components/presence-cursor-broadcaster.js";
import { CollabUIProvider } from "../context.js";
import { createFakeAdapter } from "./test-utils.js";

const SELF: PeerInfo = { id: "alice", displayName: "Alice", color: "#f43f5e" };

// Capture the most recently scheduled rAF callback so the test can flush
// the broadcaster's frame-coalesced publish deterministically (jsdom does
// not run real animation frames).
let rafCallback: FrameRequestCallback | null = null;

function flushFrame(): void {
	const cb = rafCallback;
	rafCallback = null;
	if (cb) act(() => cb(0));
}

/** Fake adapter whose `presence.update` is a spy. */
function makeSpyAdapter() {
	const { adapter } = createFakeAdapter();
	const update = vi.fn();
	(adapter.presence as { update: typeof update }).update = update;
	return { adapter, update };
}

function renderBroadcaster(
	adapter: ReturnType<typeof makeSpyAdapter>["adapter"],
) {
	const tree: ReactNode = (
		<CollabUIProvider adapter={adapter} self={SELF}>
			<PresenceCursorBroadcaster />
		</CollabUIProvider>
	);
	return render(tree);
}

beforeEach(() => {
	rafCallback = null;
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
		rafCallback = cb;
		return 1;
	});
	vi.stubGlobal("cancelAnimationFrame", () => {
		rafCallback = null;
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	// Drop any iframe a test mounted so the next test starts clean.
	for (const frame of Array.from(document.querySelectorAll("iframe"))) {
		frame.remove();
	}
});

describe("PresenceCursorBroadcaster", () => {
	it("publishes window pointer moves as viewport-relative cursor frames", () => {
		const { adapter, update } = makeSpyAdapter();
		renderBroadcaster(adapter);

		// The provider mirrors identity on mount with no cursor — ignore it.
		update.mockClear();

		act(() => {
			window.dispatchEvent(
				new MouseEvent("mousemove", { clientX: 42, clientY: 17 }),
			);
		});
		// Coalesced: nothing published until the animation frame fires.
		expect(update).not.toHaveBeenCalled();
		flushFrame();

		expect(update).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith({
			peer: SELF,
			cursor: { x: 42, y: 17 },
		});
	});

	it("offsets canvas-iframe moves by the iframe's viewport position", () => {
		// Mount the Puck preview iframe before render so the broadcaster's
		// mount-time attach binds to its document synchronously.
		const iframe = document.createElement("iframe");
		iframe.id = "preview-frame";
		document.body.appendChild(iframe);
		iframe.getBoundingClientRect = () =>
			({
				left: 100,
				top: 50,
				width: 0,
				height: 0,
				right: 100,
				bottom: 50,
				x: 100,
				y: 50,
				toJSON: () => ({}),
			}) as DOMRect;
		const frameDoc = iframe.contentDocument;
		expect(frameDoc).not.toBeNull();

		const { adapter, update } = makeSpyAdapter();
		renderBroadcaster(adapter);
		update.mockClear();

		act(() => {
			frameDoc?.dispatchEvent(
				new MouseEvent("mousemove", { clientX: 10, clientY: 20 }),
			);
		});
		flushFrame();

		expect(update).toHaveBeenCalledWith({
			peer: SELF,
			cursor: { x: 110, y: 70 },
		});
	});

	it("stops publishing after unmount", () => {
		const { adapter, update } = makeSpyAdapter();
		const { unmount } = renderBroadcaster(adapter);
		update.mockClear();
		unmount();

		act(() => {
			window.dispatchEvent(
				new MouseEvent("mousemove", { clientX: 5, clientY: 5 }),
			);
		});
		flushFrame();
		expect(update).not.toHaveBeenCalled();
	});
});
