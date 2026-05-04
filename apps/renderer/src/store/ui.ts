import { create } from "zustand";

/**
 * Top-level renderer view. The settings page replaces the chat surface in the
 * main pane so users have a real settings page rather than a slide-in drawer.
 */
export type View = "chat" | "settings";

type UiState = {
  readonly view: View;
  readonly setView: (view: View) => void;
};

export const useUiStore = create<UiState>((set) => ({
  view: "chat",
  setView: (view) => set({ view }),
}));
