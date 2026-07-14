/**
 * Phase-3 verification for the 2026-05-17 UI integration review.
 *
 * Exercises the behavioral contracts that the review's findings
 * required: cursor-visibility wiring (§C3), conflict dedupe key
 * (§C6), metrics surfacing (§C5), and split-context re-render
 * isolation (§C2).
 */

import type { MetricsSnapshot } from "@anvilkit/plugin-collab-yjs";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConflictNoticeCenter } from "../components/conflict-notice-center.js";
import { PresenceLayer } from "../components/presence-layer.js";
import { SyncActivityIndicator } from "../components/sync-activity-indicator.js";
import {
	CollabUIProvider,
	useCollabCursorVisibility,
	useCollabStatus,
} from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter } from "./test-utils.js";

vi.mock("sonner", () => {
	const toastFn = vi.fn();
	return { Toaster: () => null, toast: toastFn };
});

function ToggleCursors(): null {
	const { setShowRemoteCursors } = useCollabCursorVisibility();
	(globalThis as Record<string, unknown>).__setShowRemoteCursors =
		setShowRemoteCursors;
	return null;
}

describe("P1-1 · cursor-visibility wired end-to-end (review §C3)", () => {
	it("context drives the bundled PresenceLayer; props.showCursors overrides", async () => {
		const { adapter, controls } = createFakeAdapter();
		const { container } = render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<ToggleCursors />
					<PresenceLayer />
					<PresenceLayer showCursors />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		await act(async () =>
			controls.emitPeers([
				{ peer: { id: "bob", displayName: "Bob" }, cursor: { x: 5, y: 9 } },
			]),
		);

		// Default visibility is `true` → both layers render the cursor.
		expect(
			container.querySelectorAll("[data-slot=presence-cursor]").length,
		).toBe(2);

		// Flip the shared context off.
		act(() => {
			(
				globalThis as Record<string, (v: boolean) => void>
			).__setShowRemoteCursors(false);
		});

		// Context-following layer hides; the `showCursors`-pinned layer
		// keeps rendering (host override).
		await waitFor(() => {
			expect(
				container.querySelectorAll("[data-slot=presence-cursor]").length,
			).toBe(1);
		});
	});
});

describe("P1-4 · conflict dedupe key (review §C6)", () => {
	it("does not drop a second conflict that shares an ISO timestamp", async () => {
		const { toast } = await import("sonner");
		(toast as unknown as ReturnType<typeof vi.fn>).mockClear();
		const { adapter, controls } = createFakeAdapter();
		render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<ConflictNoticeCenter />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		const at = "2026-05-17T00:00:00.000Z";
		await act(async () => {
			controls.emitConflict({
				kind: "overlap",
				localPeer: { id: "alice" },
				remotePeer: { id: "bob" },
				nodeIds: ["hero-1"],
				at,
			});
			controls.emitConflict({
				kind: "overlap",
				localPeer: { id: "alice" },
				remotePeer: { id: "carol" },
				nodeIds: ["cta-2"],
				at,
			});
		});

		const mock = toast as unknown as ReturnType<typeof vi.fn>;
		expect(mock.mock.calls.length).toBe(2);

		// An exact repeat of the first conflict is still suppressed.
		await act(async () =>
			controls.emitConflict({
				kind: "overlap",
				localPeer: { id: "alice" },
				remotePeer: { id: "bob" },
				nodeIds: ["hero-1"],
				at,
			}),
		);
		expect(mock.mock.calls.length).toBe(2);
	});
});

describe("P2-4 · metrics surfaced in SyncActivityIndicator (review §C5)", () => {
	it("shows degraded + presence-error rows from adapter.metrics()", async () => {
		const { adapter } = createFakeAdapter();
		const metrics: MetricsSnapshot = {
			saveCount: 0,
			transportWrites: 0,
			saveCoalescingRatio: 1,
			dispatchFailures: 0,
			awarenessChurn: 0,
			syncLatencyP50Ms: 20,
			syncLatencyP95Ms: 42,
			syncLatencySamples: 5,
			degraded: true,
			presenceValidationFailures: 3,
			inboundCoalesced: 0,
			inboundQueueDelayP50Ms: null,
			conversionTimeP50Ms: null,
			dispatchTimeP50Ms: null,
			saveEncodeTimeP50Ms: null,
			nativeApplyTimeP50Ms: null,
			nativeReadTimeP50Ms: null,
		};
		(adapter as { metrics: () => MetricsSnapshot }).metrics = () => metrics;

		const { container, findByTestId } = render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<SyncActivityIndicator />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		const trigger = container.querySelector(
			"[data-slot=sync-activity-indicator]",
		);
		expect(trigger).not.toBeNull();
		fireEvent.click(trigger as Element);

		expect((await findByTestId("sync-degraded")).textContent).toBe("Degraded");
		expect((await findByTestId("sync-validation-failures")).textContent).toBe(
			"3",
		);
	});
});

describe("P2-2 · split context isolates re-renders (review §C2)", () => {
	it("a peers-only update does not re-render a status-only consumer", async () => {
		const renders = { count: 0 };
		function StatusProbe(): null {
			useCollabStatus();
			const r = useRef(0);
			useEffect(() => {
				r.current += 1;
				renders.count = r.current;
			});
			return null;
		}
		const { adapter, controls } = createFakeAdapter();
		render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<StatusProbe />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);
		await waitFor(() => expect(renders.count).toBeGreaterThan(0));
		const baseline = renders.count;

		await act(async () =>
			controls.emitPeers([{ peer: { id: "bob" }, cursor: { x: 1, y: 1 } }]),
		);
		expect(renders.count).toBe(baseline);

		// Sanity: a status change *does* re-render it.
		await act(async () =>
			controls.emitStatus({ kind: "synced", since: "now" }),
		);
		expect(renders.count).toBeGreaterThan(baseline);
	});
});
