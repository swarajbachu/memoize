import type { EditorState } from "@codemirror/state";

import {
  ComposerInput,
  type AttachmentRef,
  type FileRef,
  type ProviderId,
  type SkillRef,
} from "@forkzero/wire";

import { allChips } from "../lib/codemirror/composer-chips.ts";

/**
 * Walk the editor state and assemble a wire-shaped `ComposerInput`. The
 * returned `text` is the document as-is — chips are kept inline as their
 * canonical tokens (`@<relPath>`, `/<skill>`, `[image:<id>]`) so providers
 * that don't read the typed arrays still see something sensible. Drivers
 * that *do* read the arrays expand them server-side.
 */
export const parseComposerInput = (
  state: EditorState,
  providerId: ProviderId,
): ComposerInput => {
  const text = state.doc.toString();
  const chips = allChips(state);

  const fileRefs: FileRef[] = [];
  const skillRefs: SkillRef[] = [];
  const attachments: AttachmentRef[] = [];

  for (const c of chips) {
    switch (c.meta.kind) {
      case "file":
        fileRefs.push({
          relPath: c.meta.relPath,
          absPath: c.meta.absPath,
          kind: c.meta.entryKind,
        });
        break;
      case "skill": {
        const tail = afterChip(state, c.to).trimStart();
        const args = tail.split("\n", 1)[0] ?? "";
        skillRefs.push({
          name: c.meta.name,
          scope: c.meta.scope,
          args,
          providerId,
        });
        break;
      }
      case "image":
        attachments.push({
          id: c.meta.id,
          mimeType: c.meta.mimeType,
          originalName: c.meta.originalName,
        });
        break;
    }
  }

  return ComposerInput.make({
    text,
    attachments,
    fileRefs,
    skillRefs,
  });
};

const afterChip = (state: EditorState, pos: number): string => {
  const slice = state.doc.sliceString(pos, Math.min(state.doc.length, pos + 256));
  return slice;
};
