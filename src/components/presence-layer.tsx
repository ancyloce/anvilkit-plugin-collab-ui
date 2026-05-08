"use client";

import {
	PresenceLayer as BasePresenceLayer,
	type PresenceLayerProps as BasePresenceLayerProps,
	type PresenceStateFrame,
} from "@anvilkit/ui/presence";
import type { PresenceState } from "@anvilkit/plugin-version-history";
import type { ReactNode } from "react";

import { useCollabPeers } from "../context.js";

export type CollabPresenceLayerProps = Omit<BasePresenceLayerProps, "peers">;

/**
 * Thin wrapper over `@anvilkit/ui/presence`'s `PresenceLayer` that
 * pulls peers straight from the `<CollabUIProvider>` context.
 *
 * Hosts that need to render multiple presence layers (e.g. for an
 * inset preview) should still consume the underlying primitive
 * directly with their own `peers` prop — this wrapper exists for the
 * common one-canvas case.
 */
export function PresenceLayer(props: CollabPresenceLayerProps): ReactNode {
	const peers = useCollabPeers();
	return (
		<BasePresenceLayer
			{...props}
			peers={peers as readonly PresenceStateFrame[] & readonly PresenceState[]}
		/>
	);
}
