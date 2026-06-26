"use client";

import { useMsg } from "@anvilkit/core/i18n";
import { Button } from "@anvilkit/ui/button";
import { Redo2, Undo2 } from "lucide-react";
import type { ReactNode } from "react";

import { useCollabUndoState } from "../context.js";
import { cn } from "../lib/cn.js";

/** Props for {@link CollabUndoRedoControls} — the toolbar undo/redo button pair. */
export interface CollabUndoRedoControlsProps {
	readonly className?: string;
}

/**
 * Toolbar pair of undo / redo buttons wired to the adapter's local
 * undo/redo stack via {@link useCollabUndoState} (§4.1.2). Each button's
 * disabled state is driven straight from the adapter's `canUndo()` /
 * `canRedo()` getters — when undo is disabled (or the adapter predates the
 * controller) both buttons render disabled and stay inert.
 *
 * Mount inside `<CollabUIProvider>`; outside `<Studio>` also nest within
 * `<CollabUII18nProvider>` so the labels resolve from the shared
 * `collabUi.*` catalog.
 */
export function CollabUndoRedoControls(
	props: CollabUndoRedoControlsProps,
): ReactNode {
	const msg = useMsg();
	const { canUndo, canRedo, undo, redo } = useCollabUndoState();
	return (
		<div
			data-slot="collab-undo-redo-controls"
			className={cn("flex items-center gap-1", props.className)}
		>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				disabled={!canUndo}
				onClick={undo}
				aria-label={msg("collabUi.undo.undo")}
				data-slot="collab-undo"
				data-testid="collab-undo"
			>
				<Undo2 aria-hidden="true" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				disabled={!canRedo}
				onClick={redo}
				aria-label={msg("collabUi.undo.redo")}
				data-slot="collab-redo"
				data-testid="collab-redo"
			>
				<Redo2 aria-hidden="true" />
			</Button>
		</div>
	);
}
