"use client";

import type { PresenceState } from "@anvilkit/plugin-version-history";
import {
	PresenceSelectionRing,
	type PresenceSelectionRingRect,
} from "@anvilkit/ui/presence";
import {
	domAnimation,
	LazyMotion,
	m,
	useReducedMotion,
	useSpring,
} from "motion/react";
import { memo, type ReactNode, useEffect } from "react";

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
		<LazyMotion features={domAnimation}>
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
		</LazyMotion>
	);
}

interface PeerOverlaysProps {
	readonly frame: PresenceState;
	readonly showCursors: boolean;
	readonly resolveSelectionRect?: (
		nodeId: string,
	) => PresenceSelectionRingRect | null;
}

function selectionSignature(frame: PresenceState): string {
	return frame.selection?.nodeIds?.join("|") ?? "";
}

function PeerOverlaysImpl({
	frame,
	showCursors,
	resolveSelectionRect,
}: PeerOverlaysProps): ReactNode {
	const cursor = frame.cursor;
	return (
		<>
			{showCursors && cursor ? (
				<RemoteCursor peer={frame.peer} x={cursor.x} y={cursor.y} />
			) : null}
			{resolveSelectionRect ? (
				<PeerSelectionRings
					frame={frame}
					resolveSelectionRect={resolveSelectionRect}
				/>
			) : null}
		</>
	);
}

/**
 * F3 — skip a peer's overlay subtree unless that peer's cursor,
 * selection, or identity changed. With F2's reference-stable peers array
 * this makes one peer's move re-render only that peer's overlays instead
 * of all 50.
 */
function comparePeerFrame(
	prev: PeerOverlaysProps,
	next: PeerOverlaysProps,
): boolean {
	if (
		prev.showCursors !== next.showCursors ||
		prev.resolveSelectionRect !== next.resolveSelectionRect
	) {
		return false;
	}
	const a = prev.frame;
	const b = next.frame;
	if (a === b) return true;
	return (
		a.peer.id === b.peer.id &&
		a.peer.color === b.peer.color &&
		a.peer.displayName === b.peer.displayName &&
		(a.cursor?.x ?? null) === (b.cursor?.x ?? null) &&
		(a.cursor?.y ?? null) === (b.cursor?.y ?? null) &&
		selectionSignature(a) === selectionSignature(b)
	);
}

const PeerOverlays = memo(PeerOverlaysImpl, comparePeerFrame);

interface PeerSelectionRingsProps {
	readonly frame: PresenceState;
	readonly resolveSelectionRect: (
		nodeId: string,
	) => PresenceSelectionRingRect | null;
}

function PeerSelectionRingsImpl({
	frame,
	resolveSelectionRect,
}: PeerSelectionRingsProps): ReactNode {
	const selection = frame.selection?.nodeIds ?? [];
	return (
		<>
			{selection.map((nodeId) => {
				const rect = resolveSelectionRect(nodeId);
				if (!rect) return null;
				return (
					<PresenceSelectionRing
						key={`${frame.peer.id}:${nodeId}`}
						peer={frame.peer}
						rect={rect}
					/>
				);
			})}
		</>
	);
}

/**
 * F4 — `resolveSelectionRect` reads `getBoundingClientRect()`, so calling
 * it per selected node every frame forces synchronous layout. Re-render
 * the rings only when the peer's selection (or color) changes, NOT on
 * cursor moves. (A ResizeObserver/scroll layout-epoch cache that also
 * refreshes rects on canvas resize is the documented follow-up.)
 */
function compareSelectionRings(
	prev: PeerSelectionRingsProps,
	next: PeerSelectionRingsProps,
): boolean {
	if (prev.resolveSelectionRect !== next.resolveSelectionRect) return false;
	const a = prev.frame;
	const b = next.frame;
	if (a === b) return true;
	return (
		a.peer.id === b.peer.id &&
		a.peer.color === b.peer.color &&
		selectionSignature(a) === selectionSignature(b)
	);
}

const PeerSelectionRings = memo(PeerSelectionRingsImpl, compareSelectionRings);

interface RemoteCursorProps {
	readonly peer: PresenceState["peer"];
	readonly x: number;
	readonly y: number;
}

function RemoteCursorImpl({ peer, x, y }: RemoteCursorProps): ReactNode {
	// WCAG 2.3.3 — honor the OS "reduce motion" setting: snap the cursor to
	// each new position (`jump`) instead of spring-interpolating it (`set`)
	// so the looping pointer motion doesn't play for users who opted out.
	const shouldReduceMotion = useReducedMotion();
	const sx = useSpring(x, CURSOR_SPRING);
	const sy = useSpring(y, CURSOR_SPRING);
	// Load-bearing: for a plain-number source motion's `useSpring` does not
	// auto-track, so these `set`/`jump` calls are the SOLE channel propagating
	// x/y updates. Removing them freezes every cursor (review Appendix B).
	useEffect(() => {
		if (shouldReduceMotion) sx.jump(x);
		else sx.set(x);
	}, [sx, x, shouldReduceMotion]);
	useEffect(() => {
		if (shouldReduceMotion) sy.jump(y);
		else sy.set(y);
	}, [sy, y, shouldReduceMotion]);
	const color = peer.color ?? DEFAULT_COLOR;
	return (
		<m.div
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
		</m.div>
	);
}

/**
 * F3 — re-render a cursor only when its position or rendered identity
 * changes. The parent passes a fresh `peer` object each awareness frame,
 * so a reference comparison would never skip; compare the rendered
 * fields instead.
 */
function compareCursor(
	prev: RemoteCursorProps,
	next: RemoteCursorProps,
): boolean {
	return (
		prev.x === next.x &&
		prev.y === next.y &&
		prev.peer.id === next.peer.id &&
		prev.peer.color === next.peer.color &&
		prev.peer.displayName === next.peer.displayName
	);
}

const RemoteCursor = memo(RemoteCursorImpl, compareCursor);
