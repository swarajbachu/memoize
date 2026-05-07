import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { ProviderId } from "./agent.ts";
import { SessionId, SessionNotFoundError } from "./session.ts";

/**
 * One skill discovered by a provider driver. Forkzero owns no skill format;
 * the driver normalises the underlying agent's parsed metadata into this
 * shape so the renderer is provider-agnostic.
 */
export class Skill extends Schema.Class<Skill>("Skill")({
  name: Schema.String,
  scope: Schema.Literal("global", "project"),
  description: Schema.String,
  arguments: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.String,
      optional: Schema.Boolean,
    }),
  ),
  filePath: Schema.NullOr(Schema.String),
  providerId: ProviderId,
}) {}

/**
 * One-shot fetch of the active session's skill list (initial hydrate). For
 * live updates use `skill.stream`.
 */
export const SkillListRpc = Rpc.make("skill.list", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Schema.Array(Skill),
  error: SessionNotFoundError,
});

/**
 * Live skill list for a session — emits the full new list on every provider
 * change notification. Same pattern as `messages.stream`.
 */
export const SkillStreamRpc = Rpc.make("skill.stream", {
  payload: Schema.Struct({ sessionId: SessionId }),
  success: Schema.Array(Skill),
  error: SessionNotFoundError,
  stream: true,
});
