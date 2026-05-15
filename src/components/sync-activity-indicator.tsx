"use client";

import {
	Popover,
	PopoverTrigger,
	PopoverPanel,
	PopoverTitle,
} from "@anvilkit/ui/components/animate-ui/components/base/popover";
import { useId, type ReactNode } from "react";

import { useCollabStatus } from "../context.js";
import { cn } from "../lib/cn.js";
import type { ConnectionStatus } from "@anvilkit/plugin-collab-yjs";

const DOT_CLASS: Record<ConnectionStatus["kind"], string> = {
	connecting: "bg-slate-400 animate-pulse",
	synced: "bg-emerald-500",
	offline: "bg-amber-500",
	reconnecting: "bg-amber-500 animate-pulse",
	error: "bg-rose-500",
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

export interface SyncActivityIndicatorProps {
	readonly className?: string;
	readonly latencyMs?: number;
	readonly lastSyncAt?: string;
	readonly lastPeerName?: string;
}

export function SyncActivityIndicator(
	props: SyncActivityIndicatorProps,
): ReactNode {
	const status = useCollabStatus();
	const popoverId = useId();
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
					{statusLabel(status)}
				</span>
			</PopoverTrigger>
			<PopoverPanel
				id={popoverId}
				align="center"
				sideOffset={4}
				className="min-w-56 text-sm text-popover-foreground"
			>
				<PopoverTitle className="font-medium">
					{statusLabel(status)}
				</PopoverTitle>
				<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-foreground/70">
					{props.latencyMs !== undefined ? (
						<>
							<dt>Latency p95</dt>
							<dd>{props.latencyMs} ms</dd>
						</>
					) : null}
					{status.kind === "offline" ? (
						<>
							<dt>Queued edits</dt>
							<dd>{status.queuedEdits}</dd>
						</>
					) : null}
					{status.kind === "synced" ? (
						<>
							<dt>Synced since</dt>
							<dd>{formatTime(status.since)}</dd>
						</>
					) : null}
					{status.kind === "reconnecting" ? (
						<>
							<dt>Backoff</dt>
							<dd>{status.backoffMs} ms</dd>
						</>
					) : null}
					{status.kind === "error" ? (
						<>
							<dt>Reason</dt>
							<dd>{status.message}</dd>
						</>
					) : null}
					{props.lastSyncAt !== undefined ? (
						<>
							<dt>Last sync</dt>
							<dd>{formatTime(props.lastSyncAt)}</dd>
						</>
					) : null}
					{props.lastPeerName !== undefined ? (
						<>
							<dt>Last peer</dt>
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
