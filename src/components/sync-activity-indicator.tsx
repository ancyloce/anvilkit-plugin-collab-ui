"use client";

import type { ConnectionStatus } from "@anvilkit/plugin-collab-yjs";
import {
	Popover,
	PopoverPanel,
	PopoverTitle,
	PopoverTrigger,
} from "@anvilkit/ui/components/animate-ui/components/base/popover";
import { type ReactNode, useId } from "react";
import { useCollabMetrics, useCollabStatus } from "../context.js";
import { cn } from "../lib/cn.js";

// Semantic tokens only (review §B3). The theme defines no `warning`
// token, so non-terminal states fall back to `muted-foreground`;
// `synced` uses `primary`, `error` uses `destructive`. This keeps the
// dot theme-aware (light/dark) instead of hard-coding palette colors.
const DOT_CLASS: Record<ConnectionStatus["kind"], string> = {
	connecting: "bg-muted-foreground animate-pulse",
	synced: "bg-primary",
	offline: "bg-muted-foreground",
	reconnecting: "bg-muted-foreground animate-pulse",
	error: "bg-destructive",
};

function statusLabel(status: ConnectionStatus): string {
	switch (status.kind) {
		case "connecting":
			return "Connecting…";
		case "synced":
			return "Synced";
		case "offline":
			return `Offline · ${status.queuedEdits} queued`;
		case "reconnecting":
			return `Reconnecting (try ${status.attempt})`;
		case "error":
			return "Sync error";
	}
}

/**
 * Injectable copy for the sync activity panel's static term labels (F14).
 * Defaults are English; a host localizes by passing overrides. The status
 * line itself (with its interpolation) is overridden via `formatStatus`.
 * Per the CLAUDE.md i18n convention, copy is injected — no translations
 * are bundled here.
 */
export interface SyncActivityLabels {
	readonly latencyP95?: string;
	readonly mode?: string;
	readonly degraded?: string;
	readonly presenceErrors?: string;
	readonly queuedEdits?: string;
	readonly syncedSince?: string;
	readonly backoff?: string;
	readonly reason?: string;
	readonly lastSync?: string;
	readonly lastPeer?: string;
}

const DEFAULT_SYNC_LABELS = {
	latencyP95: "Latency p95",
	mode: "Mode",
	degraded: "Degraded",
	presenceErrors: "Presence errors",
	queuedEdits: "Queued edits",
	syncedSince: "Synced since",
	backoff: "Backoff",
	reason: "Reason",
	lastSync: "Last sync",
	lastPeer: "Last peer",
} as const;

export interface SyncActivityIndicatorProps {
	readonly className?: string;
	readonly latencyMs?: number;
	readonly lastSyncAt?: string;
	readonly lastPeerName?: string;
	/** Override the status-line copy (incl. interpolated offline/reconnecting forms). */
	readonly formatStatus?: (status: ConnectionStatus) => string;
	readonly labels?: SyncActivityLabels;
}

export function SyncActivityIndicator(
	props: SyncActivityIndicatorProps,
): ReactNode {
	const status = useCollabStatus();
	const metrics = useCollabMetrics();
	const popoverId = useId();
	// Manual props win as host overrides; otherwise fall back to live
	// adapter metrics (review §C5 / §4.5).
	const latencyMs = props.latencyMs ?? metrics?.syncLatencyP95Ms ?? undefined;
	const validationFailures = metrics?.presenceValidationFailures ?? 0;
	// F14 — injectable copy with English defaults.
	const renderStatus = props.formatStatus ?? statusLabel;
	const labels = { ...DEFAULT_SYNC_LABELS, ...props.labels };
	return (
		<Popover>
			<PopoverTrigger
				aria-describedby={popoverId}
				className={cn(
					"inline-flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					props.className,
				)}
				data-status={status.kind}
				data-slot="sync-activity-indicator"
			>
				<span
					aria-hidden="true"
					className={cn(
						"inline-block size-2 rounded-full",
						DOT_CLASS[status.kind],
					)}
				/>
				<span
					aria-live="polite"
					className="text-foreground/80"
					data-testid="sync-activity-indicator-label"
				>
					{renderStatus(status)}
				</span>
			</PopoverTrigger>
			<PopoverPanel
				id={popoverId}
				align="center"
				sideOffset={4}
				className="min-w-56 text-sm text-popover-foreground"
			>
				<PopoverTitle className="font-medium">
					{renderStatus(status)}
				</PopoverTitle>
				<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-foreground/70">
					{latencyMs !== undefined && latencyMs !== null ? (
						<>
							<dt>{labels.latencyP95}</dt>
							<dd>{latencyMs} ms</dd>
						</>
					) : null}
					{metrics?.degraded ? (
						<>
							<dt>{labels.mode}</dt>
							<dd data-testid="sync-degraded">{labels.degraded}</dd>
						</>
					) : null}
					{validationFailures > 0 ? (
						<>
							<dt>{labels.presenceErrors}</dt>
							<dd data-testid="sync-validation-failures">
								{validationFailures}
							</dd>
						</>
					) : null}
					{status.kind === "offline" ? (
						<>
							<dt>{labels.queuedEdits}</dt>
							<dd>{status.queuedEdits}</dd>
						</>
					) : null}
					{status.kind === "synced" ? (
						<>
							<dt>{labels.syncedSince}</dt>
							<dd>{formatTime(status.since)}</dd>
						</>
					) : null}
					{status.kind === "reconnecting" ? (
						<>
							<dt>{labels.backoff}</dt>
							<dd>{status.backoffMs} ms</dd>
						</>
					) : null}
					{status.kind === "error" ? (
						<>
							<dt>{labels.reason}</dt>
							<dd>{status.message}</dd>
						</>
					) : null}
					{props.lastSyncAt !== undefined ? (
						<>
							<dt>{labels.lastSync}</dt>
							<dd>{formatTime(props.lastSyncAt)}</dd>
						</>
					) : null}
					{props.lastPeerName !== undefined ? (
						<>
							<dt>{labels.lastPeer}</dt>
							<dd>{props.lastPeerName}</dd>
						</>
					) : null}
				</dl>
			</PopoverPanel>
		</Popover>
	);
}

function formatTime(iso: string): string {
	try {
		return new Date(iso).toLocaleTimeString();
	} catch {
		return iso;
	}
}
