/**
 * Shared hex-color validation for the local identity edit path (review U4).
 *
 * `#rgb`, `#rrggbb`, or `#rrggbbaa` only. The single source of truth for hex
 * validation: both `CollabUIProvider.updateSelf` (the awareness write path) and
 * the settings popover swatch normalize through {@link normalizeHexColor}, so an
 * invalid value — a `rgb(...)`/named color, or a malformed `#zzz` — can neither
 * reach `adapter.presence.update` nor silently render as something it isn't.
 */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function normalizeHexColor(
	input: string | undefined,
	fallback: string,
): string;
export function normalizeHexColor(
	input: string | undefined,
	fallback: string | undefined,
): string | undefined;
export function normalizeHexColor(
	input: string | undefined,
	fallback: string | undefined,
): string | undefined {
	if (typeof input === "string") {
		const value = input.trim();
		if (HEX_COLOR_PATTERN.test(value)) return value;
	}
	return fallback;
}
