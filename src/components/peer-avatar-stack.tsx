"use client";

import { useMsg } from "@anvilkit/core/i18n";
import type { PeerInfo } from "@anvilkit/plugin-version-history";
import { Avatar, AvatarFallback } from "@anvilkit/ui/avatar";
import {
	AvatarGroup,
	AvatarGroupTooltip,
} from "@anvilkit/ui/components/animate-ui/components/animate/avatar-group";
import { memo, type ReactElement, type ReactNode } from "react";

import { useCollabPeerIdentities, useCollabSelf } from "../context.js";
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
	const msg = useMsg();
	const self = useCollabSelf();
	// F5 — read the roster-only identities slice (id/displayName/color),
	// not the full presence frames, so the stack does not re-render on
	// cursor/selection churn.
	const peers = useCollabPeerIdentities();
	const collaborators: readonly PeerInfo[] = [self, ...peers];
	const max = props.maxVisible ?? 5;
	const visible = collaborators.slice(0, max);
	const overflow = Math.max(collaborators.length - visible.length, 0);

	const items: ReactElement[] = visible.map((peer) => (
		<PeerAvatar key={peer.id} peer={peer} />
	));
	if (overflow > 0) {
		items.push(<OverflowAvatar key="__overflow" count={overflow} />);
	}

	return (
		<ul
			className={cn("flex items-center list-none m-0 p-0", props.className)}
			data-slot="peer-avatar-stack"
			aria-label={(collaborators.length === 1
				? msg("collabUi.peers.connectedOne")
				: msg("collabUi.peers.connectedMany")
			).replace("{count}", String(collaborators.length))}
		>
			<AvatarGroup
				className="flex -space-x-2 h-7"
				translate="-25%"
				invertOverlap
			>
				{items}
			</AvatarGroup>
		</ul>
	);
}

// F13 — this consumes a `PeerInfo` directly (not a `PresenceState`), so
// the awkward `peer.peer.id` double-access is gone. F5 — memoized so an
// individual avatar only re-renders when its own identity datum changes.
const PeerAvatar = memo(function PeerAvatar({
	peer,
}: {
	peer: PeerInfo;
}): ReactNode {
	const initials = (peer.displayName ?? peer.id)
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase())
		.slice(0, 2)
		.join("");
	const background = peer.color ?? "var(--muted)";
	const label = peer.displayName ?? peer.id;
	return (
		<Avatar
			role="listitem"
			data-peer-id={peer.id}
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
});

function OverflowAvatar({ count }: { count: number }): ReactNode {
	const msg = useMsg();
	return (
		<Avatar
			size="sm"
			className="ring-2 ring-background"
			aria-label={msg("collabUi.peers.more").replace("{count}", String(count))}
		>
			<AvatarFallback className="text-[10px] font-medium text-muted-foreground">
				+{count}
			</AvatarFallback>
		</Avatar>
	);
}
