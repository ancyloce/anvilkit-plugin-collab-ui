import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

	it("defers locale-dependent time formatting until after server render", () => {
		const { adapter } = createFakeAdapter();
		const toLocaleTimeString = vi
			.spyOn(Date.prototype, "toLocaleTimeString")
			.mockReturnValue("LOCAL TIME");

		renderToString(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<SyncActivityIndicator lastSyncAt="2026-07-15T12:00:00.000Z" />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		expect(toLocaleTimeString).not.toHaveBeenCalled();

		render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<SyncActivityIndicator lastSyncAt="2026-07-15T12:00:00.000Z" />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);
		expect(toLocaleTimeString).toHaveBeenCalled();
		toLocaleTimeString.mockRestore();
	});
});
