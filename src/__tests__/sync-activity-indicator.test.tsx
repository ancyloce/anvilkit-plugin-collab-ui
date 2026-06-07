import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SyncActivityIndicator } from "../components/sync-activity-indicator.js";
import { CollabUIProvider } from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter } from "./test-utils.js";

describe("<SyncActivityIndicator />", () => {
	it("renders the connecting label by default", () => {
		const { adapter } = createFakeAdapter();
		const { getByTestId } = render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<SyncActivityIndicator />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);
		expect(getByTestId("sync-activity-indicator-label").textContent).toBe(
			"Connecting…",
		);
	});

	it("updates the label as the adapter status changes", () => {
		const { adapter, controls } = createFakeAdapter();
		const { getByTestId } = render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<SyncActivityIndicator />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		act(() => controls.emitStatus({ kind: "synced", since: "now" }));
		expect(getByTestId("sync-activity-indicator-label").textContent).toBe(
			"Synced",
		);

		act(() =>
			controls.emitStatus({
				kind: "offline",
				since: "now",
				queuedEdits: 7,
			}),
		);
		expect(getByTestId("sync-activity-indicator-label").textContent).toBe(
			"Offline · 7 queued",
		);

		act(() =>
			controls.emitStatus({
				kind: "reconnecting",
				attempt: 2,
				backoffMs: 500,
			}),
		);
		expect(getByTestId("sync-activity-indicator-label").textContent).toBe(
			"Reconnecting (try 2)",
		);

		act(() =>
			controls.emitStatus({
				kind: "error",
				message: "auth failed",
				recoverable: false,
			}),
		);
		expect(getByTestId("sync-activity-indicator-label").textContent).toBe(
			"Sync error",
		);
	});
});
