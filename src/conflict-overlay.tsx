"use client";

import type { ComponentType, ReactNode } from "react";

import {
	ConflictNoticeCenter,
	type ConflictNoticeCenterProps,
} from "./components/conflict-notice-center.js";

/**
 * Notification options accepted by `createCollabPlugin`: the
 * `<ConflictNoticeCenter>` props plus the factory's own `enabled` switch.
 */
export type ConflictOverlayOptions = ConflictNoticeCenterProps & {
	readonly enabled?: boolean;
};

/**
 * Build the `"notifications"`-placement overlay component bound to this
 * registration's resolved notification options (the overlay contract
 * requires a `ComponentType`, not a `ReactNode`).
 */
export function createConflictOverlay(
	options: ConflictOverlayOptions | undefined,
): ComponentType {
	const { enabled: _enabled, ...rest } = options ?? {};
	return function ConflictOverlay(): ReactNode {
		return <ConflictNoticeCenter {...rest} />;
	};
}
