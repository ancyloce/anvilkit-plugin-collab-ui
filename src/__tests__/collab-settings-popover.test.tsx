import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CollabSettingsPopover } from "../components/collab-settings-popover.js";
import { CollabUIProvider } from "../context.js";
import { createFakeAdapter } from "./test-utils.js";

describe("<CollabSettingsPopover />", () => {
	it("renders the trigger with an accessible label", () => {
		const { adapter } = createFakeAdapter();
		const { container } = render(
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				<CollabSettingsPopover roomId="demo" />
			</CollabUIProvider>,
		);
		const trigger = container.querySelector(
			"[data-slot=collab-settings-trigger]",
		);
		expect(trigger).not.toBeNull();
		expect(trigger?.getAttribute("aria-label")).toBe("Collaboration settings");
	});

	it("toggles the remote cursor setting and updates its visual state", async () => {
		ensurePointerEvent();
		const { adapter } = createFakeAdapter();
		const onShowRemoteCursorsChange = vi.fn();
		render(
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				<CollabSettingsPopover
					roomId="demo"
					initialShowRemoteCursors={false}
					onShowRemoteCursorsChange={onShowRemoteCursorsChange}
				/>
			</CollabUIProvider>,
		);

		fireEvent.click(screen.getByLabelText("Collaboration settings"));
		const toggle = await screen.findByRole("switch", {
			name: "Show remote cursors",
		});

		expect(toggle).toHaveAttribute("aria-checked", "false");
		expect(toggle).toHaveAttribute("data-unchecked", "");

		fireEvent.click(toggle);

		expect(onShowRemoteCursorsChange).toHaveBeenCalledWith(true);
		await waitFor(() => {
			expect(toggle).toHaveAttribute("aria-checked", "true");
			expect(toggle).toHaveAttribute("data-checked", "");
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
