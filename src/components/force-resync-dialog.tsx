"use client";

import { Button } from "@anvilkit/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@anvilkit/ui/dialog";
import { type ReactNode, useState } from "react";

import { useCollabAdapter } from "../context.js";

/**
 * Injectable copy for the force-resync dialog (F14). Defaults are
 * English; a host localizes by passing overrides (the same injectable-
 * copy pattern as `ConflictNoticeCenter`'s `formatMessage`). Per the
 * CLAUDE.md i18n convention, copy is injected — no translations are
 * bundled here.
 */
export interface ForceResyncDialogLabels {
	readonly title?: string;
	readonly description?: string;
	readonly cancel?: string;
	readonly confirm?: string;
	readonly confirmBusy?: string;
}

const DEFAULT_RESYNC_LABELS = {
	title: "Force resync from latest snapshot?",
	description:
		"Your local unsaved edits will be discarded. The latest saved snapshot will replace your view.",
	cancel: "Cancel",
	confirm: "Force Resync",
	confirmBusy: "Resyncing...",
} as const;

export interface ForceResyncDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly onResynced?: () => void;
	readonly labels?: ForceResyncDialogLabels;
}

export function ForceResyncDialog(props: ForceResyncDialogProps): ReactNode {
	const adapter = useCollabAdapter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const labels = { ...DEFAULT_RESYNC_LABELS, ...props.labels };

	async function handleConfirm(): Promise<void> {
		setError(null);
		setBusy(true);
		try {
			await adapter.forceResync();
			props.onResynced?.();
			props.onOpenChange(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent
				data-slot="force-resync-dialog"
				showCloseButton={false}
				className="max-w-md"
			>
				<DialogTitle>{labels.title}</DialogTitle>
				<DialogDescription>{labels.description}</DialogDescription>
				{error !== null ? (
					<p
						role="alert"
						className="text-sm text-destructive"
						data-testid="force-resync-error"
					>
						{error}
					</p>
				) : null}
				<DialogFooter>
					<DialogClose
						render={<Button type="button" variant="outline" disabled={busy} />}
					>
						{labels.cancel}
					</DialogClose>
					<Button
						type="button"
						variant="destructive"
						onClick={() => {
							void handleConfirm();
						}}
						disabled={busy}
						data-testid="force-resync-confirm"
					>
						{busy ? labels.confirmBusy : labels.confirm}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
