"use client";

/**
 * @file Consolidated `createCollabPlugin()` factory for `@anvilkit/collab-ui`.
 *
 * Returns a single {@link StudioPlugin} that bundles:
 *
 * 1. The yjs data-sync plugin (built via
 *    `@anvilkit/plugin-collab-yjs`'s `createCollabDataPlugin` over a
 *    `createYjsAdapter`-built adapter). Its lifecycle hooks become
 *    this plugin's `hooks` so Studio runs Puck data ↔ IR sync exactly
 *    once per mount.
 *
 * 2. UI contributions, exposed via the Studio plugin contract added in
 *    `core-014`:
 *      - `providers` — one provider that wraps the Studio tree in
 *        `<CollabUIProvider>` (so `useCollabContext`/`useCollabPeers`/
 *        ... work everywhere the host renders) plus an internal
 *        `<IdentitySync>` side-effect component for `onIdentityChange`
 *        and, unless `presence.broadcastCursor` is `false`, a turnkey
 *        `<PresenceCursorBroadcaster>` so the local cursor is published
 *        without any host pointer wiring.
 *      - `overlays` — `<PresenceLayer>` at `"canvas"` placement and
 *        `<ConflictNoticeCenter>` at `"notifications"`.
 *      - `slots` — `<PeerAvatarStack>` at the core `"collaborators"`
 *        header slot, so collaborator avatars render in `<StudioHeader>`.
 *
 * The factory leaves the host in control of transport: pass your own
 * `Y.Doc` and (optional) `Awareness`. The adapter is constructed
 * internally and torn down through the data plugin's `onDestroy` hook.
 *
 * @see plan §3.5 of `collab-plugin-consolidation-plan-2026-05-14.md`
 */

import type {
	StudioPlugin,
	StudioPluginMeta,
	StudioPluginRegistration,
} from "@anvilkit/core/types";
import {
	type AwarenessRateLimitOptions,
	type CollabPolicy,
	type CreateCollabPluginOptions as CreateDataPluginOptions,
	type CreateYjsAdapterOptions,
	createCollabDataPlugin,
	createDebouncedAdapter,
	createYjsAdapter,
	type PersistenceOptions,
	type PolicyViolation,
	type ValidateRemoteIR,
	type ValidationFailure,
} from "@anvilkit/plugin-collab-yjs";
import type {
	ManagedTransport,
	ManagedTransportProvider,
} from "@anvilkit/plugin-collab-yjs/transport";
// Runtime function + types for the plugin-owned managed transport. Imported
// from the dedicated `/transport` subpath so the provider libs it lazily
// loads never reach a consumer's initial chunk. No direct `yjs` dependency is
// added — yjs still arrives transitively through `createYjsAdapter`.
import { createManagedTransport } from "@anvilkit/plugin-collab-yjs/transport";
import type { PeerInfo } from "@anvilkit/plugin-version-history";
import type { Config as PuckConfig } from "@puckeditor/core";
import { UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { createElement, useEffect, useRef } from "react";

import config from "../meta/config.json";
import packageJson from "../package.json";

/**
 * Re-routed `Y.Doc` / `Awareness` types: we don't add `yjs` or
 * `y-protocols` as direct dependencies of this package; both arrive
 * transitively through `@anvilkit/plugin-collab-yjs`. Pulling the types
 * off `CreateYjsAdapterOptions` is sufficient for the public surface
 * and avoids requiring hosts to install yjs twice.
 */
type YDoc = CreateYjsAdapterOptions["doc"];
type Awareness = NonNullable<CreateYjsAdapterOptions["awareness"]>;

import {
	ConflictNoticeCenter,
	type ConflictNoticeCenterProps,
} from "./components/conflict-notice-center.js";
import { PeerAvatarStack } from "./components/peer-avatar-stack.js";
import { PresenceCursorBroadcaster } from "./components/presence-cursor-broadcaster.js";
import {
	type CollabPresenceLayerProps,
	PresenceLayer,
} from "./components/presence-layer.js";
import { CollabUIProvider, useCollabSelf } from "./context.js";
import { makeAnonSelf } from "./lib/anon-identity.js";

/**
 * Options for {@link createCollabPlugin}.
 *
 * Host owns identity (`self`) and transport (`doc` / `awareness`); the
 * factory composes the adapter, the data plugin, and the UI
 * contributions on top of those primitives.
 */
export interface CreateCollabPluginOptions {
	// ── Identity ──────────────────────────────────────────────────────
	/**
	 * The local peer's identity. Mirrored into awareness on mount and
	 * whenever a downstream consumer calls `updateSelf` on the context.
	 *
	 * Optional: when omitted, an anonymous identity is generated
	 * (`anon-<uuid>` id + a stable hashed color) so "just give me
	 * collaboration" needs neither a `doc` nor a `self`.
	 */
	readonly self?: PeerInfo;

	/**
	 * Optional callback fired whenever the local peer's identity
	 * changes via `useCollabContext().updateSelf(...)`. The host's
	 * source of truth (auth profile, settings store, …) can mirror the
	 * new value back here.
	 *
	 * Does **not** fire on initial mount — the host already knows the
	 * value they passed in via `self`. Subsequent same-value updates
	 * are deduplicated by shallow content equality on `{ id,
	 * displayName, color }`.
	 */
	readonly onIdentityChange?: (next: PeerInfo) => void;

	// ── Managed transport (plugin-owned) ─────────────────────────────
	/**
	 * WebSocket relay URL, e.g. `ws://localhost:1234`. The **one field most
	 * hosts set.** Provide it (and omit `doc`) to let the plugin own the
	 * whole transport lifecycle — doc, awareness, provider, status bridge,
	 * and teardown. Omit both `websocketUrl` and `doc` for single-tab
	 * in-memory mode (a one-time dev warning fires).
	 */
	readonly websocketUrl?: string;
	/**
	 * Shared room/document name for managed mode. Default
	 * `"anvilkit-default-room"` so two tabs collaborate out of the box.
	 */
	readonly room?: string;
	/**
	 * Managed-mode backend. Default `"hocuspocus"`. Ignored in BYO mode.
	 */
	readonly provider?: ManagedTransportProvider;
	/**
	 * Auth token forwarded to the relay (managed mode). Default `""`.
	 */
	readonly token?: string;
	/**
	 * Called when the managed transport fails (provider lib not installed,
	 * bad URL, auth failure). Defaults to a single `console.error`. Never
	 * throws from the factory.
	 */
	readonly onConnectionError?: (err: unknown) => void;

	// ── BYO transport (host-owned, forwarded to createYjsAdapter) ────
	/**
	 * Host-owned `Y.Doc`. Provide it to opt into **BYO transport mode** —
	 * the factory neither creates nor destroys it and honors your
	 * `awareness`/`connectionSource`. When omitted, the plugin builds and
	 * owns the transport (see `websocketUrl`). Takes precedence over
	 * `websocketUrl` when both are set.
	 */
	readonly doc?: YDoc;
	/**
	 * `Awareness` instance for presence + cursor sync. In BYO mode this is
	 * the host's; in managed mode it is an optional override the transport
	 * reuses instead of minting its own.
	 */
	readonly awareness?: Awareness;
	/**
	 * Map name on the Y.Doc that backs the page IR. Defaults to the
	 * `@anvilkit/plugin-collab-yjs` default.
	 */
	readonly mapName?: CreateYjsAdapterOptions["mapName"];
	/**
	 * Opt out of native-tree per-node CRDT merge. See
	 * `@anvilkit/plugin-collab-yjs`'s `CreateYjsAdapterOptions.useNativeTree`.
	 */
	readonly useNativeTree?: CreateYjsAdapterOptions["useNativeTree"];
	/**
	 * Overlap window for `onConflict` (ms). Forwarded to
	 * `createYjsAdapter`.
	 */
	readonly staleAfterMs?: CreateYjsAdapterOptions["staleAfterMs"];
	/**
	 * Connection-state event source. Forwarded to `createYjsAdapter`.
	 */
	readonly connectionSource?: CreateYjsAdapterOptions["connectionSource"];
	/**
	 * Compute structural deltas on every save (cost / index tradeoff).
	 * Forwarded to `createYjsAdapter`.
	 */
	readonly computeDelta?: CreateYjsAdapterOptions["computeDelta"];
	/**
	 * Awareness outbound rate limit. Forwarded to `createYjsAdapter`.
	 */
	readonly awarenessRateLimit?: AwarenessRateLimitOptions;
	/**
	 * Cross-tab persistence options (IndexedDB / BroadcastChannel).
	 */
	readonly persistence?: PersistenceOptions;

	// ── Data plugin behavior (forwarded to createCollabDataPlugin) ───
	/**
	 * P2 — coalesce keystroke-rate local saves before they hit the
	 * Y.Doc/transport. This consolidated factory wraps the adapter in
	 * `createDebouncedAdapter` BY DEFAULT (the headless
	 * `createCollabDataPlugin` accepts any adapter, so a bare
	 * `createYjsAdapter` would otherwise save on every keystroke and
	 * flood the Y.Doc). Default `150` ms. Set `0` to opt out (e.g. a
	 * host that already debounces upstream). Only the save path is
	 * debounced — presence, status, and conflict reads still use the
	 * live adapter.
	 */
	readonly saveDebounceMs?: number;
	/**
	 * The host's Puck `Config`. Required for **outgoing** sync (Puck
	 * data → IR → adapter `save()`). If omitted, the plugin still
	 * applies incoming remote updates but does not write local edits
	 * back to the adapter — useful for read-only viewers.
	 */
	readonly puckConfig?: PuckConfig;
	/**
	 * Validate remote IR before dispatching it into Puck. Forwarded to
	 * `createCollabDataPlugin`.
	 */
	readonly validateRemoteIR?: ValidateRemoteIR;
	/**
	 * Fires after a remote IR is rejected by `validateRemoteIR`.
	 */
	readonly onValidationFailure?: (failure: ValidationFailure) => void;
	/**
	 * RBAC / lock policy applied symmetrically on inbound and outbound.
	 */
	readonly policy?: CollabPolicy;
	/**
	 * Fires when `policy.canEdit` rejects an edit (either direction).
	 */
	readonly onPolicyViolation?: (violation: PolicyViolation) => void;
	/**
	 * Fires when an outbound `adapter.save(...)` rejects or throws.
	 * Without this hook, transport failures surface as
	 * `unhandledRejection` warnings.
	 */
	readonly onSaveError?: (error: unknown) => void;

	// ── UI knobs ─────────────────────────────────────────────────────
	/**
	 * Props forwarded verbatim to `<PresenceLayer>`. The layer reads
	 * peers from `<CollabUIProvider>` context, so only visual / cursor
	 * options need to be specified here. Pass `enabled: false` to skip
	 * mounting the layer entirely (e.g. read-only embeds).
	 *
	 * `broadcastCursor` (default `true`) additionally mounts a turnkey
	 * local-cursor publisher so the zero-config one-liner shows peers'
	 * cursors out of the box — no host pointer plumbing required. Set it
	 * `false` if you run your own presence writer (e.g. one that also
	 * broadcasts the Puck selection): awareness *replaces* the local frame
	 * on every update, so two writers would clobber each other.
	 */
	readonly presence?: CollabPresenceLayerProps & {
		readonly enabled?: boolean;
		readonly broadcastCursor?: boolean;
	};
	/**
	 * Props forwarded to `<ConflictNoticeCenter>`. Pass
	 * `enabled: false` to skip the toaster.
	 */
	readonly notifications?: ConflictNoticeCenterProps & {
		readonly enabled?: boolean;
	};
}

const PACKAGE_NAME = "@anvilkit/collab-ui";

// `version` is derived from package.json so a Changesets bump can never drift
// the runtime metadata; the metadata-drift test guards regressions.
const META: StudioPluginMeta = {
	...config,
	version: packageJson.version,
	icon: createElement(UsersRound),
};

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
function IdentitySync({
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

/** Transport primitives for `createYjsAdapter`, plus the owned transport (if
 * any) to dispose on destroy. */
interface ResolvedTransport {
	readonly doc: YDoc;
	readonly awareness: Awareness | undefined;
	readonly connectionSource: CreateYjsAdapterOptions["connectionSource"];
	readonly ownTransport: ManagedTransport | undefined;
}

/**
 * §3.4 resolution ladder. `doc` → BYO (today's path, untouched); else
 * `websocketUrl` → managed; else in-memory. Conflicting combinations resolve
 * by this precedence and emit a one-time dev warning naming the ignored field.
 */
function resolveTransport(
	options: CreateCollabPluginOptions,
	warn: (message: string) => void,
): ResolvedTransport {
	if (options.doc) {
		if (options.websocketUrl) {
			warn(
				"`websocketUrl` ignored because `doc` was provided (BYO transport mode).",
			);
		}
		return {
			doc: options.doc,
			awareness: options.awareness,
			connectionSource: options.connectionSource,
			ownTransport: undefined,
		};
	}

	// Plugin owns the transport: managed (with `websocketUrl`) or in-memory.
	if (!options.websocketUrl) {
		warn(
			"no `websocketUrl` or `doc` provided — running single-tab in-memory; edits will not sync. Set `websocketUrl` to enable live collaboration.",
		);
	}
	if (options.connectionSource) {
		warn(
			"host `connectionSource` ignored in managed/in-memory mode; the plugin owns the transport.",
		);
	}
	const ownTransport = createManagedTransport({
		websocketUrl: options.websocketUrl,
		room: options.room,
		provider: options.provider,
		token: options.token,
		awareness: options.awareness,
		onConnectionError: options.onConnectionError,
	});
	return {
		doc: ownTransport.doc,
		awareness: ownTransport.awareness,
		connectionSource: ownTransport.connectionSource,
		ownTransport,
	};
}

type CollabRegistrationHooks = NonNullable<StudioPluginRegistration["hooks"]>;

/**
 * Fold an owned transport's `destroy()` into the data plugin's `onDestroy`
 * chain so a `<Studio>` remount never leaks the WebSocket/doc/awareness.
 */
function composeTransportTeardown(
	hooks: StudioPluginRegistration["hooks"],
	transport: ManagedTransport,
): CollabRegistrationHooks {
	const baseOnDestroy = hooks?.onDestroy;
	return {
		...hooks,
		onDestroy: async (ctx) => {
			try {
				await baseOnDestroy?.(ctx);
			} finally {
				transport.destroy();
			}
		},
	};
}

/**
 * Make a per-plugin-instance one-time warner. Keyed by message and scoped to a
 * single `createCollabPlugin` call (NOT process-global), so a second plugin
 * instance with the same misconfiguration still surfaces its own warning.
 */
function createWarnOnce(): (message: string) => void {
	const seen = new Set<string>();
	return (message) => {
		if (seen.has(message)) return;
		seen.add(message);
		console.warn(`[anvilkit/collab] createCollabPlugin: ${message}`);
	};
}

/**
 * Build a single {@link StudioPlugin} that delivers both yjs data sync
 * *and* the collab UI (presence cursors, conflict toasts, collaborator
 * avatar stack) in one factory call.
 *
 * This is the integration surface most hosts should reach for. Power
 * users who want only the headless adapter can still import
 * `createYjsAdapter` / `createCollabDataPlugin` from
 * `@anvilkit/plugin-collab-yjs` directly.
 *
 * @example
 * ```tsx
 * import { createCollabPlugin } from "@anvilkit/collab-ui";
 *
 * // The one-liner: set only the relay URL. `room` → "anvilkit-default-room",
 * // `provider` → "hocuspocus", `self` → an auto-generated anonymous identity,
 * // and the whole transport lifecycle is owned by the plugin.
 * <Studio
 *   plugins={[createCollabPlugin({ websocketUrl: "ws://localhost:1234", puckConfig })]}
 *   puckConfig={puckConfig}
 * />
 * ```
 */
export function createCollabPlugin(
	options: CreateCollabPluginOptions,
): StudioPlugin {
	const {
		onIdentityChange,
		mapName,
		useNativeTree,
		staleAfterMs,
		computeDelta,
		awarenessRateLimit,
		persistence,
		saveDebounceMs,
		puckConfig,
		validateRemoteIR,
		onValidationFailure,
		policy,
		onPolicyViolation,
		onSaveError,
		presence: presenceOpts,
		notifications: notificationsOpts,
	} = options;

	// Resolved once per plugin instance, stable across Studio recompiles:
	// identity (auto-generated anon peer when `self` is omitted, so enabling
	// collaboration needs neither a `doc` nor a `self`), the one-time warner,
	// and the UI-enable flags (which depend only on options).
	const self = options.self ?? makeAnonSelf();
	const warnOnce = createWarnOnce();
	const presenceEnabled = presenceOpts?.enabled !== false;
	// Mount the turnkey local-cursor publisher unless presence is disabled or
	// the host opted out (because it runs its own combined cursor+selection
	// writer). Default on so `createCollabPlugin({ websocketUrl })` shows
	// remote cursors with no extra wiring.
	const broadcastCursorEnabled =
		presenceEnabled && presenceOpts?.broadcastCursor !== false;
	const notificationsEnabled = notificationsOpts?.enabled !== false;

	return {
		meta: META,
		async register(ctx) {
			// Build the transport + adapter FRESH on every register() — NOT once
			// in the factory body. A Studio recompile fires `onDestroy` (which,
			// in managed/in-memory mode, disposes the owned transport's
			// doc/awareness/provider) and then re-calls register() on the SAME
			// plugin object. Rebuilding here means the new registration runs over
			// a live doc instead of re-registering an adapter on a destroyed one
			// (managed-mode silent-death fix).
			//
			// §3.4 resolution ladder — BYO `doc` → managed `websocketUrl` →
			// in-memory. In the latter two the plugin owns `ownTransport`.
			const { doc, awareness, connectionSource, ownTransport } =
				resolveTransport(options, warnOnce);

			const adapter = createYjsAdapter({
				doc,
				awareness,
				peer: self,
				mapName,
				useNativeTree,
				staleAfterMs,
				connectionSource,
				computeDelta,
				awarenessRateLimit,
				persistence,
			});

			// P2 — coalesce keystroke-rate local saves by default. Only the data
			// plugin's save path is wrapped; presence/status/conflict reads below
			// stay on the live `adapter`. `saveDebounceMs: 0` opts out.
			const saveAdapter =
				saveDebounceMs === 0
					? adapter
					: createDebouncedAdapter(adapter, { ms: saveDebounceMs ?? 150 });

			const dataPlugin = createCollabDataPlugin({
				adapter: saveAdapter,
				puckConfig,
				localPeer: self,
				validateRemoteIR,
				onValidationFailure,
				policy,
				onPolicyViolation,
				onSaveError,
			} satisfies CreateDataPluginOptions);

			const dataRegistration = await dataPlugin.register(ctx);
			ctx.log("debug", `${PACKAGE_NAME}: createCollabPlugin registered`, {
				adapterStatus: adapter.getStatus().kind,
			});

			// Bound UI components close over THIS register's `adapter` and the
			// stable `self` (provider/overlay/slot contracts require
			// `ComponentType`, not `ReactNode`).
			const ProviderComponent = ({
				children,
			}: {
				readonly children: ReactNode;
			}): ReactNode => (
				<CollabUIProvider adapter={adapter} self={self}>
					<IdentitySync onIdentityChange={onIdentityChange} />
					{broadcastCursorEnabled ? <PresenceCursorBroadcaster /> : null}
					{children}
				</CollabUIProvider>
			);

			const PresenceOverlay = (): ReactNode => {
				const {
					enabled: _e,
					broadcastCursor: _b,
					...rest
				} = presenceOpts ?? {};
				// When the factory owns cursor broadcasting (the one-liner path),
				// the published coordinates are viewport-relative, so pin the layer
				// to the viewport by default — unless the host positions it itself.
				const className =
					rest.className ??
					(broadcastCursorEnabled ? "!fixed z-[9999]" : undefined);
				return <PresenceLayer {...rest} className={className} />;
			};

			const ConflictOverlay = (): ReactNode => {
				const { enabled: _e, ...rest } = notificationsOpts ?? {};
				return <ConflictNoticeCenter {...rest} />;
			};

			// Collaborator avatar stack for the core `"collaborators"` header
			// slot. Reads peers/identity from `<CollabUIProvider>` (contributed
			// above), which wraps the whole Studio tree — chrome included — so
			// the stack resolves its context inside `<StudioHeader>`.
			const CollaboratorsSlot = (): ReactNode => <PeerAvatarStack />;

			const registration: StudioPluginRegistration = {
				meta: META,
				// When the plugin owns the transport (managed/in-memory), fold its
				// teardown into the data plugin's `onDestroy` so a remount never
				// leaks a WebSocket/doc/awareness. BYO mode is untouched.
				hooks: ownTransport
					? composeTransportTeardown(dataRegistration.hooks, ownTransport)
					: dataRegistration.hooks,
				providers: [
					{
						id: "collab-ui",
						component: ProviderComponent,
					},
				],
				overlays: [
					...(presenceEnabled
						? ([
								{
									id: "collab-presence",
									placement: "canvas" as const,
									component: PresenceOverlay,
								},
							] as const)
						: []),
					...(notificationsEnabled
						? ([
								{
									id: "collab-conflicts",
									placement: "notifications" as const,
									component: ConflictOverlay,
								},
							] as const)
						: []),
				],
				slots: [
					{
						id: "collaborators",
						component: CollaboratorsSlot,
					},
				],
			};
			return registration;
		},
	};
}
