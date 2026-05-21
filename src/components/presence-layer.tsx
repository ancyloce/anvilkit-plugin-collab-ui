"use client";

import type { PresenceState } from "@anvilkit/plugin-version-history";
import {
	PresenceSelectionRing,
	type PresenceSelectionRingRect,
} from "@anvilkit/ui/presence";
import { motion, useSpring } from "motion/react";
import { type ReactNode, useEffect } from "react";

import { useCollabCursorVisibility, useCollabPeers } from "../context.js";
import { cn } from "../lib/cn.js";

export interface CollabPresenceLayerProps {
	/**
	 * Per-instance override for remote-cursor visibility. When
	 * omitted, the layer follows the shared
	 * `useCollabCursorVisibility()` state that the bundled
	 * `<CollabSettingsPopover>` toggle writes (review §C3 / §4.3).
	 */
	readonly showCursors?: boolean;
	readonly resolveSelectionRect?: (
		nodeId: string,
	) => PresenceSelectionRingRect | null;
	readonly className?: string;
}

const CURSOR_SPRING = { stiffness: 400, damping: 28, mass: 0.6 } as const;
const DEFAULT_COLOR = "#7c3aed";

/**
 * Mounts spring-animated cursors and selection rings for every
 * remote peer in the active collab room.
 *
 * Pulls peers from `<CollabUIProvider>` context. Remote cursor
 * coordinates are interpolated with `motion/react` springs so a
 * peer's pointer moves smoothly between awareness frames instead
 * of jumping. Selection rings still delegate to the static
 * `PresenceSelectionRing` from `@anvilkit/ui/presence`.
 *
 * Remote peer colors are rendered into inline styles below. This is
 * safe because `@anvilkit/plugin-collab-yjs` sanitizes inbound
 * awareness payloads via `validatePeerInfo` / `validatePresenceState`
 * before they reach this layer (review §B5).
 *
 * Note: the remote-cursor node uses `z-50`. This overlay is a canvas
 * overlay (not a Dialog/Popover), so the explicit z-index is
 * intentional, but it must stay coordinated with `@anvilkit/core`'s
 * canvas overlay stacking so cursors are not occluded by other
 * overlays (review §B5).
 */
export function PresenceLayer(props: CollabPresenceLayerProps): ReactNode {
	const peers = useCollabPeers();
	const { showRemoteCursors } = useCollabCursorVisibility();
	const showCursors = props.showCursors ?? showRemoteCursors;
	return (
		<div
			data-slot="presence-layer"
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 overflow-hidden",
				props.className,
			)}
		>
			{peers.map((frame) => (
				<PeerOverlays
					key={frame.peer.id}
					frame={frame}
					showCursors={showCursors}
					resolveSelectionRect={props.resolveSelectionRect}
				/>
			))}
		</div>
	);
}

function PeerOverlays({
	frame,
	showCursors,
	resolveSelectionRect,
}: {
	readonly frame: PresenceState;
	readonly showCursors: boolean;
	readonly resolveSelectionRect?: (
		nodeId: string,
	) => PresenceSelectionRingRect | null;
}): ReactNode {
	const cursor = frame.cursor;
	const selection = frame.selection?.nodeIds ?? [];
	return (
		<>
			{showCursors && cursor ? (
				<RemoteCursor peer={frame.peer} x={cursor.x} y={cursor.y} />
			) : null}
			{resolveSelectionRect
				? selection.map((nodeId) => {
						const rect = resolveSelectionRect(nodeId);
						if (!rect) return null;
						return (
							<PresenceSelectionRing
								key={`${frame.peer.id}:${nodeId}`}
								peer={frame.peer}
								rect={rect}
							/>
						);
					})
				: null}
		</>
	);
}

function RemoteCursor({
	peer,
	x,
	y,
}: {
	readonly peer: PresenceState["peer"];
	readonly x: number;
	readonly y: number;
}): ReactNode {
	const sx = useSpring(x, CURSOR_SPRING);
	const sy = useSpring(y, CURSOR_SPRING);
	useEffect(() => {
		sx.set(x);
	}, [sx, x]);
	useEffect(() => {
		sy.set(y);
	}, [sy, y]);
	const color = peer.color ?? DEFAULT_COLOR;
	return (
		<motion.div
			data-slot="presence-cursor"
			data-peer-id={peer.id}
			aria-hidden="true"
			className="pointer-events-none absolute left-0 top-0 z-50 select-none"
			style={{ x: sx, y: sy }}
		>
			<svg
				width="14"
				height="20"
				viewBox="0 0 14 20"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				style={{ color, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}
			>
				<path
					d="M1 1 L1 16 L5.5 12 L8 18 L10.5 17 L8 11 L13 11 Z"
					fill="currentColor"
					stroke="white"
					strokeWidth="1"
					strokeLinejoin="round"
				/>
			</svg>
			{peer.displayName ? (
				<span
					data-slot="presence-cursor-label"
					className="ml-3 inline-block translate-y-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-white"
					style={{ backgroundColor: color }}
				>
					{peer.displayName}
				</span>
			) : null}
		</motion.div>
	);
}
