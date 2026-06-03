"use client";

import type { PeerInfo } from "@anvilkit/plugin-version-history";
import { useEffect, useRef } from "react";

import { useCollabSelf } from "./context.js";

/**
 * Internal side-effect component that bridges `useCollabSelf()` changes
 * back to the host's `onIdentityChange` callback. Renders `null` and
 * only exists for the `useEffect`.
 *
 * Contract: fires **only** when the identity actually changes after
 * mount. The host already knows the initial value (they passed it in
 * via `self`), and `<CollabUIProvider>` re-creates the `self` object
 * reference on its sync effect even when the content is identical —
 * the dedupe avoids echoing those phantom updates back to the host.
 */
export function IdentitySync({
	onIdentityChange,
}: {
	readonly onIdentityChange?: (next: PeerInfo) => void;
}): null {
	const self = useCollabSelf();
	const previousRef = useRef<PeerInfo | undefined>(undefined);
	useEffect(() => {
		const previous = previousRef.current;
		previousRef.current = self;
		if (previous === undefined) return; // skip initial render
		if (peerInfoEquals(previous, self)) return; // skip no-op updates
		onIdentityChange?.(self);
	}, [self, onIdentityChange]);
	return null;
}

function peerInfoEquals(a: PeerInfo, b: PeerInfo): boolean {
	return (
		a.id === b.id && a.displayName === b.displayName && a.color === b.color
	);
}
