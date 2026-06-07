import type { PresenceState } from "@anvilkit/plugin-version-history";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
	type CollabPresenceLayerProps,
	PresenceLayer,
} from "../components/presence-layer.js";
import { CollabUIProvider } from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter } from "./test-utils.js";

function cursorPeer(id: string, x: number): PresenceState {
	return { peer: { id }, cursor: { x, y: 0 } };
}

function countCursors(container: HTMLElement): number {
	return container.querySelectorAll("[data-slot=presence-cursor]").length;
}

function renderLayer(
	props: CollabPresenceLayerProps,
	self: { id: string; displayName?: string } = { id: "me" },
): {
	container: HTMLElement;
	emitPeers: (peers: readonly PresenceState[]) => void;
} {
	const { adapter, controls } = createFakeAdapter();
	const ui: ReactNode = (
		<CollabUII18nProvider>
			<CollabUIProvider adapter={adapter} self={self}>
				<PresenceLayer {...props} />
			</CollabUIProvider>
		</CollabUII18nProvider>
	);
	const { container } = render(ui);
	return {
		container,
		emitPeers: (peers) => act(() => controls.emitPeers(peers)),
	};
}

describe("<PresenceLayer /> cursor budget (review U1)", () => {
	it("renders a cursor for every peer when under the cap", () => {
		const { container, emitPeers } = renderLayer({});
		emitPeers([cursorPeer("a", 1), cursorPeer("b", 2), cursorPeer("c", 3)]);
		expect(countCursors(container)).toBe(3);
	});

	it("caps simultaneously rendered cursors to maxCursors", () => {
		const { container, emitPeers } = renderLayer({ maxCursors: 2 });
		emitPeers([
			cursorPeer("a", 1),
			cursorPeer("b", 2),
			cursorPeer("c", 3),
			cursorPeer("d", 4),
		]);
		expect(countCursors(container)).toBe(2);
	});

	it("renders no cursors when maxCursors is 0", () => {
		const { container, emitPeers } = renderLayer({ maxCursors: 0 });
		emitPeers([cursorPeer("a", 1), cursorPeer("b", 2)]);
		expect(countCursors(container)).toBe(0);
	});
});

describe("<PresenceLayer /> selection-rect cache (review U2)", () => {
	it("resolves each node's rect once even when several peers select it", () => {
		const resolve = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }));
		const { emitPeers } = renderLayer({ resolveSelectionRect: resolve });
		emitPeers([
			{ peer: { id: "a" }, selection: { nodeIds: ["shared"] } },
			{ peer: { id: "b" }, selection: { nodeIds: ["shared"] } },
		]);
		const sharedCalls = resolve.mock.calls.filter(
			([id]) => id === "shared",
		).length;
		expect(sharedCalls).toBe(1);
	});
});

describe("<PresenceLayer /> anonymous label (review U3)", () => {
	function labelTexts(container: HTMLElement): string[] {
		return Array.from(
			container.querySelectorAll("[data-slot=presence-cursor-label]"),
		).map((el) => el.textContent ?? "");
	}

	it("localizes a default anonymous peer's cursor label and keeps named ones", () => {
		const { container, emitPeers } = renderLayer({});
		emitPeers([
			{
				peer: { id: "anon-x", displayName: "Anonymous" },
				cursor: { x: 1, y: 1 },
			},
			{ peer: { id: "alice", displayName: "Alice" }, cursor: { x: 2, y: 2 } },
			// Non-anonymous, unnamed → no label rendered.
			{ peer: { id: "bob" }, cursor: { x: 3, y: 3 } },
		]);
		// en catalog → "Anonymous"; the named peer is shown verbatim.
		expect(labelTexts(container).sort()).toEqual(["Alice", "Anonymous"]);
	});
});
