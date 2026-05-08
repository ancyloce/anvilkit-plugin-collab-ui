"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useState, type ReactNode } from "react";

import { useCollabAdapter } from "../context.js";
import { cn } from "../lib/cn.js";

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
		<AlertDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<AlertDialog.Portal>
				<AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
				<AlertDialog.Popup
					data-slot="force-resync-dialog"
					className={cn(
						"fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2",
						"rounded-lg border bg-background p-6 shadow-lg outline-hidden",
					)}
				>
					<AlertDialog.Title className="text-lg font-semibold">
						Force resync from latest snapshot?
					</AlertDialog.Title>
					<AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
						Your local unsaved edits will be discarded. The latest saved
						snapshot will replace your view.
					</AlertDialog.Description>
					{error !== null ? (
						<p
							role="alert"
							className="mt-3 text-sm text-rose-600"
							data-testid="force-resync-error"
						>
							{error}
						</p>
					) : null}
					<div className="mt-6 flex justify-end gap-2">
						<AlertDialog.Close
							className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted"
							disabled={busy}
						>
							Cancel
						</AlertDialog.Close>
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
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	);
}
