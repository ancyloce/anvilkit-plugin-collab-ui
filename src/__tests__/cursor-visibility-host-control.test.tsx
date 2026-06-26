import {
	act,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CollabSettingsPopover } from "../components/collab-settings-popover.js";
import { CollabUIProvider, useCollabCursorVisibility } from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter } from "./test-utils.js";

describe("cursor visibility host control (M1 §4.2.1)", () => {
	it("(a) seeds the initial visibility from initialShowRemoteCursors", () => {
		const { adapter } = createFakeAdapter();
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider
				adapter={adapter}
				self={{ id: "alice" }}
				initialShowRemoteCursors={false}
			>
				{children}
			</CollabUIProvider>
		);
		const { result } = renderHook(() => useCollabCursorVisibility(), {
			wrapper,
		});
		expect(result.current.showRemoteCursors).toBe(false);
	});

	it("(a') defaults to visible when the seed is absent", () => {
		const { adapter } = createFakeAdapter();
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				{children}
			</CollabUIProvider>
		);
		const { result } = renderHook(() => useCollabCursorVisibility(), {
			wrapper,
		});
		expect(result.current.showRemoteCursors).toBe(true);
	});

	it("(b) fires onShowRemoteCursorsChange when toggled via the settings popover", async () => {
		ensurePointerEvent();
		const { adapter } = createFakeAdapter();
		const onShowRemoteCursorsChange = vi.fn();
		render(
			<CollabUII18nProvider>
				<CollabUIProvider
					adapter={adapter}
					self={{ id: "alice" }}
					onShowRemoteCursorsChange={onShowRemoteCursorsChange}
				>
					<CollabSettingsPopover roomId="demo" />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		fireEvent.click(screen.getByLabelText("Collaboration settings"));
		const toggle = await screen.findByRole("switch", {
			name: "Show remote cursors",
		});
		expect(toggle).toHaveAttribute("aria-checked", "true");

		fireEvent.click(toggle);

		expect(onShowRemoteCursorsChange).toHaveBeenCalledWith(false);
	});

	it("(b') fires onShowRemoteCursorsChange when the context setter is called directly", () => {
		const { adapter } = createFakeAdapter();
		const onShowRemoteCursorsChange = vi.fn();
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CollabUIProvider
				adapter={adapter}
				self={{ id: "alice" }}
				onShowRemoteCursorsChange={onShowRemoteCursorsChange}
			>
				{children}
			</CollabUIProvider>
		);
		const { result } = renderHook(() => useCollabCursorVisibility(), {
			wrapper,
		});

		act(() => result.current.setShowRemoteCursors(false));

		expect(onShowRemoteCursorsChange).toHaveBeenCalledWith(false);
		expect(result.current.showRemoteCursors).toBe(false);
	});
});

function ensurePointerEvent(): void {
	if (typeof PointerEvent === "undefined") {
		Object.defineProperty(globalThis, "PointerEvent", {
			configurable: true,
			value: MouseEvent,
		});
	}
}
