import type { ConnectionStatus } from "@anvilkit/plugin-collab-yjs";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectionRecoveryBanner } from "../components/connection-recovery-banner.js";
import { CollabUIProvider } from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter, type FakeAdapterControls } from "./test-utils.js";

function renderBanner(
	initialStatus: ConnectionStatus,
	props: {
		onRetry?: () => void;
		onExport?: () => void;
		onForceResync?: () => void;
	} = {},
): {
	controls: FakeAdapterControls;
	result: ReturnType<typeof render>;
} {
	const { adapter, controls } = createFakeAdapter({ initialStatus });
	const result = render(
		<CollabUII18nProvider>
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				<ConnectionRecoveryBanner {...props} />
			</CollabUIProvider>
		</CollabUII18nProvider>,
	);
	return { controls, result };
}

describe("<ConnectionRecoveryBanner />", () => {
	it("renders with recovery actions when offline and clicking each calls its callback", () => {
		let retries = 0;
		let exports = 0;
		let resyncs = 0;
		const { result } = renderBanner(
			{ kind: "offline", since: "now", queuedEdits: 3 },
			{
				onRetry: () => {
					retries += 1;
				},
				onExport: () => {
					exports += 1;
				},
				onForceResync: () => {
					resyncs += 1;
				},
			},
		);
		const banner = result.getByTestId("connection-recovery-banner");
		expect(banner).not.toBeNull();
		// Non-error states are a polite status region.
		expect(banner.getAttribute("role")).toBe("status");
		expect(banner.getAttribute("aria-live")).toBe("polite");

		fireEvent.click(result.getByTestId("connection-recovery-retry"));
		fireEvent.click(result.getByTestId("connection-recovery-export"));
		fireEvent.click(result.getByTestId("connection-recovery-force-resync"));
		expect(retries).toBe(1);
		expect(exports).toBe(1);
		expect(resyncs).toBe(1);
	});

	it("uses role=alert on error status and renders only provided actions", () => {
		let retries = 0;
		const { result } = renderBanner(
			{ kind: "error", message: "auth failed", recoverable: false },
			{
				onRetry: () => {
					retries += 1;
				},
			},
		);
		const banner = result.getByTestId("connection-recovery-banner");
		expect(banner.getAttribute("role")).toBe("alert");
		// Only the retry action was provided.
		expect(result.queryByTestId("connection-recovery-export")).toBeNull();
		expect(result.queryByTestId("connection-recovery-force-resync")).toBeNull();
		fireEvent.click(result.getByTestId("connection-recovery-retry"));
		expect(retries).toBe(1);
	});

	it("renders an informational banner when no callbacks are provided", () => {
		const { result } = renderBanner({
			kind: "reconnecting",
			attempt: 2,
			backoffMs: 500,
		});
		const banner = result.getByTestId("connection-recovery-banner");
		expect(banner).not.toBeNull();
		expect(result.queryByTestId("connection-recovery-retry")).toBeNull();
		expect(result.queryByTestId("connection-recovery-export")).toBeNull();
		expect(result.queryByTestId("connection-recovery-force-resync")).toBeNull();
	});

	it("renders null on healthy status (connecting / synced)", () => {
		const { controls, result } = renderBanner({ kind: "connecting" });
		expect(result.queryByTestId("connection-recovery-banner")).toBeNull();

		act(() => controls.emitStatus({ kind: "synced", since: "now" }));
		expect(result.queryByTestId("connection-recovery-banner")).toBeNull();
	});
});
