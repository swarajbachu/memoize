import { Schema } from "effect";

import { ProviderId } from "./agent.ts";

/**
 * Reference to an uploaded attachment. The renderer carries this on
 * `ComposerInput` and on persisted user-rich messages; the actual bytes live
 * under the desktop app's userData directory and are served to the renderer
 * via the `memoize://attachments/<id>` custom protocol.
 *
 * `id` shape: `<sessionSegment>-<uuid>` (sanitised session id + v4 UUID).
 */
export const AttachmentRef = Schema.Struct({
  id: Schema.String,
  mimeType: Schema.String,
  originalName: Schema.String,
});
export type AttachmentRef = typeof AttachmentRef.Type;

/**
 * Reference to a file or directory the user tagged into the composer via the
 * `@` popover. Paths are workspace-rooted; the server expands the contents at
 * send time so the provider sees the files inline.
 */
export const FileRef = Schema.Struct({
  relPath: Schema.String,
  absPath: Schema.String,
  kind: Schema.Literal("file", "directory"),
});
export type FileRef = typeof FileRef.Type;

/**
 * Reference to a provider-defined skill the user invoked from the slash
 * popover. Memoize never inlines the skill body; the driver expands it
 * provider-side so semantics match the underlying CLI.
 */
export const SkillRef = Schema.Struct({
  name: Schema.String,
  scope: Schema.Literal("global", "project"),
  args: Schema.String,
  providerId: ProviderId,
});
export type SkillRef = typeof SkillRef.Type;

/**
 * A region of code the user pinned with a comment. Created by selecting one or
 * more lines in the file editor / diff view and typing a note; annotations
 * stack into a tray above the composer and travel with the submission. Unlike
 * `FileRef`, no code snippet crosses the wire — `relPath` + the line range
 * already pinpoints the region and the agent reads the file itself. The server
 * serialises these into a numbered list appended to the prompt text.
 */
export const CodeAnnotation = Schema.Struct({
  /** Client-generated v4 UUID — list keys + removal. */
  id: Schema.String,
  /**
   * Workspace-rooted path, for display + the model (the agent's cwd is the
   * workspace root, so a relative path resolves). For files outside any
   * project folder this holds the absolute path instead.
   */
  relPath: Schema.String,
  /** Absolute path used by renderer affordances that can reopen the target. */
  absPath: Schema.String,
  /** 1-based, inclusive. `startLine === endLine` for a single line. */
  startLine: Schema.Number,
  endLine: Schema.Number,
  comment: Schema.String,
});
export type CodeAnnotation = typeof CodeAnnotation.Type;

/**
 * A pinned element or text region inside an embedded HTML artifact (a plan or a
 * fenced `html` block rendered inline in chat). The rendered-HTML analogue of
 * `CodeAnnotation`: the user clicks an element or selects text in the preview
 * and pins a comment; it stacks in the same tray and serialises into the same
 * prompt. No HTML crosses the wire — `selector` + `label` pinpoint the element
 * inside the document the agent itself produced, so it can map the comment back.
 */
export const ElementAnnotation = Schema.Struct({
  _tag: Schema.Literal("element"),
  /** Client-generated v4 UUID — list keys + removal. */
  id: Schema.String,
  /** Id of the source message / plan whose rendered artifact this targets. */
  sourceRef: Schema.String,
  /** Best-effort unique CSS selector within the artifact root. */
  selector: Schema.String,
  /** Human label: tag + trimmed text, e.g. `button "Get started"`. */
  label: Schema.String,
  /** Present when the user annotated a text selection rather than an element. */
  text: Schema.optional(Schema.String),
  comment: Schema.String,
});
export type ElementAnnotation = typeof ElementAnnotation.Type;

/**
 * Either kind of pinned annotation. Decode tries `ElementAnnotation` first (it
 * requires `_tag: "element"`); anything without that tag falls back to the
 * untagged `CodeAnnotation`, so annotations persisted before HTML artifacts
 * existed still decode.
 */
export const Annotation = Schema.Union(ElementAnnotation, CodeAnnotation);
export type Annotation = typeof Annotation.Type;

/**
 * An annotation before the store mints its `id`. Spelled as an explicit
 * (distributive) union because `Omit<Annotation, "id">` over a union collapses
 * to only the shared keys, dropping each variant's distinct fields.
 */
export type NewAnnotation =
  | Omit<CodeAnnotation, "id">
  | Omit<ElementAnnotation, "id">;

/** Narrow an `Annotation` to the HTML-artifact element/text variant. */
export const isElementAnnotation = (a: Annotation): a is ElementAnnotation =>
  "_tag" in a;

/** Narrow an `Annotation` to the code-region variant. */
export const isCodeAnnotation = (a: Annotation): a is CodeAnnotation =>
  !("_tag" in a);

/**
 * The full payload of a single composer submission. `text` is the editor
 * document with `@` / `/` tokens preserved as plain text; the typed arrays
 * give the server enough metadata to expand each segment without re-parsing.
 */
export class ComposerInput extends Schema.Class<ComposerInput>("ComposerInput")(
  {
    text: Schema.String,
    attachments: Schema.Array(AttachmentRef),
    fileRefs: Schema.Array(FileRef),
    skillRefs: Schema.Array(SkillRef),
    annotations: Schema.optionalWith(Schema.Array(Annotation), {
      default: () => [],
    }),
  },
) {}
