export {
	CollabPresenceAnnouncer,
	type CollabPresenceAnnouncerProps,
} from "./components/collab-presence-announcer.js";
export {
	CollabPresencePublisher,
	type CollabPresencePublisherProps,
} from "./components/collab-presence-publisher.js";
export {
	CollabRoomBar,
	type CollabRoomBarProps,
} from "./components/collab-room-bar.js";
export {
	CollabSettingsPopover,
	type CollabSettingsPopoverProps,
} from "./components/collab-settings-popover.js";
export {
	CollabUndoRedoControls,
	type CollabUndoRedoControlsProps,
} from "./components/collab-undo-redo-controls.js";
export {
	ConflictNoticeCenter,
	type ConflictNoticeCenterProps,
} from "./components/conflict-notice-center.js";
export {
	ConnectionRecoveryBanner,
	type ConnectionRecoveryBannerLabels,
	type ConnectionRecoveryBannerProps,
} from "./components/connection-recovery-banner.js";
export {
	ForceResyncDialog,
	type ForceResyncDialogLabels,
	type ForceResyncDialogProps,
} from "./components/force-resync-dialog.js";
export {
	PeerAvatarStack,
	type PeerAvatarStackProps,
} from "./components/peer-avatar-stack.js";
export {
	type CollabPresenceLayerProps,
	PresenceLayer,
} from "./components/presence-layer.js";
export {
	SyncActivityIndicator,
	type SyncActivityIndicatorProps,
	type SyncActivityLabels,
} from "./components/sync-activity-indicator.js";
export {
	type CollabSelf,
	type CollabUIContextValue,
	CollabUIProvider,
	type CollabUIProviderProps,
	type CollabUndoState,
	useCollabAdapter,
	useCollabConflictQueue,
	useCollabConflicts,
	useCollabContext,
	useCollabCursorVisibility,
	useCollabIdentity,
	useCollabMetrics,
	useCollabPeerIdentities,
	useCollabPeers,
	useCollabSelf,
	useCollabStatus,
	useCollabUndoState,
} from "./context.js";
export { CollabUII18nProvider } from "./i18n/provider.js";
export { conflictKey } from "./lib/conflict-key.js";
export type { PresencePublishingMode } from "./lib/select-presence-writer.js";
export {
	type CreateCollabPluginOptions,
	createCollabPlugin,
} from "./plugin.js";
