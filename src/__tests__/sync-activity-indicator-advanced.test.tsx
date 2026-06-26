/**
 * Regression coverage for report finding 4.3.2 — the optional
 * `showAdvancedDiagnostics` prop on {@link SyncActivityIndicator}. It surfaces
 * adapter-metric rows (coalescing + conversion/dispatch latency) that the
 * indicator polls via `useCollabMetrics` but never rendered. Default output
 * (prop absent/false) must stay byte-identical, and `null`/absent metric
 * fields must not render empty rows.
 */

import type { MetricsSnapshot } from "@anvilkit/plugin-collab-yjs";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SyncActivityIndicator } from "../components/sync-activity-indicator.js";
import { CollabUIProvider } from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter } from "./test-utils.js";

/**
 * A full snapshot with populated advanced fields, but `dispatchTimeP50Ms`
 * left `null` so the undefined-guard branch is exercised under the flag.
 */
const METRICS: MetricsSnapshot = {
	saveCount: 12,
	transportWrites: 6,
	saveCoalescingRatio: 0.5,
	dispatchFailures: 2,
	awarenessChurn: 9,
	syncLatencyP50Ms: 18,
	syncLatencyP95Ms: 42,
	syncLatencySamples: 7,
	degraded: true,
	degradedReasons: [],
	presenceValidationFailures: 3,
	inboundCoalesced: 4,
	inboundQueueDelayP50Ms: 11,
	conversionTimeP50Ms: 5,
	dispatchTimeP50Ms: null, // intentionally absent → must NOT render a row
	saveEncodeTimeP50Ms: null,
	nativeApplyTimeP50Ms: null,
	nativeReadTimeP50Ms: null,
};

function openPanel(showAdvancedDiagnostics: boolean) {
	const { adapter } = createFakeAdapter({ metricsValue: METRICS });
	const utils = render(
		<CollabUII18nProvider>
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				<SyncActivityIndicator
					showAdvancedDiagnostics={showAdvancedDiagnostics}
				/>
			</CollabUIProvider>
		</CollabUII18nProvider>,
	);
	const trigger = utils.container.querySelector(
		"[data-slot=sync-activity-indicator]",
	);
	expect(trigger).not.toBeNull();
	fireEvent.click(trigger as Element);
	return utils;
}

describe("<SyncActivityIndicator showAdvancedDiagnostics />", () => {
	it("renders advanced diagnostics rows with localized labels + values", async () => {
		const { findByTestId, getByText } = openPanel(true);

		// p50 latency (number | null, populated).
		expect((await findByTestId("sync-latency-p50")).textContent).toBe("18 ms");
		expect(getByText("Latency p50")).toBeTruthy();

		// coalescing diagnostics.
		expect((await findByTestId("sync-coalescing-ratio")).textContent).toBe(
			"0.5",
		);
		expect(getByText("Save coalescing")).toBeTruthy();
		expect((await findByTestId("sync-inbound-coalesced")).textContent).toBe(
			"4",
		);
		expect(getByText("Inbound coalesced")).toBeTruthy();

		// conversion / queue latency.
		expect((await findByTestId("sync-queue-delay-p50")).textContent).toBe(
			"11 ms",
		);
		expect(getByText("Queue delay p50")).toBeTruthy();
		expect((await findByTestId("sync-conversion-p50")).textContent).toBe(
			"5 ms",
		);
		expect(getByText("Conversion p50")).toBeTruthy();

		// churn / failure counters (render even at non-zero count).
		expect((await findByTestId("sync-dispatch-failures")).textContent).toBe(
			"2",
		);
		expect(getByText("Dispatch failures")).toBeTruthy();
		expect((await findByTestId("sync-awareness-churn")).textContent).toBe("9");
		expect(getByText("Awareness churn")).toBeTruthy();
	});

	it("omits a row whose metric field is null (dispatch p50)", () => {
		const { queryByTestId, queryByText } = openPanel(true);
		expect(queryByTestId("sync-dispatch-p50")).toBeNull();
		expect(queryByText("Dispatch p50")).toBeNull();
	});

	it("does NOT render advanced rows when the prop is absent, but keeps existing rows", () => {
		const { queryByTestId } = openPanel(false);

		// Advanced rows are gone.
		expect(queryByTestId("sync-latency-p50")).toBeNull();
		expect(queryByTestId("sync-coalescing-ratio")).toBeNull();
		expect(queryByTestId("sync-inbound-coalesced")).toBeNull();
		expect(queryByTestId("sync-queue-delay-p50")).toBeNull();
		expect(queryByTestId("sync-conversion-p50")).toBeNull();
		expect(queryByTestId("sync-dispatch-failures")).toBeNull();
		expect(queryByTestId("sync-awareness-churn")).toBeNull();

		// Existing metric rows are unaffected.
		expect(queryByTestId("sync-degraded")?.textContent).toBe("Degraded");
		expect(queryByTestId("sync-validation-failures")?.textContent).toBe("3");
	});
});
