"use client";

import type { PresenceState } from "@anvilkit/plugin-version-history";
import { Avatar, AvatarFallback } from "@anvilkit/ui/avatar";
import {
	AvatarGroup,
	AvatarGroupTooltip,
} from "@anvilkit/ui/components/animate-ui/components/animate/avatar-group";
import type { ReactElement, ReactNode } from "react";

import { useCollabPeers, useCollabSelf } from "../context.js";
import { cn } from "../lib/cn.js";

export interface PeerAvatarStackProps {
	readonly className?: string;
	readonly maxVisible?: number;
}

/**
 * Stacked collaborator avatars. Reads only identity + peers context,
 * so it does not re-render on status / conflict / cursor churn
 * (review §C2).
 *
 * Remote peer colors are rendered into inline `background` styles
 * below. Safe because `@anvilkit/plugin-collab-yjs` sanitizes inbound
 * awareness via `validatePeerInfo` / `validatePresenceState` before
 * peers reach context; the local `self` color is normalized in
 * `CollabUIProvider.updateSelf` (review §B4).
 */
export function PeerAvatarStack(props: PeerAvatarStackProps): ReactNode {
	const self = useCollabSelf();
	const peers = useCollabPeers();
	const collaborators: readonly PresenceState[] = [{ peer: self }, ...peers];
	const max = props.maxVisible ?? 5;
	const visible = collaborators.slice(0, max);
	const overflow = Math.max(collaborators.length - visible.length, 0);

	const items: ReactElement[] = visible.map((peer) => (
		<PeerAvatar key={peer.peer.id} peer={peer} />
	));
	if (overflow > 0) {
		items.push(<OverflowAvatar key="__overflow" count={overflow} />);
	}

	return (
		<div
			className={cn("flex items-center", props.className)}
			data-slot="peer-avatar-stack"
			role="list"
			aria-label={`${collaborators.length} ${
				collaborators.length === 1 ? "collaborator" : "collaborators"
			} connected`}
		>
			<AvatarGroup
				className="flex -space-x-2 h-7"
				translate="-25%"
				invertOverlap
			>
				{items}
			</AvatarGroup>
		</div>
	);
}

function PeerAvatar({ peer }: { peer: PresenceState }): ReactNode {
	const initials = (peer.peer.displayName ?? peer.peer.id)
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase())
		.slice(0, 2)
		.join("");
	const background = peer.peer.color ?? "var(--muted)";
	const label = peer.peer.displayName ?? peer.peer.id;
	return (
		<Avatar
			role="listitem"
			data-peer-id={peer.peer.id}
			size="sm"
			className="ring-2 ring-background"
			style={{ background }}
		>
			<AvatarFallback className="bg-transparent text-[10px] font-medium text-white">
				{initials || "?"}
			</AvatarFallback>
			<AvatarGroupTooltip>
				<div className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className="size-2 rounded-full"
						style={{ backgroundColor: background }}
					/>
					<span>{label}</span>
					<span
						aria-hidden="true"
						className="size-1.5 rounded-full bg-emerald-500"
					/>
				</div>
			</AvatarGroupTooltip>
		</Avatar>
	);
}

function OverflowAvatar({ count }: { count: number }): ReactNode {
	return (
		<Avatar
			size="sm"
			className="ring-2 ring-background"
			aria-label={`${count} more`}
		>
			<AvatarFallback className="text-[10px] font-medium text-muted-foreground">
				+{count}
			</AvatarFallback>
		</Avatar>
	);
}
