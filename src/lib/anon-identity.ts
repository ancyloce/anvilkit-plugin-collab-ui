import type { PeerInfo } from "@anvilkit/plugin-version-history";

/**
 * Twelve vivid, theme-agnostic avatar/cursor colors. Hex (not HSL) on
 * purpose: `normalizeHexColor` (`lib/color.ts`) on the provider's local-edit
 * path accepts only hex, so an HSL value would silently fall back the moment a
 * user tweaks their identity in the settings popover.
 */
const ANON_PALETTE = [
	"#f43f5e",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#14b8a6",
	"#0ea5e9",
	"#3b82f6",
	"#6366f1",
	"#a855f7",
	"#ec4899",
	"#ef4444",
	"#10b981",
] as const;

/**
 * Locale-neutral wire sentinel for an auto-generated anonymous peer's name
 * (review U3). The display name travels over awareness as data, so each client
 * localizes it for rendering via {@link resolveDisplayName} + the
 * `collabUi.identity.anonymous` catalog key — a zh viewer sees "匿名" and an en
 * viewer "Anonymous" for the *same* remote anonymous peer.
 */
export const ANONYMOUS_DISPLAY_NAME = "Anonymous";

/** Id prefix that marks an auto-generated anonymous identity. */
export const ANON_ID_PREFIX = "anon-";

/**
 * Build an anonymous local identity for hosts that enable collaboration
 * without supplying a `self`. The id is a fresh UUID; the color is derived
 * deterministically from the id so a session keeps a stable avatar/cursor
 * color across re-renders. The display name defaults to the localizable
 * {@link ANONYMOUS_DISPLAY_NAME} sentinel, but a host may pass its own
 * (already-localized) label.
 */
export function makeAnonSelf(
	displayName: string = ANONYMOUS_DISPLAY_NAME,
): PeerInfo {
	const id = `${ANON_ID_PREFIX}${randomId()}`;
	return { id, displayName, color: colorForId(id) };
}

/**
 * True when `peer` is an auto-generated anonymous identity *still* bearing the
 * default name — i.e. one whose label should be localized on display. An anon
 * peer who renamed themselves via the settings popover keeps the `anon-` id but
 * a custom name, so this returns false and their chosen name renders verbatim.
 */
function isDefaultAnonymousPeer(peer: PeerInfo): boolean {
	return (
		peer.id.startsWith(ANON_ID_PREFIX) &&
		peer.displayName === ANONYMOUS_DISPLAY_NAME
	);
}

/**
 * Resolve a peer's display label, substituting the caller's localized
 * "Anonymous" string for the default anonymous sentinel (review U3). Returns
 * `undefined` for a non-anonymous peer with no name so callers keep their own
 * fallback (the id for an avatar, no label for a cursor).
 */
export function resolveDisplayName(
	peer: PeerInfo,
	anonymousLabel: string,
): string | undefined {
	if (isDefaultAnonymousPeer(peer)) return anonymousLabel;
	return peer.displayName;
}

/** Deterministic hex color from an id string (same id → same color). */
export function colorForId(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i += 1) {
		hash = (hash * 31 + id.charCodeAt(i)) | 0;
	}
	return ANON_PALETTE[Math.abs(hash) % ANON_PALETTE.length] as string;
}

function randomId(): string {
	const webcrypto = typeof crypto !== "undefined" ? crypto : undefined;
	if (webcrypto && typeof webcrypto.randomUUID === "function") {
		return webcrypto.randomUUID();
	}
	// Fallback for runtimes without WebCrypto (older test envs).
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
