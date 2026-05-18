import { Data } from "effect";

export class IndexDbError extends Data.TaggedError("IndexDbError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class IndexIoError extends Data.TaggedError("IndexIoError")<{
  readonly path: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class IndexParseError extends Data.TaggedError("IndexParseError")<{
  readonly path: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class IndexUnsupportedLanguageError extends Data.TaggedError(
  "IndexUnsupportedLanguageError",
)<{ readonly path: string }> {}

export type IndexError =
  | IndexDbError
  | IndexIoError
  | IndexParseError
  | IndexUnsupportedLanguageError;
