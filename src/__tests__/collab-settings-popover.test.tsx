import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
		expect(trigger?.getAttribute("aria-label")).toBe(
			"Collaboration settings",
		);
	});
});
