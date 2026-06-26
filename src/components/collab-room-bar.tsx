"use client";

import { useMsg } from "@anvilkit/core/i18n";
import { Button } from "@anvilkit/ui/button";
import { History } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn.js";
import { CollabSettingsPopover } from "./collab-settings-popover.js";
import { PeerAvatarStack } from "./peer-avatar-stack.js";
import { SyncActivityIndicator } from "./sync-activity-indicator.js";

/** Props for {@link CollabRoomBar} — the room header bar (title, room link, avatars, settings, optional history). */
export interface CollabRoomBarProps {
	readonly className?: string;
	readonly title?: string;
	readonly subtitle?: string;
	readonly roomId?: string;
	readonly roomLink?: string;
	/**
	 * Optional, host-driven version-history / rollback entry point. When
	 * supplied, the bar renders a localized history button (mirroring the
	 * settings trigger) that invokes this callback — typically wired by the
	 * host to the version-history plugin's open action. Omitted by default so
	 * this package gains no dependency on `@anvilkit/plugin-version-history`
	 * and the bar renders nothing new when the host opts out.
	 */
	readonly onOpenHistory?: () => void;
	/**
	 * Optional override for the history button's accessible label. Defaults to
	 * the localized `collabUi.history.open` message.
	 */
	readonly historyLabel?: string;
	readonly trailing?: ReactNode;
}

export function CollabRoomBar(props: CollabRoomBarProps): ReactNode {
	const msg = useMsg();
	return (
		<div
			data-slot="collab-room-bar"
			className={cn(
				"flex items-center gap-3 border-b bg-background px-4 py-2 text-sm",
				props.className,
			)}
		>
			<div className="flex min-w-0 items-center gap-2">
				{props.title ? (
					<span
						className="truncate font-medium"
						data-testid="collab-room-bar-title"
					>
						{props.title}
					</span>
				) : null}
				{props.subtitle ? (
					<>
						<span aria-hidden="true" className="text-muted-foreground">
							›
						</span>
						<span className="truncate text-muted-foreground">
							{props.subtitle}
						</span>
					</>
				) : null}
			</div>
			<SyncActivityIndicator />
			<div className="ml-auto flex items-center gap-3">
				<PeerAvatarStack />
				{props.onOpenHistory ? (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={props.onOpenHistory}
						aria-label={props.historyLabel ?? msg("collabUi.history.open")}
						data-slot="collab-room-bar-history"
						data-testid="collab-room-bar-history"
					>
						<History aria-hidden="true" />
					</Button>
				) : null}
				<CollabSettingsPopover
					roomId={props.roomId}
					roomLink={props.roomLink}
				/>
				{props.trailing}
			</div>
		</div>
	);
}
