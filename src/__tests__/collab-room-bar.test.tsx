import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollabRoomBar } from "../components/collab-room-bar.js";
import { CollabUIProvider } from "../context.js";
import { createFakeAdapter } from "./test-utils.js";

describe("<CollabRoomBar />", () => {
  it("renders the title and subtitle alongside the sync indicator", () => {
    const { adapter } = createFakeAdapter();
    const { getByTestId, container } = render(
      <CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
        <CollabRoomBar title="Marketing Page" subtitle="Hero v3" />
      </CollabUIProvider>,
    );
    expect(getByTestId("collab-room-bar-title").textContent).toBe(
      "Marketing Page",
    );
    expect(
      container.querySelector("[data-slot=sync-activity-indicator]"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-slot=peer-avatar-stack]"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-slot=collab-settings-trigger]"),
    ).not.toBeNull();
  });
});
