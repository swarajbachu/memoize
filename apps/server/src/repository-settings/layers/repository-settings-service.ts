import { SqlClient } from "@effect/sql";
import { Effect, Layer } from "effect";

import {
  type FolderId,
  type ProviderId,
  RepositorySettings,
  type RuntimeMode,
} from "@memoize/wire";

import { RepositorySettingsService } from "../services/repository-settings-service.ts";

interface Row {
  readonly project_id: string;
  readonly default_provider_id: string | null;
  readonly default_model: string | null;
  readonly default_runtime_mode: string | null;
  readonly auto_create_worktree: number;
  readonly worktree_base_dir: string | null;
  readonly archive_cleanup_script: string | null;
  readonly archive_remove_worktree: number;
}

const isProviderId = (v: unknown): v is ProviderId =>
  v === "claude" || v === "codex";

const isRuntimeMode = (v: unknown): v is RuntimeMode =>
  v === "approval-required" ||
  v === "auto-accept-edits" ||
  v === "auto-accept-edits-and-bash" ||
  v === "full-access";

const rowToSettings = (
  projectId: FolderId,
  row: Row | null,
): RepositorySettings =>
  RepositorySettings.make({
    projectId,
    defaultProviderId: isProviderId(row?.default_provider_id)
      ? row!.default_provider_id
      : null,
    defaultModel: row?.default_model ?? null,
    defaultRuntimeMode: isRuntimeMode(row?.default_runtime_mode)
      ? row!.default_runtime_mode
      : null,
    autoCreateWorktree: (row?.auto_create_worktree ?? 0) === 1,
    worktreeBaseDir: row?.worktree_base_dir ?? null,
    archiveCleanupScript: row?.archive_cleanup_script ?? null,
    archiveRemoveWorktree: (row?.archive_remove_worktree ?? 0) === 1,
  });

export const RepositorySettingsServiceLive = Layer.effect(
  RepositorySettingsService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const columns = yield* sql<{ readonly name: string }>`
      PRAGMA table_info(repository_settings)
    `.pipe(Effect.orDie);
    const hasColumn = (name: string): boolean =>
      columns.some((column) => column.name === name);
    if (!hasColumn("archive_cleanup_script")) {
      yield* sql`
        ALTER TABLE repository_settings
          ADD COLUMN archive_cleanup_script TEXT
      `.pipe(Effect.orDie);
    }
    if (!hasColumn("archive_remove_worktree")) {
      yield* sql`
        ALTER TABLE repository_settings
          ADD COLUMN archive_remove_worktree INTEGER NOT NULL DEFAULT 0
      `.pipe(Effect.orDie);
    }

    const get: RepositorySettingsService["Type"]["get"] = (projectId) =>
      Effect.gen(function* () {
        const rows = yield* sql<Row>`
          SELECT project_id, default_provider_id, default_model,
                 default_runtime_mode, auto_create_worktree, worktree_base_dir,
                 archive_cleanup_script, archive_remove_worktree
          FROM repository_settings
          WHERE project_id = ${projectId}
          LIMIT 1
        `.pipe(Effect.orDie);
        return rowToSettings(projectId, rows[0] ?? null);
      });

    const update: RepositorySettingsService["Type"]["update"] = (
      projectId,
      patch,
    ) =>
      Effect.gen(function* () {
        const current = yield* get(projectId);
        const next = RepositorySettings.make({
          projectId,
          defaultProviderId:
            "defaultProviderId" in patch
              ? (patch.defaultProviderId ?? null)
              : current.defaultProviderId,
          defaultModel:
            "defaultModel" in patch
              ? (patch.defaultModel ?? null)
              : current.defaultModel,
          defaultRuntimeMode:
            "defaultRuntimeMode" in patch
              ? (patch.defaultRuntimeMode ?? null)
              : current.defaultRuntimeMode,
          autoCreateWorktree:
            patch.autoCreateWorktree ?? current.autoCreateWorktree,
          worktreeBaseDir:
            "worktreeBaseDir" in patch
              ? (patch.worktreeBaseDir ?? null)
              : current.worktreeBaseDir,
          archiveCleanupScript:
            "archiveCleanupScript" in patch
              ? patch.archiveCleanupScript?.trim()
                ? patch.archiveCleanupScript
                : null
              : current.archiveCleanupScript,
          archiveRemoveWorktree:
            patch.archiveRemoveWorktree ?? current.archiveRemoveWorktree,
        });

        yield* sql`
          INSERT INTO repository_settings
            (project_id, default_provider_id, default_model,
             default_runtime_mode, auto_create_worktree, worktree_base_dir,
             archive_cleanup_script, archive_remove_worktree)
          VALUES
            (${projectId}, ${next.defaultProviderId}, ${next.defaultModel},
             ${next.defaultRuntimeMode}, ${next.autoCreateWorktree ? 1 : 0},
             ${next.worktreeBaseDir}, ${next.archiveCleanupScript},
             ${next.archiveRemoveWorktree ? 1 : 0})
          ON CONFLICT(project_id) DO UPDATE SET
            default_provider_id = excluded.default_provider_id,
            default_model = excluded.default_model,
            default_runtime_mode = excluded.default_runtime_mode,
            auto_create_worktree = excluded.auto_create_worktree,
            worktree_base_dir = excluded.worktree_base_dir,
            archive_cleanup_script = excluded.archive_cleanup_script,
            archive_remove_worktree = excluded.archive_remove_worktree
        `.pipe(Effect.orDie);

        return next;
      });

    return { get, update } as const;
  }),
);
