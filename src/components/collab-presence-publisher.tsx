"use client";

import { usePuckSelection } from "@anvilkit/plugin-collab-yjs";
import type { PresenceCursor } from "@anvilkit/plugin-version-history";
import { type ReactNode, useEffect, useRef } from "react";

import { useCollabAdapter, useCollabSelf } from "../context.js";

/** Props for {@link CollabPresencePublisher} — the opt-in local cursor/selection publisher. */
export interface CollabPresencePublisherProps {
	/**
	 * Element whose pointer movement is published as the local
	 * cursor. Coordinates are reported relative to this element's
	 * bounding rect (typically the Puck canvas root). When omitted,
	 * the publisher listens on `window` and reports viewport
	 * coordinates.
	 */
	readonly root?: HTMLElement | null;
	/**
	 * Set `false` to mount the component without publishing (e.g.
	 * read-only viewers). Defaults to `true`.
	 */
	readonly enabled?: boolean;
}

/**
 * Opt-in local presence publisher (review §C4).
 *
 * `@anvilkit/collab-ui` renders *remote* cursors/selections
 * (`PresenceLayer`) but does not publish the *local* ones — hosts
 * that own pointer/selection plumbing can skip this. Mount this
 * component (it renders `null`) to get a turnkey publisher: it reads
 * the local peer from context, the current Puck selection via
 * `usePuckSelection()`, captures pointer coordinates from `root`, and
 * calls `adapter.presence.update(...)`. Outbound rate limiting is the
 * Yjs adapter's responsibility (`awarenessRateLimit`); this component
 * additionally coalesces pointer moves to one update per animation
 * frame.
 */
export function CollabPresencePublisher(
	props: CollabPresencePublisherProps,
): ReactNode {
	const adapter = useCollabAdapter();
	const self = useCollabSelf();
	const selection = usePuckSelection();
	const enabled = props.enabled ?? true;

	const selectionRef = useRef(selection);
	useEffect(() => {
		selectionRef.current = selection;
	}, [selection]);

	useEffect(() => {
		if (!enabled) return;
		const presence = adapter.presence;
		if (!presence) return;
		const root = props.root;
		const target: Window | HTMLElement = root ?? window;
		let frame = 0;
		let pending: PresenceCursor | null = null;
		const flush = (): void => {
			frame = 0;
			presence.update({
				peer: self,
				cursor: pending ?? undefined,
				selection: selectionRef.current ?? undefined,
			});
		};
		// `target` is a `Window | HTMLElement` union, so its `addEventListener`
		// overload widens the listener to `EventListener` ((e: Event) => void).
		// Typing the handler as `Event` and narrowing with `instanceof MouseEvent`
		// (PointerEvent extends MouseEvent) keeps the wiring cast-free (review U6).
		const onMove = (event: Event): void => {
			if (!(event instanceof MouseEvent)) return;
			if (root) {
				const rect = root.getBoundingClientRect();
				pending = {
					x: event.clientX - rect.left,
					y: event.clientY - rect.top,
				};
			} else {
				pending = { x: event.clientX, y: event.clientY };
			}
			if (frame === 0) {
				frame = requestAnimationFrame(flush);
			}
		};
		target.addEventListener("pointermove", onMove, { passive: true });
		return () => {
			target.removeEventListener("pointermove", onMove);
			if (frame !== 0) cancelAnimationFrame(frame);
		};
	}, [adapter, enabled, props.root, self]);

	// Publish selection changes immediately, even without a pointer
	// move, so remote peers see selection highlights promptly.
	useEffect(() => {
		if (!enabled) return;
		const presence = adapter.presence;
		if (!presence) return;
		presence.update({
			peer: self,
			selection: selection ?? undefined,
		});
	}, [adapter, enabled, selection, self]);

	return null;
}
