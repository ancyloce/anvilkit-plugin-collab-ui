import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollabPresenceAnnouncer } from "../components/collab-presence-announcer.js";
import { CollabUIProvider } from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter } from "./test-utils.js";

describe("<CollabPresenceAnnouncer />", () => {
	it("renders a visually-hidden polite live region", () => {
		const { adapter } = createFakeAdapter();
		const { container } = render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<CollabPresenceAnnouncer />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);
		const region = container.querySelector(
			"[data-slot=collab-presence-announcer]",
		) as HTMLElement | null;
		expect(region).not.toBeNull();
		expect(region?.getAttribute("role")).toBe("status");
		expect(region?.getAttribute("aria-live")).toBe("polite");
		// Seeded silent on mount with no remote peers — nothing announced yet.
		expect(region?.textContent).toBe("");
	});

	it("announces the localized 'joined' text when a peer is added", () => {
		const { adapter, controls } = createFakeAdapter();
		const { container } = render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<CollabPresenceAnnouncer />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);
		const region = () =>
			container.querySelector(
				"[data-slot=collab-presence-announcer]",
			) as HTMLElement | null;

		act(() =>
			controls.emitPeers([{ peer: { id: "bob", displayName: "Bob" } }]),
		);

		const text = region()?.textContent ?? "";
		expect(text).toContain("Bob joined");
		// The `{name}` param resolved — not the raw template or key.
		expect(text).not.toContain("{name}");
		expect(text).not.toContain("collabUi.presence");
	});

	it("announces the localized 'left' text when a peer is removed", () => {
		const { adapter, controls } = createFakeAdapter();
		const { container } = render(
			<CollabUII18nProvider>
				<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
					<CollabPresenceAnnouncer />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);
		const region = () =>
			container.querySelector(
				"[data-slot=collab-presence-announcer]",
			) as HTMLElement | null;

		// Bob joins, then leaves.
		act(() =>
			controls.emitPeers([{ peer: { id: "bob", displayName: "Bob" } }]),
		);
		act(() => controls.emitPeers([]));

		const text = region()?.textContent ?? "";
		expect(text).toContain("Bob left");
		expect(text).not.toContain("{name}");
	});

	it("does NOT spam announcements for a pre-existing roster present at mount", () => {
		const { adapter, controls } = createFakeAdapter();
		// Stable provider; the announcer mounts only AFTER a roster already
		// exists, mirroring a host opening a room with collaborators present.
		function Tree({ withAnnouncer }: { withAnnouncer: boolean }) {
			return (
				<CollabUII18nProvider>
					<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
						{withAnnouncer ? <CollabPresenceAnnouncer /> : null}
					</CollabUIProvider>
				</CollabUII18nProvider>
			);
		}
		const { container, rerender } = render(<Tree withAnnouncer={false} />);

		// Seed two pre-existing peers BEFORE the announcer mounts.
		act(() =>
			controls.emitPeers([
				{ peer: { id: "bob", displayName: "Bob" } },
				{ peer: { id: "carol", displayName: "Carol" } },
			]),
		);

		rerender(<Tree withAnnouncer={true} />);
		const region = () =>
			container.querySelector(
				"[data-slot=collab-presence-announcer]",
			) as HTMLElement | null;

		// The pre-existing roster must NOT be announced as joins.
		expect(region()?.textContent).toBe("");

		// But a NEW join after mount IS announced (only post-mount deltas).
		act(() =>
			controls.emitPeers([
				{ peer: { id: "bob", displayName: "Bob" } },
				{ peer: { id: "carol", displayName: "Carol" } },
				{ peer: { id: "dave", displayName: "Dave" } },
			]),
		);
		expect(region()?.textContent ?? "").toContain("Dave joined");
	});
});
