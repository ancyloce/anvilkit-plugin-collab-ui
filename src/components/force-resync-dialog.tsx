"use client";

import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@anvilkit/ui/dialog";
import { useState, type ReactNode } from "react";

import { useCollabAdapter } from "../context.js";

export interface ForceResyncDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly onResynced?: () => void;
}

export function ForceResyncDialog(props: ForceResyncDialogProps): ReactNode {
	const adapter = useCollabAdapter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
				<DialogTitle>Force resync from latest snapshot?</DialogTitle>
				<DialogDescription>
					Your local unsaved edits will be discarded. The latest saved snapshot
					will replace your view.
				</DialogDescription>
				{error !== null ? (
					<p
						role="alert"
						className="text-sm text-rose-600"
						data-testid="force-resync-error"
					>
						{error}
					</p>
				) : null}
				<DialogFooter>
					<DialogClose
						className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted"
						disabled={busy}
					>
						Cancel
					</DialogClose>
					<button
						type="button"
						className="inline-flex h-9 items-center justify-center rounded-md bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
						onClick={() => {
							void handleConfirm();
						}}
						disabled={busy}
						data-testid="force-resync-confirm"
					>
						{busy ? "Resyncing…" : "Force Resync"}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
