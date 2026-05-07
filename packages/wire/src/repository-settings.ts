import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { ProviderId, RuntimeMode } from "./agent.ts";
import { FolderId } from "./ids.ts";

/**
 * Per-repository overrides on top of the global Settings. A `null` field
 * means "fall through to global default"; the renderer is responsible for
 * collapsing this layer at read-time. Persisted in the `repository_settings`
 * table keyed by `projectId`.
 */
export class RepositorySettings extends Schema.Class<RepositorySettings>(
  "RepositorySettings",
)({
  projectId: FolderId,
  defaultProviderId: Schema.NullOr(ProviderId),
  defaultModel: Schema.NullOr(Schema.String),
  defaultRuntimeMode: Schema.NullOr(RuntimeMode),
  /**
   * If true, every new chat created in this repo pre-creates a worktree at
   * session start. The composer's workspace picker still appears (so the
   * user can flip back to "Current checkout" before the first message).
   */
  autoCreateWorktree: Schema.Boolean,
  /**
   * Optional override for the worktree base dir. `null` means
   * `<repoPath>/.forkzero/repo-worktree/`.
   */
  worktreeBaseDir: Schema.NullOr(Schema.String),
}) {}

/**
 * Patch shape for `repository.settings.update`. Every field is optional;
 * absent means "leave unchanged". Use `null` explicitly to clear an
 * override back to the global default.
 */
export const RepositorySettingsPatch = Schema.Struct({
  defaultProviderId: Schema.optional(Schema.NullOr(ProviderId)),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
  defaultRuntimeMode: Schema.optional(Schema.NullOr(RuntimeMode)),
  autoCreateWorktree: Schema.optional(Schema.Boolean),
  worktreeBaseDir: Schema.optional(Schema.NullOr(Schema.String)),
});
export type RepositorySettingsPatch = typeof RepositorySettingsPatch.Type;

export const RepositorySettingsGetRpc = Rpc.make("repositorySettings.get", {
  payload: Schema.Struct({ projectId: FolderId }),
  success: RepositorySettings,
});

export const RepositorySettingsUpdateRpc = Rpc.make(
  "repositorySettings.update",
  {
    payload: Schema.Struct({
      projectId: FolderId,
      patch: RepositorySettingsPatch,
    }),
    success: RepositorySettings,
  },
);
