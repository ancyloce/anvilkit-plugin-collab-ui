import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CollabUIProvider,
  useCollabConflicts,
  useCollabContext,
  useCollabPeers,
  useCollabStatus,
} from "../context.js";
import { createFakeAdapter } from "./test-utils.js";

describe("CollabUIProvider", () => {
  it("throws when hooks are used outside the provider", () => {
    expect(() => renderHook(() => useCollabContext())).toThrow(
      /CollabUIProvider/,
    );
  });

  it("seeds status and updates as the adapter emits", () => {
    const { adapter, controls } = createFakeAdapter();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
        {children}
      </CollabUIProvider>
    );
    const { result } = renderHook(() => useCollabStatus(), { wrapper });
    expect(result.current).toEqual({ kind: "connecting" });

    act(() => controls.emitStatus({ kind: "synced", since: "2026-05-08" }));
    expect(result.current.kind).toBe("synced");

    act(() =>
      controls.emitStatus({
        kind: "offline",
        since: "2026-05-08",
        queuedEdits: 4,
      }),
    );
    expect(result.current.kind).toBe("offline");
  });

  it("filters self from the peers list", () => {
    const { adapter, controls } = createFakeAdapter();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
        {children}
      </CollabUIProvider>
    );
    const { result } = renderHook(() => useCollabPeers(), { wrapper });

    act(() =>
      controls.emitPeers([
        { peer: { id: "alice", displayName: "Alice" } },
        { peer: { id: "bob", displayName: "Bob" } },
      ]),
    );
    expect(result.current.map((peer) => peer.peer.id)).toEqual(["bob"]);
  });

  it("dedupes repeated remote peer frames by id", () => {
    const { adapter, controls } = createFakeAdapter();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
        {children}
      </CollabUIProvider>
    );
    const { result } = renderHook(() => useCollabPeers(), { wrapper });

    act(() =>
      controls.emitPeers([
        { peer: { id: "bob", displayName: "Bob" } },
        {
          peer: { id: "bob", displayName: "Bob" },
          cursor: { x: 12, y: 34 },
        },
      ]),
    );
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.peer.id).toBe("bob");
    expect(result.current[0]?.cursor).toEqual({ x: 12, y: 34 });
  });

  it("appends conflict events", () => {
    const { adapter, controls } = createFakeAdapter();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
        {children}
      </CollabUIProvider>
    );
    const { result } = renderHook(() => useCollabConflicts(), { wrapper });

    act(() =>
      controls.emitConflict({
        kind: "overlap",
        localPeer: { id: "alice" },
        remotePeer: { id: "bob" },
        nodeIds: ["hero-1"],
        at: "2026-05-08T00:00:00.000Z",
      }),
    );
    expect(result.current.length).toBe(1);
    expect(result.current[0]?.nodeIds).toEqual(["hero-1"]);
  });

  it("renders children", () => {
    const { adapter } = createFakeAdapter();
    const { getByText } = render(
      <CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
        <span>hello</span>
      </CollabUIProvider>,
    );
    expect(getByText("hello")).toBeInTheDocument();
  });
});
