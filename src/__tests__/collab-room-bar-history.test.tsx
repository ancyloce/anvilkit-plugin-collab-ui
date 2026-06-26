import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CollabRoomBar } from "../components/collab-room-bar.js";
import { CollabUIProvider } from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter } from "./test-utils.js";

describe("<CollabRoomBar /> history entry point", () => {
	it("renders a localized history button that invokes onOpenHistory on click", () => {
		const { adapter } = createFakeAdapter();
		const onOpenHistory = vi.fn();
		render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<CollabRoomBar onOpenHistory={onOpenHistory} />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		const button = screen.getByTestId("collab-room-bar-history");
		// The accessible label must be the localized string, not the raw key.
		expect(button).toHaveAttribute("aria-label", "Version history");

		fireEvent.click(button);
		expect(onOpenHistory).toHaveBeenCalledTimes(1);
	});

	it("renders no history button when onOpenHistory is absent", () => {
		const { adapter } = createFakeAdapter();
		const { container } = render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<CollabRoomBar title="Marketing Page" />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		expect(screen.queryByTestId("collab-room-bar-history")).toBeNull();
		expect(
			container.querySelector("[data-slot=collab-room-bar-history]"),
		).toBeNull();
	});
});
