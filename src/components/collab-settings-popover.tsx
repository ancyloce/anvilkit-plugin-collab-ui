"use client";

import { Button } from "@anvilkit/ui/button";
import {
	Popover,
	PopoverPanel,
	PopoverTitle,
	PopoverTrigger,
} from "@anvilkit/ui/components/animate-ui/components/base/popover";
import { Switch } from "@anvilkit/ui/components/animate-ui/components/base/switch";
import { CopyButton } from "@anvilkit/ui/components/animate-ui/components/buttons/copy";
import { Field, FieldGroup, FieldLabel } from "@anvilkit/ui/field";
import { Input } from "@anvilkit/ui/input";
import { Settings } from "lucide-react";
import { type ChangeEvent, type ReactNode, useId } from "react";

import { useCollabCursorVisibility, useCollabIdentity } from "../context.js";

export interface CollabSettingsPopoverProps {
	readonly className?: string;
	readonly roomId?: string;
	readonly roomLink?: string;
	/**
	 * Optional notify hook for hosts that also want to observe the
	 * toggle. The toggle's source of truth is the shared
	 * `useCollabCursorVisibility()` context (review §C3 / §4.3); this
	 * callback fires *in addition* to updating context.
	 */
	readonly onShowRemoteCursorsChange?: (show: boolean) => void;
	/**
	 * @deprecated The initial value now comes from
	 * `<CollabUIProvider>` context (defaults to `true`). Kept for
	 * source compatibility; no longer read.
	 */
	readonly initialShowRemoteCursors?: boolean;
}

export function CollabSettingsPopover(
	props: CollabSettingsPopoverProps,
): ReactNode {
	const { self, updateSelf } = useCollabIdentity();
	const { showRemoteCursors, setShowRemoteCursors } =
		useCollabCursorVisibility();
	const nameId = useId();
	const colorId = useId();
	const cursorsId = useId();

	function handleNameChange(event: ChangeEvent<HTMLInputElement>): void {
		updateSelf({ displayName: event.target.value });
	}

	function handleColorChange(event: ChangeEvent<HTMLInputElement>): void {
		// Color is normalized inside `updateSelf` before it reaches
		// awareness (review §B4 / §B5).
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
				data-slot="collab-settings-trigger"
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Collaboration settings"
						className={props.className}
					/>
				}
			>
				<Settings aria-hidden="true" />
			</PopoverTrigger>
			<PopoverPanel
				data-slot="collab-settings-popover"
				align="end"
				sideOffset={6}
				className="w-72"
			>
				<PopoverTitle className="font-medium">Collaboration</PopoverTitle>
				<FieldGroup className="mt-3">
					<Field>
						<FieldLabel htmlFor={nameId}>Display name</FieldLabel>
						<Input
							id={nameId}
							type="text"
							value={self.displayName ?? self.id}
							onChange={handleNameChange}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor={colorId}>Peer color</FieldLabel>
						<Input
							id={colorId}
							type="color"
							value={normalizeHexColor(self.color)}
							onChange={handleColorChange}
							className="h-8 w-16 cursor-pointer p-1"
						/>
					</Field>
					<Field orientation="horizontal">
						<FieldLabel id={cursorsId}>Show remote cursors</FieldLabel>
						<Switch
							aria-labelledby={cursorsId}
							checked={showRemoteCursors}
							onCheckedChange={handleToggleCursors}
							nativeButton
						/>
					</Field>
					{props.roomId !== undefined ? (
						<Field>
							<FieldLabel>Room</FieldLabel>
							<div className="flex items-center gap-2">
								<Input
									type="text"
									readOnly
									value={props.roomId}
									className="flex-1 bg-muted"
								/>
								<CopyButton
									content={linkToCopy || props.roomId}
									aria-label="Copy room link"
									variant="outline"
									size="sm"
								/>
							</div>
						</Field>
					) : null}
				</FieldGroup>
			</PopoverPanel>
		</Popover>
	);
}

function normalizeHexColor(input: string | undefined): string {
	if (!input) return "#3b82f6";
	if (input.startsWith("#")) return input;
	return "#3b82f6";
}
