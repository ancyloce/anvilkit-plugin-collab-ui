"use client";

import { useMsg } from "@anvilkit/core/i18n";
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
 * Injectable copy for the force-resync dialog (F14). Defaults now resolve
 * from the shared `collabUi.*` catalog (localizable via the active locale);
 * a host still overrides per-mount by passing `labels` (the same injectable-
 * copy pattern as `ConflictNoticeCenter`'s `formatMessage`).
 */
export interface ForceResyncDialogLabels {
	readonly title?: string;
	readonly description?: string;
	readonly cancel?: string;
	readonly confirm?: string;
	readonly confirmBusy?: string;
}

export interface ForceResyncDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly onResynced?: () => void;
	readonly labels?: ForceResyncDialogLabels;
}

export function ForceResyncDialog(props: ForceResyncDialogProps): ReactNode {
	const msg = useMsg();
	const adapter = useCollabAdapter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const labels = {
		title: msg("collabUi.resync.title"),
		description: msg("collabUi.resync.description"),
		cancel: msg("collabUi.resync.cancel"),
		confirm: msg("collabUi.resync.confirm"),
		confirmBusy: msg("collabUi.resync.confirmBusy"),
		...props.labels,
	};

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
