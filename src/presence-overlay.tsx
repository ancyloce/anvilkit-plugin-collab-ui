"use client";

import type { ComponentType, ReactNode } from "react";

import {
	type CollabPresenceLayerProps,
	PresenceLayer,
} from "./components/presence-layer.js";

/**
 * Presence options accepted by `createCollabPlugin`: the `<PresenceLayer>`
 * props plus the factory's own `enabled` / `broadcastCursor` switches.
 */
export type PresenceOverlayOptions = CollabPresenceLayerProps & {
	readonly enabled?: boolean;
	readonly broadcastCursor?: boolean;
};

/**
 * Build the `"canvas"`-placement overlay component bound to this
 * registration's resolved presence options (the provider/overlay contract
 * requires a `ComponentType`, not a `ReactNode`).
 *
 * When the factory owns cursor broadcasting (the one-liner path), the
 * published coordinates are viewport-relative, so the layer is pinned to
 * the viewport by default — unless the host positions it itself. The
 * resolution runs once here rather than on every overlay render.
 */
export function createPresenceOverlay(
	options: PresenceOverlayOptions | undefined,
	broadcastCursorEnabled: boolean,
): ComponentType {
	const {
		enabled: _enabled,
		broadcastCursor: _broadcast,
		...rest
	} = options ?? {};
	const className =
		rest.className ?? (broadcastCursorEnabled ? "!fixed z-[9999]" : undefined);
	return function PresenceOverlay(): ReactNode {
		return <PresenceLayer {...rest} className={className} />;
	};
}
