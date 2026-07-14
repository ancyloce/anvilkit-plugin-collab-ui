"use client";

import { useMsg } from "@anvilkit/core/i18n";
import type { ConflictEvent } from "@anvilkit/plugin-collab-yjs";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";

import { useCollabConflictQueue } from "../context.js";
import { resolveDisplayName } from "../lib/anon-identity.js";
import { conflictKey } from "../lib/conflict-key.js";
import { ForceResyncDialog } from "./force-resync-dialog.js";

/** The `useMsg()` resolver shape, threaded into the default formatter. */
type Msg = (key: string, fallback?: string) => string;

/** Props for {@link ConflictNoticeCenter} — the toast center for collab conflict events. */
export interface ConflictNoticeCenterProps {
	/**
	 * Emitted only on overlap conflicts; future kinds (merge, etc.)
	 * may fall through with a different severity. Override the
	 * default copy by passing a `formatMessage` function.
	 */
	readonly formatMessage?: (event: ConflictEvent) => string;
	readonly toasterPosition?: "top-right" | "bottom-right" | "top-center";
}

// Default conflict copy now resolves from the shared `collabUi.*` catalog
// (localizable via the active locale); a host still overrides per-mount with
// `formatMessage`.
function defaultFormat(event: ConflictEvent, msg: Msg): string {
	const remotePeer = event.remotePeer;
	// U3 — localize an auto-generated anonymous peer's name in the toast too,
	// falling back to its id and then the generic "another peer" label.
	const peerName =
		(remotePeer
			? resolveDisplayName(remotePeer, msg("collabUi.identity.anonymous"))
			: undefined) ??
		remotePeer?.id ??
		msg("collabUi.conflict.anotherPeer");
	const nodeList = event.nodeIds.slice(0, 3).join(", ");
	return msg("collabUi.conflict.message")
		.replace("{peer}", peerName)
		.replace("{nodes}", nodeList);
}

/**
 * M6 — FIFO cap on the per-component `seen` set so dedupe state can't
 * grow unbounded for the component lifetime (each key embeds the full
 * joined `nodeIds`). Mirrors the adapter's `prunedIds` insertion-ordered
 * bound.
 */
const MAX_SEEN = 512;

export function ConflictNoticeCenter(
	props: ConflictNoticeCenterProps,
): ReactNode {
	const msg = useMsg();
	const { conflicts, dismissConflict } = useCollabConflictQueue();
	const formatter =
		props.formatMessage ??
		((event: ConflictEvent) => defaultFormat(event, msg));
	// M6 — keep the latest formatter in a ref so an inline host
	// `formatMessage` (new identity each render) does not force the effect
	// to re-walk the whole conflict queue on every render. The `msg` resolver
	// rides along in the same ref so the toast action label stays current
	// across a locale switch without re-running the effect.
	const formatterRef = useRef(formatter);
	const msgRef = useRef(msg);
	useEffect(() => {
		formatterRef.current = formatter;
		msgRef.current = msg;
	});
	// Lazy init: a nullable ref so the `Set` is allocated once on first
	// effect run, not rebuilt as a throwaway on every render.
	const seenRef = useRef<Set<string> | null>(null);
	const [resyncOpen, setResyncOpen] = useState(false);

	useEffect(() => {
		const seen = (seenRef.current ??= new Set<string>());
		for (const event of conflicts) {
			// Composite key (not the bare ISO `at`): two overlap conflicts
			// can share a timestamp in one tick. Used as the toast id AND
			// the dismiss key so dismissing one never drops its
			// co-timestamped sibling unacknowledged (M1 / review §C6).
			const key = conflictKey(event);
			if (seen.has(key)) continue;
			seen.add(key);
			// M6 — FIFO-bound the seen set (insertion-ordered, so the first
			// entry is the oldest) to keep it from growing for the whole
			// component lifetime.
			if (seen.size > MAX_SEEN) {
				const oldest = seen.values().next().value;
				if (oldest !== undefined) seen.delete(oldest);
			}
			toast(formatterRef.current(event), {
				id: key,
				duration: 8000,
				action: {
					label: msgRef.current("collabUi.conflict.forceResync"),
					onClick: () => setResyncOpen(true),
				},
				onDismiss: () => dismissConflict(key),
				onAutoClose: () => dismissConflict(key),
			});
		}
	}, [conflicts, dismissConflict]);

	return (
		<>
			<Toaster
				position={props.toasterPosition ?? "top-right"}
				richColors
				closeButton
				data-slot="conflict-notice-center"
			/>
			<ForceResyncDialog open={resyncOpen} onOpenChange={setResyncOpen} />
		</>
	);
}
