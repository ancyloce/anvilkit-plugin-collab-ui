"use client";

/**
 * @file Standalone `collabUi` i18n provider + the `AnvilkitMessages` type
 * augmentation.
 *
 * {@link CollabUII18nProvider} wraps collab-ui components mounted OUTSIDE
 * `<Studio>` (the public `./components/*` subpaths) so their
 * `useMsg("collabUi.*")` calls resolve to the English baseline (or the
 * active locale). In-chrome usage needs no wrapper — the plugin's
 * `register()` contributes {@link COLLAB_UI_ENTRY} to core's catalog.
 *
 * Note: nest this INSIDE `CollabUIProvider`, not around it — the two
 * contexts are independent. Do not fold this into `CollabUIProvider`; a
 * nested `EditorI18nProvider` rebuilds the catalog from its own entries
 * (+ core `studio.*`), which would drop sibling plugins' namespaces if the
 * collab provider ever wrapped a shared in-chrome subtree.
 */

import { EditorI18nProvider } from "@anvilkit/core/i18n";
import type { ReactNode } from "react";

import { COLLAB_UI_ENTRY, type CollabUiMessageKey } from "./entry.js";

export function CollabUII18nProvider({
	children,
}: {
	readonly children: ReactNode;
}): ReactNode {
	return (
		<EditorI18nProvider entries={[COLLAB_UI_ENTRY]}>
			{children}
		</EditorI18nProvider>
	);
}

// Augment the public key registry so `useT("collabUi.*")` autocompletes.
declare module "@anvilkit/core/i18n" {
	interface AnvilkitMessages extends Record<CollabUiMessageKey, string> {}
}
