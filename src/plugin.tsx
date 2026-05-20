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
 *        `<IdentitySync>` side-effect component for `onIdentityChange`.
 *      - `overlays` — `<PresenceLayer>` at `"canvas"` placement and
 *        `<ConflictNoticeCenter>` at `"notifications"`.
 *      - `slots` — `<PeerAvatarStack>` claims the header
 *        `"collaborators"` slot (host can still override with the
 *        `collaboratorsSlot` prop on `<Studio>`).
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
  createCollabDataPlugin,
  type CreateCollabPluginOptions as CreateDataPluginOptions,
  createDebouncedAdapter,
  type CreateYjsAdapterOptions,
  createYjsAdapter,
  type PersistenceOptions,
  type ValidateRemoteIR,
  type ValidationFailure,
  type PolicyViolation,
} from "@anvilkit/plugin-collab-yjs";
import type { PeerInfo } from "@anvilkit/plugin-version-history";
import type { Config as PuckConfig } from "@puckeditor/core";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

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
  type CollabPresenceLayerProps,
  PresenceLayer,
} from "./components/presence-layer.js";
import {
  ConflictNoticeCenter,
  type ConflictNoticeCenterProps,
} from "./components/conflict-notice-center.js";
import {
  PeerAvatarStack,
  type PeerAvatarStackProps,
} from "./components/peer-avatar-stack.js";
import { CollabUIProvider, useCollabSelf } from "./context.js";

/**
 * Options for {@link createCollabPlugin}.
 *
 * Host owns identity (`self`) and transport (`doc` / `awareness`); the
 * factory composes the adapter, the data plugin, and the UI
 * contributions on top of those primitives.
 */
export interface CreateCollabPluginOptions {
  // ── Identity (host-owned) ─────────────────────────────────────────
  /**
   * The local peer's identity. Mirrored into awareness on mount and
   * whenever a downstream consumer calls `updateSelf` on the context.
   */
  readonly self: PeerInfo;

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

  // ── Transport (host-owned, forwarded to createYjsAdapter) ────────
  /**
   * Host-owned `Y.Doc`. The factory does not create or destroy it;
   * the host controls transport (in-memory, y-websocket, Hocuspocus,
   * etc.).
   */
  readonly doc: YDoc;
  /**
   * Optional `Awareness` instance for presence + cursor sync.
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
   */
  readonly presence?: CollabPresenceLayerProps & { readonly enabled?: boolean };
  /**
   * Props forwarded to `<ConflictNoticeCenter>`. Pass
   * `enabled: false` to skip the toaster.
   */
  readonly notifications?: ConflictNoticeCenterProps & {
    readonly enabled?: boolean;
  };
  /**
   * Props forwarded to the header `<PeerAvatarStack>` claiming the
   * `collaborators` slot. The host's `collaboratorsSlot` prop on
   * `<Studio>` still wins per the plugin contract.
   */
  readonly collaboratorsStack?: PeerAvatarStackProps & {
    readonly enabled?: boolean;
  };
}

const PACKAGE_NAME = "@anvilkit/collab-ui";

const META: StudioPluginMeta = {
  id: "@anvilkit/collab",
  name: "Collaboration",
  // Derived from package.json so a Changesets bump can never drift the
  // runtime metadata; the metadata-drift test guards regressions.
  version: packageJson.version,
  coreVersion: "^0.1.0-alpha",
  description:
    "Realtime collaboration: presence cursors, conflict diagnostics, and Yjs CRDT sync. Bundles @anvilkit/plugin-collab-yjs data sync with @anvilkit/collab-ui presence chrome.",
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
 * import { Doc as YDoc } from "yjs";
 *
 * const doc = new YDoc();
 * <Studio
 *   plugins={[
 *     createCollabPlugin({
 *       doc,
 *       self: { id: "alice", displayName: "Alice", color: "#f43f5e" },
 *       puckConfig: myConfig,
 *     }),
 *   ]}
 *   puckConfig={myConfig}
 * />
 * ```
 */
export function createCollabPlugin(
  options: CreateCollabPluginOptions,
): StudioPlugin {
  const {
    self,
    onIdentityChange,
    doc,
    awareness,
    mapName,
    useNativeTree,
    staleAfterMs,
    connectionSource,
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
    collaboratorsStack: stackOpts,
  } = options;

  // Build the adapter. The host's `Y.Doc` outlives the adapter; the
  // adapter cleans up its own listeners via the data plugin's
  // `onDestroy`.
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

  // P2 — coalesce keystroke-rate local saves by default. Only the
  // data plugin's save path is wrapped; presence/status/conflict
  // reads below stay on the live `adapter`. `saveDebounceMs: 0`
  // opts out for hosts that debounce upstream.
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

  // Bound UI components — closures over the factory options so each
  // render produces a fresh subtree (provider/overlay/slot contracts
  // require `ComponentType`, not `ReactNode`).
  const ProviderComponent = ({
    children,
  }: {
    readonly children: ReactNode;
  }): ReactNode => (
    <CollabUIProvider adapter={adapter} self={self}>
      <IdentitySync onIdentityChange={onIdentityChange} />
      {children}
    </CollabUIProvider>
  );

  const PresenceOverlay = (): ReactNode => {
    const { enabled: _e, ...rest } = presenceOpts ?? {};
    return <PresenceLayer {...rest} />;
  };

  const ConflictOverlay = (): ReactNode => {
    const { enabled: _e, ...rest } = notificationsOpts ?? {};
    return <ConflictNoticeCenter {...rest} />;
  };

  const CollaboratorsSlotComponent = (): ReactNode => {
    const { enabled: _e, ...rest } = stackOpts ?? {};
    return <PeerAvatarStack {...rest} />;
  };

  const presenceEnabled = presenceOpts?.enabled !== false;
  const notificationsEnabled = notificationsOpts?.enabled !== false;
  const collaboratorsStackEnabled = stackOpts?.enabled !== false;

  return {
    meta: META,
    async register(ctx) {
      const dataRegistration = await dataPlugin.register(ctx);
      ctx.log("debug", `${PACKAGE_NAME}: createCollabPlugin registered`, {
        adapterStatus: adapter.getStatus().kind,
      });

      const registration: StudioPluginRegistration = {
        meta: META,
        hooks: dataRegistration.hooks,
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
        slots: collaboratorsStackEnabled
          ? [
              {
                id: "collaborators",
                component: CollaboratorsSlotComponent,
              },
            ]
          : undefined,
      };
      return registration;
    },
  };
}
