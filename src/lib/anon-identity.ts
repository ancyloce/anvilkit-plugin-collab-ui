import type { PeerInfo } from "@anvilkit/plugin-version-history";

/**
 * Twelve vivid, theme-agnostic avatar/cursor colors. Hex (not HSL) on
 * purpose: `normalizeColor` in the provider's local-edit path (`context.tsx`)
 * accepts only hex, so an HSL value would silently fall back the moment a user
 * tweaks their identity in the settings popover.
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
 * Build an anonymous local identity for hosts that enable collaboration
 * without supplying a `self`. The id is a fresh UUID; the color is derived
 * deterministically from the id so a session keeps a stable avatar/cursor
 * color across re-renders.
 */
export function makeAnonSelf(): PeerInfo {
	const id = `anon-${randomId()}`;
	return { id, displayName: "Anonymous", color: colorForId(id) };
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
