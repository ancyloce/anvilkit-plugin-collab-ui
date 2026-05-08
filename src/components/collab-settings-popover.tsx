"use client";

import { Popover } from "@base-ui/react/popover";
import { Switch } from "@base-ui/react/switch";
import { Settings } from "lucide-react";
import { useId, useState, type ChangeEvent, type ReactNode } from "react";

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
	const [copied, setCopied] = useState(false);
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

	function handleCopyLink(): void {
		const link = props.roomLink ?? window.location.href;
		void navigator.clipboard?.writeText(link);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<Popover.Root>
			<Popover.Trigger
				aria-label="Collaboration settings"
				data-slot="collab-settings-trigger"
				className={cn(
					"inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					props.className,
				)}
			>
				<Settings className="size-4" aria-hidden="true" />
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner sideOffset={6}>
					<Popover.Popup
						data-slot="collab-settings-popover"
						className="z-50 w-72 rounded-md border bg-popover p-4 text-sm text-popover-foreground shadow-md outline-hidden"
					>
						<Popover.Title className="font-medium">
							Collaboration
						</Popover.Title>
						<form className="mt-3 grid gap-3">
							<label className="grid gap-1" htmlFor={nameId}>
								<span className="text-xs text-foreground/70">
									Display name
								</span>
								<input
									id={nameId}
									type="text"
									defaultValue={self.displayName ?? self.id}
									onChange={handleNameChange}
									className="h-8 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							</label>
							<label className="grid gap-1" htmlFor={colorId}>
								<span className="text-xs text-foreground/70">
									Peer color
								</span>
								<input
									id={colorId}
									type="color"
									defaultValue={normalizeHexColor(self.color)}
									onChange={handleColorChange}
									className="h-8 w-16 cursor-pointer rounded-md border bg-background"
								/>
							</label>
							<label
								className="flex items-center justify-between gap-3"
								htmlFor={cursorsId}
							>
								<span className="text-xs text-foreground/70">
									Show remote cursors
								</span>
								<Switch.Root
									id={cursorsId}
									checked={showRemoteCursors}
									onCheckedChange={handleToggleCursors}
									className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-muted transition-colors data-[checked]:bg-emerald-500"
								>
									<Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-background shadow transition-transform data-[checked]:translate-x-[18px]" />
								</Switch.Root>
							</label>
							{props.roomId !== undefined ? (
								<div className="grid gap-1">
									<span className="text-xs text-foreground/70">
										Room
									</span>
									<div className="flex items-center gap-2">
										<input
											type="text"
											readOnly
											value={props.roomId}
											className="h-8 flex-1 rounded-md border bg-muted px-2 text-sm"
										/>
										<button
											type="button"
											onClick={handleCopyLink}
											className="h-8 rounded-md border bg-background px-2 text-xs hover:bg-muted"
										>
											{copied ? "Copied!" : "Copy link"}
										</button>
									</div>
								</div>
							) : null}
						</form>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}

function normalizeHexColor(input: string | undefined): string {
	if (!input) return "#3b82f6";
	if (input.startsWith("#")) return input;
	// `<input type="color">` only accepts hex; HSL inputs come through
	// as-is from the demo, so fall back to a neutral default rather
	// than throw.
	return "#3b82f6";
}
