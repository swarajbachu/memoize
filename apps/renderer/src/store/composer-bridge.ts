import { create } from "zustand";

export type AttachableFile = {
  readonly relPath: string;
  readonly absPath: string;
  readonly kind: "file" | "directory";
};

type AttachFile = (ref: AttachableFile) => void;
type InsertText = (text: string) => void;

type Bridge = {
  readonly attachFile: AttachFile | null;
  readonly insertText: InsertText | null;
  readonly setAttachFile: (fn: AttachFile | null) => void;
  readonly setInsertText: (fn: InsertText | null) => void;
};

export const useComposerBridge = create<Bridge>((set) => ({
  attachFile: null,
  insertText: null,
  setAttachFile: (fn) => set({ attachFile: fn }),
  setInsertText: (fn) => set({ insertText: fn }),
}));
