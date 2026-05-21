import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConflictNoticeCenter } from "../components/conflict-notice-center.js";
import { CollabUIProvider } from "../context.js";
import { createFakeAdapter } from "./test-utils.js";

vi.mock("sonner", async () => {
	const actual = await vi.importActual<Record<string, unknown>>("sonner");
	const toastFn = vi.fn() as unknown as ((...args: unknown[]) => void) & {
		success: ReturnType<typeof vi.fn>;
		error: ReturnType<typeof vi.fn>;
		dismiss: ReturnType<typeof vi.fn>;
	};
	toastFn.success = vi.fn();
	toastFn.error = vi.fn();
	toastFn.dismiss = vi.fn();
	return {
		...actual,
		Toaster: () => null,
		toast: toastFn,
	};
});

describe("<ConflictNoticeCenter />", () => {
	it("renders without throwing", () => {
		const { adapter } = createFakeAdapter();
		expect(() =>
			render(
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<ConflictNoticeCenter />
				</CollabUIProvider>,
			),
		).not.toThrow();
	});

	it("forwards conflict events to sonner toast()", async () => {
		const { toast } = await import("sonner");
		const { adapter, controls } = createFakeAdapter();
		render(
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				<ConflictNoticeCenter />
			</CollabUIProvider>,
		);

		await act(async () =>
			controls.emitConflict({
				kind: "overlap",
				localPeer: { id: "alice" },
				remotePeer: { id: "bob", displayName: "Bob" },
				nodeIds: ["hero-1"],
				at: "2026-05-08T00:00:00.000Z",
			}),
		);

		expect(
			(toast as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
		).toBeGreaterThan(0);
		const [message] =
			(toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
		expect(typeof message).toBe("string");
		expect(message as string).toContain("Bob");
	});
});
