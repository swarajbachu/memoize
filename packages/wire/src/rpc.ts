import { RpcGroup } from "@effect/rpc";

import {
  AgentAvailabilityRpc,
  AgentCloseRpc,
  AgentEventsRpc,
  AgentInterruptRpc,
  AgentOpencodeInventoryRpc,
  AgentSendRpc,
  AgentSetCredentialRpc,
  AgentStartLoginRpc,
  AgentStartRpc,
} from "./agent.ts";
import { AttachmentTouchRpc, AttachmentUploadRpc } from "./attachment.ts";
import {
  IndexFindReferencesRpc,
  IndexListModuleRpc,
  IndexReadChunkRpc,
  IndexReindexRpc,
  IndexSearchRpc,
  IndexStatusRpc,
  IndexStatusStreamRpc,
  IndexSymbolLookupRpc,
} from "./code-index.ts";
import { FsReadFileRpc, FsTreeRpc, FsWriteFileRpc } from "./fs.ts";
import {
  GitChangesRpc,
  GitCommitRpc,
  GitFixFailingChecksRpc,
  GitHeadChangedRpc,
  GitLogRpc,
  GitOriginRpc,
  GitPrDetailsRpc,
  GitPrStateRpc,
  GitPushRpc,
  GitStatusRpc,
} from "./git.ts";
import {
  PermissionDecideRpc,
  PermissionListDecisionsRpc,
  PermissionListPendingRpc,
  PermissionRequestsRpc,
  PermissionRevokeDecisionRpc,
} from "./permission.ts";
import { PingRpc } from "./ping.ts";
import {
  KeybindingsGetRpc,
  KeybindingsReplaceRpc,
  KeybindingsStreamRpc,
} from "./keybindings.ts";
import {
  RepositorySettingsGetRpc,
  RepositorySettingsUpdateRpc,
} from "./repository-settings.ts";
import {
  SettingsGetRpc,
  SettingsMigrateLocalStorageRpc,
  SettingsStreamRpc,
  SettingsUpdateRpc,
} from "./settings.ts";
import {
  PtyCloseRpc,
  PtyOpenRpc,
  PtyOutputRpc,
  PtyResizeRpc,
  PtyWriteRpc,
} from "./pty.ts";
import {
  ChatArchiveRpc,
  ChatCreateRpc,
  ChatDeleteRpc,
  ChatGetRpc,
  ChatListRpc,
  ChatRenameRpc,
  ChatSetActiveSessionRpc,
  ChatSetWorktreeRpc,
  ChatUnarchiveRpc,
  MessagesInterruptRpc,
  MessagesListRpc,
  MessagesSendRpc,
  MessagesStreamRpc,
  SessionAnswerQuestionRpc,
  SessionArchiveRpc,
  SessionCreateRpc,
  SessionDeleteRpc,
  SessionGetRpc,
  SessionListRpc,
  SessionRenameRpc,
  SessionResumeRpc,
  SessionSetModelRpc,
  SessionSetPermissionModeRpc,
  SessionSetProviderRpc,
  SessionSetRuntimeModeRpc,
  SessionSetWorktreeRpc,
  SessionStatusStreamRpc,
  SessionUnarchiveRpc,
} from "./session.ts";
import { SkillListRpc, SkillStreamRpc } from "./skill.ts";
import {
  WorkspaceAddRpc,
  WorkspaceCloneRepoRpc,
  WorkspaceCreateProjectRpc,
  WorkspaceGetSelectedRpc,
  WorkspaceGhAuthStatusRpc,
  WorkspaceListGithubReposRpc,
  WorkspaceListRpc,
  WorkspacePickFolderRpc,
  WorkspaceRemoveRpc,
  WorkspaceSearchFilesRpc,
  WorkspaceSetSelectedRpc,
} from "./workspace.ts";
import {
  WorktreeCreateRpc,
  WorktreeGetRpc,
  WorktreeListRpc,
  WorktreeRemoveRpc,
} from "./worktree.ts";

/**
 * The single source of truth for every RPC method exposed by the main process.
 * Both server (apps/desktop) and client (apps/renderer) build against this.
 *
 * Add new RPCs by importing them here and including them in the group.
 */
export const MemoizeRpcs = RpcGroup.make(
  PingRpc,
  WorkspaceAddRpc,
  WorkspaceListRpc,
  WorkspaceRemoveRpc,
  WorkspacePickFolderRpc,
  WorkspaceGetSelectedRpc,
  WorkspaceSetSelectedRpc,
  WorkspaceSearchFilesRpc,
  WorkspaceCloneRepoRpc,
  WorkspaceCreateProjectRpc,
  WorkspaceListGithubReposRpc,
  WorkspaceGhAuthStatusRpc,
  PtyOpenRpc,
  PtyWriteRpc,
  PtyResizeRpc,
  PtyCloseRpc,
  PtyOutputRpc,
  GitLogRpc,
  GitStatusRpc,
  GitHeadChangedRpc,
  GitOriginRpc,
  GitPrStateRpc,
  GitPrDetailsRpc,
  GitChangesRpc,
  GitCommitRpc,
  GitPushRpc,
  GitFixFailingChecksRpc,
  FsTreeRpc,
  FsReadFileRpc,
  FsWriteFileRpc,
  AgentAvailabilityRpc,
  AgentSetCredentialRpc,
  AgentStartRpc,
  AgentSendRpc,
  AgentInterruptRpc,
  AgentCloseRpc,
  AgentEventsRpc,
  AgentOpencodeInventoryRpc,
  AgentStartLoginRpc,
  ChatListRpc,
  ChatGetRpc,
  ChatCreateRpc,
  ChatRenameRpc,
  ChatSetWorktreeRpc,
  ChatSetActiveSessionRpc,
  ChatArchiveRpc,
  ChatUnarchiveRpc,
  ChatDeleteRpc,
  SessionListRpc,
  SessionGetRpc,
  SessionCreateRpc,
  SessionRenameRpc,
  SessionSetModelRpc,
  SessionSetProviderRpc,
  SessionArchiveRpc,
  SessionUnarchiveRpc,
  SessionDeleteRpc,
  SessionResumeRpc,
  SessionSetRuntimeModeRpc,
  SessionSetPermissionModeRpc,
  SessionAnswerQuestionRpc,
  SessionSetWorktreeRpc,
  SessionStatusStreamRpc,
  MessagesListRpc,
  MessagesStreamRpc,
  MessagesSendRpc,
  MessagesInterruptRpc,
  AttachmentUploadRpc,
  AttachmentTouchRpc,
  SkillListRpc,
  SkillStreamRpc,
  PermissionRequestsRpc,
  PermissionDecideRpc,
  PermissionListPendingRpc,
  PermissionListDecisionsRpc,
  PermissionRevokeDecisionRpc,
  WorktreeCreateRpc,
  WorktreeListRpc,
  WorktreeGetRpc,
  WorktreeRemoveRpc,
  RepositorySettingsGetRpc,
  RepositorySettingsUpdateRpc,
  SettingsGetRpc,
  SettingsUpdateRpc,
  SettingsStreamRpc,
  SettingsMigrateLocalStorageRpc,
  KeybindingsGetRpc,
  KeybindingsReplaceRpc,
  KeybindingsStreamRpc,
  SessionSetWorktreeRpc,
  IndexStatusRpc,
  IndexStatusStreamRpc,
  IndexReindexRpc,
  IndexSearchRpc,
  IndexSymbolLookupRpc,
  IndexFindReferencesRpc,
  IndexReadChunkRpc,
  IndexListModuleRpc,
);
export type MemoizeRpcs = typeof MemoizeRpcs;

/**
 * The Electron IPC channel name used to transport RPC frames in both
 * directions. The frame body is the bytes/string emitted by the configured
 * `RpcSerialization` (we use NDJSON in v1 — see `apps/desktop/src/runtime.ts`).
 *
 * Renderer → main: `ipcRenderer.send(IPC_CHANNEL, frame)`
 * Main → renderer: `webContents.send(IPC_CHANNEL, frame)`
 */
export const IPC_CHANNEL = "memoize:rpc" as const;
