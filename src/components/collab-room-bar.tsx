"use client";

import type { ReactNode } from "react";

import { cn } from "../lib/cn.js";
import { CollabSettingsPopover } from "./collab-settings-popover.js";
import { PeerAvatarStack } from "./peer-avatar-stack.js";
import { SyncActivityIndicator } from "./sync-activity-indicator.js";

export interface CollabRoomBarProps {
  readonly className?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly roomId?: string;
  readonly roomLink?: string;
  readonly trailing?: ReactNode;
}

export function CollabRoomBar(props: CollabRoomBarProps): ReactNode {
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
        <CollabSettingsPopover
          roomId={props.roomId}
          roomLink={props.roomLink}
        />
        {props.trailing}
      </div>
    </div>
  );
}
