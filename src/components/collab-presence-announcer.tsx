"use client";

import { useMsg } from "@anvilkit/core/i18n";
import type { PeerInfo } from "@anvilkit/plugin-version-history";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { useCollabPeerIdentities } from "../context.js";
import { resolveDisplayName } from "../lib/anon-identity.js";

// Visually hidden but exposed to assistive tech (the canonical sr-only clip,
// mirroring canvas-editor's `ToolAnnouncer`). Inline so the region stays
// hidden even where Tailwind utilities don't reach (e.g. inside the canvas
// iframe), while remaining present in the DOM for the `aria-live` queue.
const srOnly = {
	position: "absolute",
	width: 1,
	height: 1,
	padding: 0,
	margin: -1,
	overflow: "hidden",
	clip: "rect(0 0 0 0)",
	whiteSpace: "nowrap",
	border: 0,
} as const;

/** Props for {@link CollabPresenceAnnouncer} — the polite a11y live region narrating peer join/leave. */
export interface CollabPresenceAnnouncerProps {
	readonly className?: string;
}

/**
 * Polite a11y live region that announces collaborator join/leave changes to
 * screen readers (M3 / review §4.2.3). The aggregate `aria-label` on
 * `<PeerAvatarStack>` exposes the *current* count, but it does not narrate
 * the *transition* when a collaborator arrives or departs — this region does.
 *
 * Roster source is {@link useCollabPeerIdentities} (NOT `useCollabPeers`): its
 * value reference changes only when the id/displayName/color *set* changes,
 * never on a cursor/selection-only frame (F5), so a remote cursor move can
 * never re-announce a join/leave. The previous roster is snapshotted in a ref
 * and diffed against the current one each time that reference changes, so only
 * deltas *after* mount are announced — the pre-existing roster present at
 * mount seeds silently (no join-spam).
 *
 * Renders nothing visible. Excludes the local peer (mirrors the hook).
 */
export function CollabPresenceAnnouncer(
	props: CollabPresenceAnnouncerProps,
): ReactNode {
	const msg = useMsg();
	const peers = useCollabPeerIdentities();

	// Keep the latest `msg` in a ref so the diff effect depends ONLY on the
	// roster reference (mirrors `ConflictNoticeCenter`). A locale switch then
	// updates copy on the next real roster delta without re-running the diff
	// against an unchanged roster.
	const msgRef = useRef(msg);
	msgRef.current = msg;

	// Previous roster snapshot (id → identity). `null` until the first effect
	// run so the INITIAL roster seeds silently — only post-mount deltas are
	// announced, never the whole pre-existing roster.
	const prevRef = useRef<Map<string, PeerInfo> | null>(null);
	const [announcement, setAnnouncement] = useState("");

	useEffect(() => {
		const resolve = msgRef.current;
		const anonymous = resolve("collabUi.identity.anonymous");
		const current = new Map<string, PeerInfo>();
		for (const peer of peers) current.set(peer.id, peer);

		const prev = prevRef.current;
		prevRef.current = current;
		// First post-mount run: seed silently so a pre-existing roster is not
		// announced as a burst of joins.
		if (prev === null) return;

		const lines: string[] = [];
		// Joins — present now, absent before.
		for (const [id, peer] of current) {
			if (prev.has(id)) continue;
			const name = resolveDisplayName(peer, anonymous) ?? id;
			lines.push(resolve("collabUi.presence.joined").replace("{name}", name));
		}
		// Leaves — present before, absent now.
		for (const [id, peer] of prev) {
			if (current.has(id)) continue;
			const name = resolveDisplayName(peer, anonymous) ?? id;
			lines.push(resolve("collabUi.presence.left").replace("{name}", name));
		}

		if (lines.length > 0) setAnnouncement(lines.join(" "));
	}, [peers]);

	return (
		<div
			data-slot="collab-presence-announcer"
			role="status"
			aria-live="polite"
			aria-atomic="true"
			style={srOnly}
			className={props.className}
		>
			{announcement}
		</div>
	);
}
