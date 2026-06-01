"use client";

import type { PresenceCursor } from "@anvilkit/plugin-version-history";
import { type ReactNode, useEffect } from "react";

import { useCollabAdapter, useCollabSelf } from "../context.js";

/** Puck renders the editable canvas inside this iframe. */
const PUCK_PREVIEW_FRAME_SELECTOR = "iframe#preview-frame";

/**
 * Turnkey local-cursor broadcaster for the consolidated
 * `createCollabPlugin()` factory.
 *
 * `@anvilkit/collab-ui` already *renders* remote cursors (`PresenceLayer`)
 * and mirrors the local identity into awareness on mount, but nothing
 * publishes the local **cursor position** — so with the zero-config
 * one-liner (`createCollabPlugin({ websocketUrl })`) peers can see each
 * other in the avatar stack yet never see each other's cursors. This
 * component closes that gap.
 *
 * Two deliberate design choices, both load-bearing:
 *
 * 1. **Pure DOM, no `usePuckSelection()`.** Reading the Puck selection
 *    requires `createUsePuck()`, which must run inside `<Puck>` and binds
 *    to whichever `@puckeditor/core` instance this package resolved — a
 *    mismatch with the host's `<Puck>` throws "usePuck must be used inside
 *    <Puck>". Broadcasting only the cursor (plain pointer coordinates)
 *    keeps this component Puck-free, so it can mount in the provider that
 *    wraps the *whole* Studio tree. Selection-ring broadcasting stays a
 *    host concern (see the `CollabPresencePublisher` opt-in). Because
 *    awareness *replaces* the local frame on every `presence.update`, a
 *    cursor-only writer and a separate selection writer would clobber each
 *    other — so `createCollabPlugin` exposes `presence.broadcastCursor`
 *    for hosts that run their own combined writer.
 *
 * 2. **Listens on the canvas iframe, not just `window`.** The canvas lives
 *    in `iframe#preview-frame`; pointer events fired inside it never reach
 *    the parent `window`, so a window-only listener would miss every move
 *    over the actual editing surface. We attach to the iframe's
 *    `contentDocument` (re-attaching on load / DOM mutations) and translate
 *    its content-relative coordinates back into the parent viewport, the
 *    same space `window` moves report — matching the viewport-fixed
 *    `PresenceLayer` the factory mounts.
 *
 * Pointer moves are coalesced to one `presence.update` per animation frame;
 * sustained-rate limiting remains the adapter's job (`awarenessRateLimit`).
 */
export function PresenceCursorBroadcaster(): ReactNode {
	const adapter = useCollabAdapter();
	const self = useCollabSelf();

	useEffect(() => {
		const presence = adapter.presence;
		if (!presence || typeof window === "undefined") return;

		// rAF-coalesced publish: collapse a burst of moves into one frame.
		let frame = 0;
		let pending: PresenceCursor | null = null;
		const flush = (): void => {
			frame = 0;
			if (pending) presence.update({ peer: self, cursor: pending });
		};
		const schedule = (cursor: PresenceCursor): void => {
			pending = cursor;
			if (frame === 0) frame = requestAnimationFrame(flush);
		};

		// Parent-document moves already report viewport coordinates.
		const windowHandler = (event: MouseEvent): void => {
			schedule({ x: event.clientX, y: event.clientY });
		};

		// Canvas-iframe moves report iframe-content coordinates; add the
		// iframe's viewport offset so both channels share one coordinate space.
		let frameEl: HTMLIFrameElement | null = null;
		let frameDoc: Document | null = null;
		const frameHandler = (event: MouseEvent): void => {
			if (!frameEl) return;
			const rect = frameEl.getBoundingClientRect();
			schedule({ x: rect.left + event.clientX, y: rect.top + event.clientY });
		};

		function detachFrameDocument(): void {
			frameDoc?.removeEventListener("mousemove", frameHandler);
			frameDoc = null;
		}
		function detachFrame(): void {
			detachFrameDocument();
			frameEl?.removeEventListener("load", attachFrame);
			frameEl = null;
		}
		// (Re)bind to the preview iframe and its document. The iframe mounts
		// after this effect (Puck renders it lazily) and swaps its document on
		// navigation, so we re-run on `load`, on focus, and on DOM mutations.
		function attachFrame(): void {
			const nextFrame = document.querySelector<HTMLIFrameElement>(
				PUCK_PREVIEW_FRAME_SELECTOR,
			);
			if (nextFrame !== frameEl) {
				detachFrame();
				frameEl = nextFrame;
				frameEl?.addEventListener("load", attachFrame);
			}
			let nextDoc: Document | null = null;
			try {
				nextDoc = nextFrame?.contentDocument ?? null;
			} catch {
				nextDoc = null; // cross-origin — unreachable for Puck's same-origin frame
			}
			if (nextDoc === frameDoc) return;
			detachFrameDocument();
			frameDoc = nextDoc;
			frameDoc?.addEventListener("mousemove", frameHandler, { passive: true });
		}

		const observer = new MutationObserver(attachFrame);
		if (document.body) {
			observer.observe(document.body, { childList: true, subtree: true });
		}
		attachFrame();

		window.addEventListener("mousemove", windowHandler, { passive: true });
		window.addEventListener("focus", attachFrame);
		return () => {
			window.removeEventListener("mousemove", windowHandler);
			window.removeEventListener("focus", attachFrame);
			observer.disconnect();
			detachFrame();
			if (frame !== 0) cancelAnimationFrame(frame);
		};
	}, [adapter, self]);

	return null;
}
