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

```tsx
import { Studio } from "@anvilkit/core";
import { createCollabYjsPlugin } from "@anvilkit/plugin-collab-yjs";
import {
  CollabUIProvider,
  CollabRoomBar,
  PeerAvatarStack,
  PresenceLayer,
  SyncActivityIndicator,
} from "@anvilkit/collab-ui";

const collab = createCollabYjsPlugin({ /* … */ });

export default function EditorPage() {
  return (
    <CollabUIProvider plugin={collab}>
      <header>
        <CollabRoomBar />
        <PeerAvatarStack />
        <SyncActivityIndicator />
      </header>
      <Studio puckConfig={puckConfig} plugins={[collab]} />
      <PresenceLayer />
    </CollabUIProvider>
  );
}
```

`CollabUIProvider` subscribes to the plugin's status, peer, and
conflict streams once and fans them out via context — every primitive
below is selector-thin and re-renders only on the data it actually
reads.

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
| `CollabSettingsPopover`    | `…/collab-settings-popover`                   | Per-room settings (display name, presence color, native-tree toggle).                  |

## Hooks

Selector hooks for hosts that want to build their own UI instead of
using the bundled components:

- `useCollabAdapter()` — the underlying `CollabAdapter` instance
- `useCollabStatus()` — `'connecting' | 'connected' | 'disconnected' | 'reconnecting'`
- `useCollabSelf()` — the local user's `CollabSelf` (id, name, color)
- `useCollabPeers()` — array of remote peers with live presence
- `useCollabConflicts()` — current conflict queue
- `useCollabContext()` — the full context value (for advanced cases)

## Dependency contract

`@anvilkit/collab-ui` depends on `@anvilkit/plugin-collab-yjs` for
its types and event streams. Hosts that don't ship realtime collab
should not install this package. See the
[realtime-collab architecture doc](https://github.com/ancyloce/anvilkit-studio/blob/main/docs/architecture/realtime-collab.md)
for the SnapshotAdapter v2 contract.
