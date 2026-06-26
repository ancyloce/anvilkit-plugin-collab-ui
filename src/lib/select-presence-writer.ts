"use client";

import type { ComponentType } from "react";

import type { CollabPresencePublisherProps } from "../components/collab-presence-publisher.js";
import { CollabPresencePublisher } from "../components/collab-presence-publisher.js";
import { PresenceCursorBroadcaster } from "../components/presence-cursor-broadcaster.js";

/**
 * Local-presence publishing mode for `createCollabPlugin`.
 *
 * - `"cursor"` (default) — mount the Puck-free
 *   {@link PresenceCursorBroadcaster}, which publishes only pointer
 *   coordinates. Safe to mount in the provider that wraps the *whole*
 *   Studio tree because it never touches Puck context.
 * - `"cursor+selection"` — mount the Puck-aware
 *   {@link CollabPresencePublisher} INSTEAD, which publishes pointer
 *   coordinates AND the current Puck selection ring via
 *   `usePuckSelection()`.
 */
export type PresencePublishingMode = "cursor" | "cursor+selection";

/**
 * Pure selector mapping the resolved presence-writer enable flag and the
 * publishing mode to the single writer component the factory mounts inside
 * its provider subtree — or `null` to mount none.
 *
 * EXACTLY ONE writer is ever mounted. Awareness *replaces* the local frame
 * on every `presence.update`, so mounting both the cursor-only broadcaster
 * AND the combined cursor+selection publisher would let the two clobber
 * each other's frames — the documented hazard in
 * {@link PresenceCursorBroadcaster}. `"cursor+selection"` therefore swaps
 * the combined publisher in INSTEAD OF the cursor-only broadcaster, never
 * in addition to it.
 *
 * Extracted as a pure function so the mode → component wiring can be
 * unit-tested without a live Puck context.
 */
export function selectPresenceWriter(
	broadcastEnabled: boolean,
	mode: PresencePublishingMode,
): ComponentType<CollabPresencePublisherProps> | null {
	if (!broadcastEnabled) return null;
	return mode === "cursor+selection"
		? CollabPresencePublisher
		: PresenceCursorBroadcaster;
}
