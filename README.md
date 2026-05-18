# @anvilkit/collab-ui

Host UI primitives for [`@anvilkit/plugin-collab-yjs`](https://github.com/ancyloce/anvilkit-plugin-collab-yjs).
The Yjs plugin itself is headless — it ships the CRDT layer, the
SnapshotAdapter, presence wiring, and conflict diagnostics, but no
DOM. This package fills in the UI: a context provider that surfaces
the live collab state plus a set of shadcn-style components that
host apps drop into their editor chrome.

> **Release-candidate (0.1.0-rc.0).** Tracks `@anvilkit/plugin-collab-yjs`
> on the `@beta` npm tag. Both packages cut a joint GA together once
> the SnapshotAdapter v2 contract is frozen.

## Install

```bash
pnpm add @anvilkit/collab-ui @anvilkit/plugin-collab-yjs @anvilkit/core react react-dom
```

`react`, `react-dom`, and `@anvilkit/core` are peer dependencies.

## Quickstart

`createCollabPlugin()` is the integration surface most hosts want: one
factory call returns a single `StudioPlugin` that bundles the Yjs
data-sync plugin **plus** the collab UI (provider, presence overlay,
conflict toaster, collaborator avatar stack). The host owns identity
(`self`) and transport (`doc` / optional `awareness`).

```tsx
import { Studio } from "@anvilkit/core";
import { createCollabPlugin } from "@anvilkit/collab-ui";
import { Doc as YDoc } from "yjs";

const doc = new YDoc();

export default function EditorPage() {
  return (
    <Studio
      puckConfig={puckConfig}
      plugins={[
        createCollabPlugin({
          doc,
          self: { id: "alice", displayName: "Alice", color: "#f43f5e" },
          puckConfig,
        }),
      ]}
    />
  );
}
```

The bundled `<PresenceLayer>`, `<ConflictNoticeCenter>`, and the
`collaborators` slot are mounted by the plugin automatically; pass
`presence: { enabled: false }` (etc.) to opt out. Power users who want
only the headless adapter can still import `createYjsAdapter` /
`createCollabDataPlugin` from `@anvilkit/plugin-collab-yjs` and wrap
their tree in `<CollabUIProvider adapter={adapter} self={self}>`
directly.

`CollabUIProvider` subscribes to the adapter's status, peer, and
conflict streams once and fans them out through **separate** contexts
(adapter / identity / status / peers / conflicts / cursor-visibility)
— every primitive below is selector-thin and re-renders only on the
slice it reads, so remote cursor churn never re-renders the status
pill or conflict toaster.

### Local cursor publishing

`@anvilkit/collab-ui` renders *remote* cursors and selections. To also
publish the *local* peer's cursor/selection, mount the opt-in
`<CollabPresencePublisher root={canvasEl} />` (or have the host call
`adapter.presence.update(...)` itself).

## Components

| Component                  | Subpath                                       | Purpose                                                                                |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `CollabUIProvider`         | `@anvilkit/collab-ui`                         | Context provider — wraps the editor and the chrome that consumes collab state.         |
| `CollabRoomBar`            | `@anvilkit/collab-ui/components/collab-room-bar` | Room name + connection status pill.                                                 |
| `PeerAvatarStack`          | `…/peer-avatar-stack`                         | Stacked peer avatars with live presence colors.                                        |
| `PresenceLayer`            | `…/presence-layer`                            | Floating cursor + selection overlay that follows peer focus.                           |
| `SyncActivityIndicator`    | `…/sync-activity-indicator`                   | "Syncing…" / "Synced" pulse driven by the CRDT update stream.                          |
| `ConflictNoticeCenter`     | `…/conflict-notice-center`                    | Toast stack for `CollabConflict` events surfaced by the plugin.                        |
| `ForceResyncDialog`        | `…/force-resync-dialog`                       | Confirmation dialog for the "force resync" action.                                     |
| `CollabSettingsPopover`    | `…/collab-settings-popover`                   | Per-room settings (display name, presence color, show-remote-cursors toggle, room).    |
| `CollabPresencePublisher`  | `…/collab-presence-publisher`                 | Opt-in: publishes the local cursor + Puck selection into awareness.                    |

## Hooks

Selector hooks for hosts that want to build their own UI instead of
using the bundled components:

- `useCollabAdapter()` — the underlying `YjsSnapshotAdapter` instance
- `useCollabStatus()` — discriminated `ConnectionStatus`, one of
  `{ kind: "connecting" }`, `{ kind: "synced", since }`,
  `{ kind: "offline", since, queuedEdits }`,
  `{ kind: "reconnecting", attempt, backoffMs }`, or
  `{ kind: "error", message, recoverable }`
- `useCollabSelf()` — the local peer's `PeerInfo` (id, displayName, color)
- `useCollabIdentity()` — `{ self, updateSelf }` (identity context only)
- `useCollabPeers()` — array of remote peers with live presence
- `useCollabConflicts()` — current conflict queue
- `useCollabConflictQueue()` — `{ conflicts, dismissConflict, clearConflicts }`
- `useCollabCursorVisibility()` — `{ showRemoteCursors, setShowRemoteCursors }`,
  the shared source of truth for the settings toggle and `PresenceLayer`
- `useCollabMetrics(pollMs?)` — polled `MetricsSnapshot | null` from
  `adapter.metrics()` (latency p50/p95, awareness churn, degraded, …)
- `useCollabContext()` — the full composite context value (re-renders on
  any change; prefer the narrow hooks above)

## Dependency contract

`@anvilkit/collab-ui` depends on `@anvilkit/plugin-collab-yjs` for
its types and event streams. Hosts that don't ship realtime collab
should not install this package. See the
[realtime-collab architecture doc](https://github.com/ancyloce/anvilkit-studio/blob/main/docs/architecture/realtime-collab.md)
for the SnapshotAdapter v2 contract.
