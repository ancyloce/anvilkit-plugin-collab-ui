import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PeerAvatarStack } from "../components/peer-avatar-stack.js";
import { CollabUIProvider } from "../context.js";
import { createFakeAdapter } from "./test-utils.js";

describe("<PeerAvatarStack />", () => {
  it("renders the local collaborator when no remote peers are present", () => {
    const { adapter } = createFakeAdapter();
    const { container } = render(
      <CollabUIProvider
        adapter={adapter}
        self={{ id: "alice", displayName: "Alice" }}
      >
        <PeerAvatarStack />
      </CollabUIProvider>,
    );
    const stack = container.querySelector(
      "[data-slot=peer-avatar-stack]",
    ) as HTMLElement | null;
    expect(stack).not.toBeNull();
    expect(stack?.children.length).toBe(1);
    expect(container.querySelector("[data-peer-id='alice']")?.textContent).toBe(
      "A",
    );
  });

  it("shows up to maxVisible avatars, then a +N overflow chip", () => {
    const { adapter, controls } = createFakeAdapter();
    const { container } = render(
      <CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
        <PeerAvatarStack maxVisible={3} />
      </CollabUIProvider>,
    );

    act(() =>
      controls.emitPeers([
        { peer: { id: "alice", displayName: "Alice" } },
        { peer: { id: "bob", displayName: "Bob" } },
        { peer: { id: "carol", displayName: "Carol" } },
        { peer: { id: "dave", displayName: "Dave" } },
        { peer: { id: "eve", displayName: "Eve" } },
      ]),
    );

    // Self is included, so 5 collaborators are present. With
    // maxVisible=3 we expect 3 avatars + 1 "+2" chip.
    const visible = container.querySelectorAll("[data-peer-id]");
    expect(visible.length).toBe(3);
    const overflow = container.querySelector("[aria-label='2 more']");
    expect(overflow?.textContent).toBe("+2");
  });
});
