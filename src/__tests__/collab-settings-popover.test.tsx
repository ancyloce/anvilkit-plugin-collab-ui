import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollabSettingsPopover } from "../components/collab-settings-popover.js";
import { CollabUIProvider } from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter } from "./test-utils.js";

describe("<CollabSettingsPopover />", () => {
	it("renders the trigger with an accessible label", () => {
		const { adapter } = createFakeAdapter();
		const { container } = render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<CollabSettingsPopover roomId="demo" />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);
		const trigger = container.querySelector(
			"[data-slot=collab-settings-trigger]",
		);
		expect(trigger).not.toBeNull();
		expect(trigger?.getAttribute("aria-label")).toBe("Collaboration settings");
	});

	it("toggles the shared cursor-visibility context and notifies the host", async () => {
		ensurePointerEvent();
		const { adapter } = createFakeAdapter();
		const onShowRemoteCursorsChange = vi.fn();
		render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<CollabSettingsPopover
						roomId="demo"
						onShowRemoteCursorsChange={onShowRemoteCursorsChange}
					/>
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		fireEvent.click(screen.getByLabelText("Collaboration settings"));
		const toggle = await screen.findByRole("switch", {
			name: "Show remote cursors",
		});

		// Source of truth is <CollabUIProvider> context, which defaults
		// to visible (review §C3 / §4.3).
		expect(toggle).toHaveAttribute("aria-checked", "true");
		expect(toggle).toHaveAttribute("data-checked", "");

		fireEvent.click(toggle);

		expect(onShowRemoteCursorsChange).toHaveBeenCalledWith(false);
		await waitFor(() => {
			expect(toggle).toHaveAttribute("aria-checked", "false");
			expect(toggle).toHaveAttribute("data-unchecked", "");
		});
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
