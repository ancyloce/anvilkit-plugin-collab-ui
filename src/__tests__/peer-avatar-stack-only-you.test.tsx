import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PeerAvatarStack } from "../components/peer-avatar-stack.js";
import { CollabUIProvider } from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter } from "./test-utils.js";

function stackOf(container: HTMLElement): HTMLElement {
	const stack = container.querySelector(
		"[data-slot=peer-avatar-stack]",
	) as HTMLElement | null;
	if (stack === null) throw new Error("peer-avatar-stack not rendered");
	return stack;
}

describe("<PeerAvatarStack /> only-you accessible label", () => {
	it("labels the stack 'Only you' (not a collaborator count) when no remote peers are present", () => {
		const { adapter } = createFakeAdapter();
		const { container } = render(
			<CollabUII18nProvider>
				<CollabUIProvider
					adapter={adapter}
					self={{ id: "alice", displayName: "Alice" }}
				>
					<PeerAvatarStack />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		const label = stackOf(container).getAttribute("aria-label");
		// Zero remote peers must read as the distinct "Only you" state, never
		// "1 collaborator connected" (which conflates self with a remote peer).
		expect(label).toBe("Only you");
		expect(label).not.toMatch(/collaborator/i);
		// The localized key must resolve to real copy, not the raw key.
		expect(label).not.toContain("collabUi.");
	});

	it("keeps the collaborator-count copy when ≥1 remote peer is present", () => {
		const { adapter, controls } = createFakeAdapter();
		const { container } = render(
			<CollabUII18nProvider>
				<CollabUIProvider
					adapter={adapter}
					self={{ id: "alice", displayName: "Alice" }}
				>
					<PeerAvatarStack />
				</CollabUIProvider>
			</CollabUII18nProvider>,
		);

		act(() =>
			controls.emitPeers([{ peer: { id: "bob", displayName: "Bob" } }]),
		);

		// self (alice) + 1 remote (bob) = 2 collaborators → existing count copy.
		const label = stackOf(container).getAttribute("aria-label");
		expect(label).toBe("2 collaborators connected");
	});
});
