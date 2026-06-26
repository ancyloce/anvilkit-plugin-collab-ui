"use client";

import { useMsg } from "@anvilkit/core/i18n";
import type { ConnectionStatus } from "@anvilkit/plugin-collab-yjs";
import { Button } from "@anvilkit/ui/button";
import type { ReactNode } from "react";

import { useCollabStatus } from "../context.js";
import { cn } from "../lib/cn.js";

/** The `useMsg()` resolver shape, threaded into the standalone formatters. */
type Msg = (key: string, fallback?: string) => string;

/**
 * The connection states the banner surfaces. Healthy states
 * (`connecting`/`synced`) render nothing — the inline
 * `<SyncActivityIndicator>` already covers them; this banner is the
 * proactive recovery prompt for the degraded path (H4 / §4.1.4).
 */
type RecoveryStatus = Extract<
	ConnectionStatus,
	{ kind: "offline" | "reconnecting" | "error" }
>;

function isRecoveryStatus(status: ConnectionStatus): status is RecoveryStatus {
	return (
		status.kind === "offline" ||
		status.kind === "reconnecting" ||
		status.kind === "error"
	);
}

/**
 * Injectable copy for the recovery banner (F14 pattern, mirroring
 * `ForceResyncDialogLabels`). Defaults resolve from the shared
 * `collabUi.recovery.*` catalog (localizable via the active locale); a host
 * still overrides per-mount by passing `labels`.
 */
export interface ConnectionRecoveryBannerLabels {
	readonly offlineTitle?: string;
	readonly offlineBody?: string;
	readonly reconnectingTitle?: string;
	readonly reconnectingBody?: string;
	readonly errorTitle?: string;
	readonly errorBody?: string;
	readonly retry?: string;
	readonly export?: string;
	readonly forceResync?: string;
}

/** Props for {@link ConnectionRecoveryBanner} — the degraded-connection recovery prompt and its host actions. */
export interface ConnectionRecoveryBannerProps {
	readonly className?: string;
	/**
	 * Host-provided recovery actions. Each renders a localized
	 * `@anvilkit/ui` Button only when supplied; with none provided the
	 * banner stays informational (status + reason).
	 */
	readonly onRetry?: () => void;
	readonly onExport?: () => void;
	readonly onForceResync?: () => void;
	readonly labels?: ConnectionRecoveryBannerLabels;
}

function recoveryTitle(
	status: RecoveryStatus,
	labels: Required<ConnectionRecoveryBannerLabels>,
): string {
	switch (status.kind) {
		case "offline":
			return labels.offlineTitle;
		case "reconnecting":
			return labels.reconnectingTitle;
		case "error":
			return labels.errorTitle;
	}
}

function recoveryBody(
	status: RecoveryStatus,
	labels: Required<ConnectionRecoveryBannerLabels>,
): string {
	switch (status.kind) {
		case "offline":
			return labels.offlineBody.replace("{queued}", String(status.queuedEdits));
		case "reconnecting":
			return labels.reconnectingBody.replace(
				"{attempt}",
				String(status.attempt),
			);
		case "error":
			return labels.errorBody.replace("{message}", status.message);
	}
}

function buildDefaultLabels(
	msg: Msg,
): Required<ConnectionRecoveryBannerLabels> {
	return {
		offlineTitle: msg("collabUi.recovery.offlineTitle"),
		offlineBody: msg("collabUi.recovery.offlineBody"),
		reconnectingTitle: msg("collabUi.recovery.reconnectingTitle"),
		reconnectingBody: msg("collabUi.recovery.reconnectingBody"),
		errorTitle: msg("collabUi.recovery.errorTitle"),
		errorBody: msg("collabUi.recovery.errorBody"),
		retry: msg("collabUi.recovery.retry"),
		export: msg("collabUi.recovery.export"),
		forceResync: msg("collabUi.recovery.forceResync"),
	};
}

/**
 * Proactive disconnect-recovery banner (H4 / §4.1.4). Reads connection
 * status via {@link useCollabStatus} and renders ONLY while the session is
 * degraded (`offline`/`reconnecting`/`error`) — otherwise returns `null`,
 * so a host can mount it unconditionally above the editor chrome.
 *
 * It surfaces localized recovery copy plus whichever host actions were
 * wired (`onRetry` / `onExport` / `onForceResync`), each rendered with a
 * shared `@anvilkit/ui` Button. With no actions provided it degrades to an
 * informational banner (status + reason). The region is an accessible
 * `role="status"` (`aria-live="polite"`) for non-terminal states and
 * `role="alert"` for the error state, using semantic theme tokens so it
 * stays light/dark-aware.
 */
export function ConnectionRecoveryBanner(
	props: ConnectionRecoveryBannerProps,
): ReactNode {
	const msg = useMsg();
	const status = useCollabStatus();
	if (!isRecoveryStatus(status)) return null;

	const labels: Required<ConnectionRecoveryBannerLabels> = {
		...buildDefaultLabels(msg),
		...props.labels,
	};
	const isError = status.kind === "error";
	const hasActions =
		props.onRetry !== undefined ||
		props.onExport !== undefined ||
		props.onForceResync !== undefined;

	return (
		<div
			data-slot="connection-recovery-banner"
			data-testid="connection-recovery-banner"
			data-status={status.kind}
			role={isError ? "alert" : "status"}
			aria-live={isError ? "assertive" : "polite"}
			className={cn(
				"flex flex-col gap-2 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between",
				isError
					? "border-destructive/40 bg-destructive/10 text-destructive"
					: "border-border bg-muted text-muted-foreground",
				props.className,
			)}
		>
			<div className="min-w-0">
				<p className="font-medium" data-testid="connection-recovery-title">
					{recoveryTitle(status, labels)}
				</p>
				<p
					className="text-xs opacity-90"
					data-testid="connection-recovery-body"
				>
					{recoveryBody(status, labels)}
				</p>
			</div>
			{hasActions ? (
				<div className="flex shrink-0 flex-wrap gap-2">
					{props.onRetry !== undefined ? (
						<Button
							type="button"
							size="sm"
							variant={isError ? "default" : "outline"}
							onClick={props.onRetry}
							data-testid="connection-recovery-retry"
						>
							{labels.retry}
						</Button>
					) : null}
					{props.onExport !== undefined ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={props.onExport}
							data-testid="connection-recovery-export"
						>
							{labels.export}
						</Button>
					) : null}
					{props.onForceResync !== undefined ? (
						<Button
							type="button"
							size="sm"
							variant="destructive"
							onClick={props.onForceResync}
							data-testid="connection-recovery-force-resync"
						>
							{labels.forceResync}
						</Button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
