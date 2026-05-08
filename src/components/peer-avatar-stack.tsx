"use client";

import type { PresenceState } from "@anvilkit/plugin-version-history";
import type { ReactNode } from "react";

import { useCollabPeers } from "../context.js";
import { cn } from "../lib/cn.js";

export interface PeerAvatarStackProps {
	readonly className?: string;
	readonly maxVisible?: number;
}

export function PeerAvatarStack(props: PeerAvatarStackProps): ReactNode {
	const peers = useCollabPeers();
	const max = props.maxVisible ?? 5;
	const visible = peers.slice(0, max);
	const overflow = Math.max(peers.length - visible.length, 0);

	return (
		<div
			className={cn("flex items-center -space-x-2", props.className)}
			data-slot="peer-avatar-stack"
			role="list"
			aria-label={`${peers.length} ${peers.length === 1 ? "peer" : "peers"} connected`}
		>
			{visible.map((peer) => (
				<PeerAvatar key={peer.peer.id} peer={peer} />
			))}
			{overflow > 0 ? (
				<span
					className="relative inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-2 ring-background"
					aria-label={`${overflow} more`}
				>
					+{overflow}
				</span>
			) : null}
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
	return (
		<span
			role="listitem"
			title={peer.peer.displayName ?? peer.peer.id}
			data-peer-id={peer.peer.id}
			className="relative inline-flex size-7 items-center justify-center rounded-full text-xs font-medium ring-2 ring-background"
			style={{ background, color: contrastForeground(background) }}
		>
			{initials || "?"}
		</span>
	);
}

function contrastForeground(_background: string): string {
	// Peer colors are user-supplied; default to white text for the
	// short HSL-based set the demo uses. Hosts can override by
	// rendering their own avatar component.
	return "white";
}
