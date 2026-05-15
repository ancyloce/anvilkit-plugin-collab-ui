"use client";

import {
	Popover,
	PopoverTrigger,
	PopoverPanel,
	PopoverTitle,
} from "@anvilkit/ui/components/animate-ui/components/base/popover";
import { Switch } from "@anvilkit/ui/components/animate-ui/components/base/switch";
import { CopyButton } from "@anvilkit/ui/components/animate-ui/components/buttons/copy";
import { Settings } from "lucide-react";
import { type ChangeEvent, type ReactNode, useId, useState } from "react";

import { useCollabContext } from "../context.js";
import { cn } from "../lib/cn.js";

export interface CollabSettingsPopoverProps {
	readonly className?: string;
	readonly roomId?: string;
	readonly roomLink?: string;
	readonly onShowRemoteCursorsChange?: (show: boolean) => void;
	readonly initialShowRemoteCursors?: boolean;
}

export function CollabSettingsPopover(
	props: CollabSettingsPopoverProps,
): ReactNode {
	const { self, updateSelf } = useCollabContext();
	const nameId = useId();
	const colorId = useId();
	const cursorsId = useId();
	const [showRemoteCursors, setShowRemoteCursors] = useState(
		props.initialShowRemoteCursors ?? true,
	);

	function handleNameChange(event: ChangeEvent<HTMLInputElement>): void {
		updateSelf({ displayName: event.target.value });
	}

	function handleColorChange(event: ChangeEvent<HTMLInputElement>): void {
		updateSelf({ color: event.target.value });
	}

	function handleToggleCursors(next: boolean): void {
		setShowRemoteCursors(next);
		props.onShowRemoteCursorsChange?.(next);
	}

	const linkToCopy = props.roomLink ?? "";

	return (
		<Popover>
			<PopoverTrigger
				aria-label="Collaboration settings"
				data-slot="collab-settings-trigger"
				className={cn(
					"inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					props.className,
				)}
			>
				<Settings className="size-4" aria-hidden="true" />
			</PopoverTrigger>
			<PopoverPanel
				data-slot="collab-settings-popover"
				align="end"
				sideOffset={6}
				className="w-72"
			>
				<PopoverTitle className="font-medium">Collaboration</PopoverTitle>
				<form className="mt-3 grid gap-3">
					<label className="grid gap-1" htmlFor={nameId}>
						<span className="text-xs text-foreground/70">Display name</span>
						<input
							id={nameId}
							type="text"
							defaultValue={self.displayName ?? self.id}
							onChange={handleNameChange}
							className="h-8 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="grid gap-1" htmlFor={colorId}>
						<span className="text-xs text-foreground/70">Peer color</span>
						<input
							id={colorId}
							type="color"
							defaultValue={normalizeHexColor(self.color)}
							onChange={handleColorChange}
							className="h-8 w-16 cursor-pointer rounded-md border bg-background"
						/>
					</label>
					<div className="flex items-center justify-between gap-3">
						<span id={cursorsId} className="text-xs text-foreground/70">
							Show remote cursors
						</span>
						<Switch
							aria-labelledby={cursorsId}
							checked={showRemoteCursors}
							onCheckedChange={handleToggleCursors}
							nativeButton
						/>
					</div>
					{props.roomId !== undefined ? (
						<div className="grid gap-1">
							<span className="text-xs text-foreground/70">Room</span>
							<div className="flex items-center gap-2">
								<input
									type="text"
									readOnly
									value={props.roomId}
									className="h-8 flex-1 rounded-md border bg-muted px-2 text-sm"
								/>
								<CopyButton
									content={linkToCopy || props.roomId}
									aria-label="Copy room link"
									variant="outline"
									size="sm"
								/>
							</div>
						</div>
					) : null}
				</form>
			</PopoverPanel>
		</Popover>
	);
}

function normalizeHexColor(input: string | undefined): string {
	if (!input) return "#3b82f6";
	if (input.startsWith("#")) return input;
	return "#3b82f6";
}
