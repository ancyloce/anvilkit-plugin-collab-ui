import type { YjsSnapshotAdapter } from "@anvilkit/plugin-collab-yjs";
import {
	act,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CollabUndoRedoControls } from "../components/collab-undo-redo-controls.js";
import { CollabUIProvider, useCollabUndoState } from "../context.js";
import { CollabUII18nProvider } from "../i18n/provider.js";
import { createFakeAdapter } from "./test-utils.js";

interface UndoTestControls {
	readonly undo: ReturnType<typeof vi.fn>;
	readonly redo: ReturnType<typeof vi.fn>;
	readonly setCanUndo: (value: boolean) => void;
	readonly setCanRedo: (value: boolean) => void;
}

/**
 * Augment the base fake adapter (which has NO undo controller) with a
 * working `UndoController` surface whose getters are flippable and whose
 * `onUndoStackChange` fires on demand — so the hook's
 * `useSyncExternalStore` path and the button enabled-state are exercised.
 */
function createUndoAdapter(): {
	adapter: YjsSnapshotAdapter;
	undoControls: UndoTestControls;
} {
	const { adapter } = createFakeAdapter();
	let canUndo = false;
	let canRedo = false;
	const listeners = new Set<() => void>();
	const notify = (): void => {
		for (const listener of listeners) listener();
	};
	const undo = vi.fn();
	const redo = vi.fn();
	const undoAdapter: YjsSnapshotAdapter = {
		...adapter,
		undo,
		redo,
		canUndo: () => canUndo,
		canRedo: () => canRedo,
		clearUndo: () => undefined,
		onUndoStackChange: (callback: () => void) => {
			listeners.add(callback);
			return () => {
				listeners.delete(callback);
			};
		},
	};
	return {
		adapter: undoAdapter,
		undoControls: {
			undo,
			redo,
			setCanUndo(value) {
				canUndo = value;
				notify();
			},
			setCanRedo(value) {
				canRedo = value;
				notify();
			},
		},
	};
}

function wrap(adapter: YjsSnapshotAdapter) {
	return ({ children }: { children: ReactNode }) => (
		<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
			{children}
		</CollabUIProvider>
	);
}

function renderControls(adapter: YjsSnapshotAdapter) {
	return render(
		<CollabUII18nProvider>
			<CollabUIProvider adapter={adapter} self={{ id: "alice" }}>
				<CollabUndoRedoControls />
			</CollabUIProvider>
		</CollabUII18nProvider>,
	);
}

describe("useCollabUndoState()", () => {
	it("returns disabled, no-op defaults when the adapter lacks undo support", () => {
		const { adapter } = createFakeAdapter();
		const { result } = renderHook(() => useCollabUndoState(), {
			wrapper: wrap(adapter),
		});
		expect(result.current.canUndo).toBe(false);
		expect(result.current.canRedo).toBe(false);
		// Must never throw on an adapter that predates the undo controller.
		expect(() => result.current.undo()).not.toThrow();
		expect(() => result.current.redo()).not.toThrow();
	});

	it("reflects the adapter getters and re-reads on stack changes", () => {
		const { adapter, undoControls } = createUndoAdapter();
		const { result } = renderHook(() => useCollabUndoState(), {
			wrapper: wrap(adapter),
		});
		expect(result.current.canUndo).toBe(false);
		expect(result.current.canRedo).toBe(false);

		act(() => undoControls.setCanUndo(true));
		expect(result.current.canUndo).toBe(true);
		expect(result.current.canRedo).toBe(false);

		act(() => undoControls.setCanRedo(true));
		expect(result.current.canRedo).toBe(true);

		// `undo()`/`redo()` proxy straight through to the adapter.
		result.current.undo();
		result.current.redo();
		expect(undoControls.undo).toHaveBeenCalledTimes(1);
		expect(undoControls.redo).toHaveBeenCalledTimes(1);
	});
});

describe("<CollabUndoRedoControls />", () => {
	it("disables both buttons when the adapter has no undo support", () => {
		const { adapter } = createFakeAdapter();
		renderControls(adapter);
		expect(screen.getByTestId("collab-undo")).toBeDisabled();
		expect(screen.getByTestId("collab-redo")).toBeDisabled();
	});

	it("localizes the button labels from the collabUi catalog", () => {
		const { adapter } = createUndoAdapter();
		renderControls(adapter);
		expect(screen.getByTestId("collab-undo")).toHaveAttribute(
			"aria-label",
			"Undo",
		);
		expect(screen.getByTestId("collab-redo")).toHaveAttribute(
			"aria-label",
			"Redo",
		);
	});

	it("drives disabled-state from canUndo/canRedo and invokes the adapter on click", () => {
		const { adapter, undoControls } = createUndoAdapter();
		renderControls(adapter);
		const undoBtn = screen.getByTestId("collab-undo");
		const redoBtn = screen.getByTestId("collab-redo");

		// Nothing to undo/redo yet → both disabled from the getters.
		expect(undoBtn).toBeDisabled();
		expect(redoBtn).toBeDisabled();

		// Enable undo via the adapter getter + stack-change notification.
		act(() => undoControls.setCanUndo(true));
		expect(undoBtn).not.toBeDisabled();
		expect(redoBtn).toBeDisabled();

		fireEvent.click(undoBtn);
		expect(undoControls.undo).toHaveBeenCalledTimes(1);
		expect(undoControls.redo).not.toHaveBeenCalled();

		// Enable redo too, then click it.
		act(() => undoControls.setCanRedo(true));
		expect(redoBtn).not.toBeDisabled();
		fireEvent.click(redoBtn);
		expect(undoControls.redo).toHaveBeenCalledTimes(1);
	});
});
