"use client";

import { useMsg } from "@anvilkit/core/i18n";
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
import {
	memo,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { useCollabCursorVisibility, useCollabPeers } from "../context.js";
import { resolveDisplayName } from "../lib/anon-identity.js";
import { cn } from "../lib/cn.js";
import {
	type CursorBudgetState,
	createCursorBudgetState,
	DEFAULT_MAX_CURSORS,
	selectCursorPeers,
} from "../lib/cursor-budget.js";

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
	/**
	 * Maximum number of remote cursors animated at once (review U1).
	 * Defaults to {@link DEFAULT_MAX_CURSORS}. Rooms under the cap render
	 * every peer's cursor; past it, only the most-recently-moved cursors
	 * animate — each cursor mounts two `motion` springs, so an uncapped
	 * large room would otherwise spin up ~2N rAF loops. Selection rings are
	 * unaffected. Pass `0` to render no cursors.
	 */
	readonly maxCursors?: number;
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

	// U1 — cap concurrently animated cursors to the most-recently-moved
	// `maxCursors`, so a 50+ peer room doesn't spin up ~2N `motion` springs.
	// Deriving the capped set into a ref during render mirrors the F5 identity
	// cache in `context.tsx` (a pure derivation, no external side effect); the
	// `memo`'d per-peer `showCursors` boolean only flips when a peer crosses
	// the budget boundary, so steady-state movers don't re-render each other.
	const budgetRef = useRef<CursorBudgetState | undefined>(undefined);
	if (budgetRef.current === undefined) {
		budgetRef.current = createCursorBudgetState();
	}
	const cursorIds = selectCursorPeers(
		peers,
		showCursors ? (props.maxCursors ?? DEFAULT_MAX_CURSORS) : 0,
		budgetRef.current,
	);

	// U2 — wrap the host resolver in a layout-epoch cache so selection rects are
	// computed at most once per node per layout epoch and refreshed on
	// scroll/resize (see useLayoutEpochResolver).
	const resolveSelectionRect = useLayoutEpochResolver(
		props.resolveSelectionRect,
	);

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
						showCursors={showCursors && cursorIds.has(frame.peer.id)}
						resolveSelectionRect={resolveSelectionRect}
					/>
				))}
			</div>
		</LazyMotion>
	);
}

/**
 * U2 — wrap the host's `resolveSelectionRect` in a layout-epoch cache.
 *
 * The resolver reads `getBoundingClientRect()` (synchronous layout). Without
 * this, every selected node — and the *same* node selected by N peers — pays a
 * fresh reflow on each render, and the rects silently go stale on scroll/resize
 * because nothing triggers a re-render. We therefore (a) dedupe resolver calls
 * within an epoch via a ref-held cache, and (b) bump the epoch — rAF-throttled —
 * on `resize`/`scroll` and a `ResizeObserver` so rings refresh against fresh
 * rects. The wrapped resolver's identity changes per epoch, which the ring
 * `memo` comparator already keys on, so each layout change drives exactly one
 * ring refresh rather than one per cursor frame. Inert when no resolver is set.
 */
function useLayoutEpochResolver(
	resolve: ((nodeId: string) => PresenceSelectionRingRect | null) | undefined,
): ((nodeId: string) => PresenceSelectionRingRect | null) | undefined {
	const [epoch, setEpoch] = useState(0);
	const cacheRef = useRef<{
		epoch: number;
		rects: Map<string, PresenceSelectionRingRect | null>;
	}>({ epoch: 0, rects: new Map() });

	useEffect(() => {
		if (!resolve || typeof window === "undefined") return;
		let frame = 0;
		const bump = (): void => {
			if (frame !== 0) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				setEpoch((prev) => prev + 1);
			});
		};
		window.addEventListener("resize", bump);
		// Capture phase so a scroll inside the canvas or any nested scroller counts.
		window.addEventListener("scroll", bump, true);
		const observer =
			typeof ResizeObserver === "function" ? new ResizeObserver(bump) : null;
		if (observer && document.body) observer.observe(document.body);
		return () => {
			window.removeEventListener("resize", bump);
			window.removeEventListener("scroll", bump, true);
			observer?.disconnect();
			if (frame !== 0) cancelAnimationFrame(frame);
		};
	}, [resolve]);

	return useMemo(() => {
		if (!resolve) return undefined;
		return (nodeId: string): PresenceSelectionRingRect | null => {
			const cache = cacheRef.current;
			if (cache.epoch !== epoch) {
				cache.epoch = epoch;
				cache.rects.clear();
			}
			if (cache.rects.has(nodeId)) return cache.rects.get(nodeId) ?? null;
			const rect = resolve(nodeId);
			cache.rects.set(nodeId, rect);
			return rect;
		};
	}, [resolve, epoch]);
}

interface PeerOverlaysProps {
	readonly frame: PresenceState;
	readonly showCursors: boolean;
	readonly resolveSelectionRect?: (
		nodeId: string,
	) => PresenceSelectionRingRect | null;
}

function selectionSignature(frame: PresenceState): string {
	// U5 — JSON-encode (collision-proof) rather than `join("|")`: a nodeId
	// containing the separator could otherwise alias two distinct selections,
	// matching the `peerIdentitySignature` / `conflictKey` convention.
	return JSON.stringify(frame.selection?.nodeIds ?? []);
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
 * cursor moves. The ResizeObserver/scroll layout-epoch cache that refreshes
 * rects on canvas resize (and dedupes the resolver per node) now lives in
 * `useLayoutEpochResolver` (review U2).
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
	// U3 — localize the auto-generated anonymous label per viewer.
	const msg = useMsg();
	const label = resolveDisplayName(peer, msg("collabUi.identity.anonymous"));
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
			{label ? (
				<span
					data-slot="presence-cursor-label"
					className="ml-3 inline-block translate-y-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-white"
					style={{ backgroundColor: color }}
				>
					{label}
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
