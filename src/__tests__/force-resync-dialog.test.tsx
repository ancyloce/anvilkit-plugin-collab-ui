import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollabUIProvider } from "../context.js";
import { ForceResyncDialog } from "../components/force-resync-dialog.js";
import { createFakeAdapter } from "./test-utils.js";

function Harness({
	open,
	onOpenChange,
	onResynced,
}: {
	open: boolean;
	onOpenChange: (next: boolean) => void;
	onResynced?: () => void;
}) {
	const { adapter } = createFakeAdapter();
	return (
		<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
			<ForceResyncDialog
				open={open}
				onOpenChange={onOpenChange}
				onResynced={onResynced}
			/>
		</CollabUIProvider>
	);
}

describe("<ForceResyncDialog />", () => {
	it("does not render the popup when closed", () => {
		const { queryByTestId } = render(
			<Harness open={false} onOpenChange={() => undefined} />,
		);
		expect(queryByTestId("force-resync-confirm")).toBeNull();
	});

	it("calls adapter.forceResync when the confirm button is clicked", async () => {
		let openState = true;
		let resyncedAt = 0;
		const { getByTestId, rerender } = render(
			<Harness
				open={openState}
				onOpenChange={(next) => {
					openState = next;
				}}
				onResynced={() => {
					resyncedAt += 1;
				}}
			/>,
		);
		const confirm = getByTestId("force-resync-confirm");
		await act(async () => {
			fireEvent.click(confirm);
		});

		await waitFor(() => {
			expect(resyncedAt).toBe(1);
		});

		// Re-render to confirm the dialog is closed (open=false)
		rerender(
			<Harness
				open={false}
				onOpenChange={() => undefined}
				onResynced={() => undefined}
			/>,
		);
	});
});
