import type { MetricsSnapshot } from "@anvilkit/plugin-collab-yjs";
import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	CollabUIProvider,
	conflictKey,
	useCollabConflictQueue,
	useCollabConflicts,
	useCollabContext,
	useCollabMetrics,
	useCollabPeers,
	useCollabStatus,
} from "../context.js";
import { createFakeAdapter } from "./test-utils.js";

describe("CollabUIProvider", () => {
	it("throws when hooks are used outside the provider", () => {
		expect(() => renderHook(() => useCollabContext())).toThrow(
			/CollabUIProvider/,
		);
	});

	it("seeds status and updates as the adapter emits", () => {
		const { adapter, controls } = createFakeAdapter();
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				{children}
			</CollabUIProvider>
		);
		const { result } = renderHook(() => useCollabStatus(), { wrapper });
		expect(result.current).toEqual({ kind: "connecting" });

		act(() => controls.emitStatus({ kind: "synced", since: "2026-05-08" }));
		expect(result.current.kind).toBe("synced");

		act(() =>
			controls.emitStatus({
				kind: "offline",
				since: "2026-05-08",
				queuedEdits: 4,
			}),
		);
		expect(result.current.kind).toBe("offline");
	});

	it("filters self from the peers list", () => {
		const { adapter, controls } = createFakeAdapter();
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				{children}
			</CollabUIProvider>
		);
		const { result } = renderHook(() => useCollabPeers(), { wrapper });

		act(() =>
			controls.emitPeers([
				{ peer: { id: "alice", displayName: "Alice" } },
				{ peer: { id: "bob", displayName: "Bob" } },
			]),
		);
		expect(result.current.map((peer) => peer.peer.id)).toEqual(["bob"]);
	});

	it("dedupes repeated remote peer frames by id", () => {
		const { adapter, controls } = createFakeAdapter();
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				{children}
			</CollabUIProvider>
		);
		const { result } = renderHook(() => useCollabPeers(), { wrapper });

		act(() =>
			controls.emitPeers([
				{ peer: { id: "bob", displayName: "Bob" } },
				{
					peer: { id: "bob", displayName: "Bob" },
					cursor: { x: 12, y: 34 },
				},
			]),
		);
		expect(result.current).toHaveLength(1);
		expect(result.current[0]?.peer.id).toBe("bob");
		expect(result.current[0]?.cursor).toEqual({ x: 12, y: 34 });
	});

	it("appends conflict events", () => {
		const { adapter, controls } = createFakeAdapter();
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				{children}
			</CollabUIProvider>
		);
		const { result } = renderHook(() => useCollabConflicts(), { wrapper });

		act(() =>
			controls.emitConflict({
				kind: "overlap",
				localPeer: { id: "alice" },
				remotePeer: { id: "bob" },
				nodeIds: ["hero-1"],
				at: "2026-05-08T00:00:00.000Z",
			}),
		);
		expect(result.current.length).toBe(1);
		expect(result.current[0]?.nodeIds).toEqual(["hero-1"]);
	});

	it("renders children", () => {
		const { adapter } = createFakeAdapter();
		const { getByText } = render(
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				<span>hello</span>
			</CollabUIProvider>,
		);
		expect(getByText("hello")).toBeInTheDocument();
	});

	it("M1: dismissing one conflict keeps its co-timestamped sibling", () => {
		const { adapter, controls } = createFakeAdapter();
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				{children}
			</CollabUIProvider>
		);
		const { result } = renderHook(() => useCollabConflictQueue(), { wrapper });

		const at = "2026-05-08T00:00:00.000Z";
		const first = {
			kind: "overlap" as const,
			localPeer: { id: "alice" },
			remotePeer: { id: "bob" },
			nodeIds: ["hero-1"],
			at,
		};
		const second = {
			kind: "overlap" as const,
			localPeer: { id: "alice" },
			remotePeer: { id: "carol" },
			nodeIds: ["hero-2"],
			at,
		};
		act(() => {
			controls.emitConflict(first);
			controls.emitConflict(second);
		});
		expect(result.current.conflicts).toHaveLength(2);

		// Dismiss only the first by its composite key — the co-timestamped
		// sibling must survive (keying by bare `at` would drop both).
		act(() => result.current.dismissConflict(conflictKey(first)));
		expect(result.current.conflicts).toHaveLength(1);
		expect(result.current.conflicts[0]?.remotePeer?.id).toBe("carol");
	});

	it("F2: keeps the peers reference stable across an identical frame", () => {
		const { adapter, controls } = createFakeAdapter();
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				{children}
			</CollabUIProvider>
		);
		const { result } = renderHook(() => useCollabPeers(), { wrapper });

		act(() =>
			controls.emitPeers([
				{ peer: { id: "bob", displayName: "Bob" }, cursor: { x: 1, y: 2 } },
			]),
		);
		const firstRef = result.current;
		expect(firstRef).toHaveLength(1);

		// A fresh array with identical values must NOT change the reference.
		act(() =>
			controls.emitPeers([
				{ peer: { id: "bob", displayName: "Bob" }, cursor: { x: 1, y: 2 } },
			]),
		);
		expect(result.current).toBe(firstRef);

		// A real change DOES update the reference.
		act(() =>
			controls.emitPeers([
				{ peer: { id: "bob", displayName: "Bob" }, cursor: { x: 9, y: 9 } },
			]),
		);
		expect(result.current).not.toBe(firstRef);
	});

	it("F8: caps the retained conflict window to the most recent 50", () => {
		const { adapter, controls } = createFakeAdapter();
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				{children}
			</CollabUIProvider>
		);
		const { result } = renderHook(() => useCollabConflicts(), { wrapper });

		act(() => {
			for (let i = 0; i < 60; i++) {
				controls.emitConflict({
					kind: "overlap",
					localPeer: { id: "alice" },
					remotePeer: { id: `peer-${i}` },
					nodeIds: [`node-${i}`],
					at: `2026-05-08T00:00:${String(i).padStart(2, "0")}.000Z`,
				});
			}
		});

		expect(result.current).toHaveLength(50);
		// Newest retained, oldest 10 dropped.
		expect(result.current[0]?.remotePeer?.id).toBe("peer-10");
		expect(result.current[49]?.remotePeer?.id).toBe("peer-59");
	});

	it("F7: keeps the metrics reference stable across polls when unchanged", () => {
		const snapshot: MetricsSnapshot = {
			saveCount: 3,
			transportWrites: 3,
			saveCoalescingRatio: 1,
			dispatchFailures: 0,
			awarenessChurn: 5,
			syncLatencyP50Ms: 12,
			syncLatencyP95Ms: 20,
			syncLatencySamples: 8,
			degraded: false,
			degradedReasons: [],
			presenceValidationFailures: 0,
			inboundCoalesced: 0,
			inboundQueueDelayP50Ms: null,
			conversionTimeP50Ms: null,
			dispatchTimeP50Ms: null,
			saveEncodeTimeP50Ms: null,
			nativeApplyTimeP50Ms: null,
			nativeReadTimeP50Ms: null,
		};
		const { adapter } = createFakeAdapter({ metricsValue: snapshot });
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				{children}
			</CollabUIProvider>
		);
		vi.useFakeTimers();
		try {
			const { result } = renderHook(() => useCollabMetrics(1000), { wrapper });
			const firstRef = result.current;
			expect(firstRef).not.toBeNull();
			act(() => {
				vi.advanceTimersByTime(1000);
			});
			expect(result.current).toBe(firstRef);
			act(() => {
				vi.advanceTimersByTime(1000);
			});
			expect(result.current).toBe(firstRef);
		} finally {
			vi.useRealTimers();
		}
	});
});
