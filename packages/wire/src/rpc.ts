import { RpcGroup } from "@effect/rpc";

import {
  AgentAvailabilityRpc,
  AgentCloseRpc,
  AgentEventsRpc,
  AgentInterruptRpc,
  AgentSendRpc,
  AgentSetCredentialRpc,
  AgentStartRpc,
} from "./agent.ts";
import { FsTreeRpc } from "./fs.ts";
import {
  GitHeadChangedRpc,
  GitLogRpc,
  GitOriginRpc,
  GitStatusRpc,
} from "./git.ts";
import { PingRpc } from "./ping.ts";
import {
  PtyCloseRpc,
  PtyOpenRpc,
  PtyOutputRpc,
  PtyResizeRpc,
  PtyWriteRpc,
} from "./pty.ts";
import {
  MessagesInterruptRpc,
  MessagesListRpc,
  MessagesSendRpc,
  MessagesStreamRpc,
  SessionArchiveRpc,
  SessionCreateRpc,
  SessionDeleteRpc,
  SessionGetRpc,
  SessionListRpc,
  SessionRenameRpc,
  SessionUnarchiveRpc,
} from "./session.ts";
import {
  WorkspaceAddRpc,
  WorkspaceGetSelectedRpc,
  WorkspaceListRpc,
  WorkspacePickFolderRpc,
  WorkspaceRemoveRpc,
  WorkspaceSetSelectedRpc,
} from "./workspace.ts";

/**
 * The single source of truth for every RPC method exposed by the main process.
 * Both server (apps/desktop) and client (apps/renderer) build against this.
 *
 * Add new RPCs by importing them here and including them in the group.
 */
export const ForkzeroRpcs = RpcGroup.make(
  PingRpc,
  WorkspaceAddRpc,
  WorkspaceListRpc,
  WorkspaceRemoveRpc,
  WorkspacePickFolderRpc,
  WorkspaceGetSelectedRpc,
  WorkspaceSetSelectedRpc,
  PtyOpenRpc,
  PtyWriteRpc,
  PtyResizeRpc,
  PtyCloseRpc,
  PtyOutputRpc,
  GitLogRpc,
  GitStatusRpc,
  GitHeadChangedRpc,
  GitOriginRpc,
  FsTreeRpc,
  AgentAvailabilityRpc,
  AgentSetCredentialRpc,
  AgentStartRpc,
  AgentSendRpc,
  AgentInterruptRpc,
  AgentCloseRpc,
  AgentEventsRpc,
  SessionListRpc,
  SessionGetRpc,
  SessionCreateRpc,
  SessionRenameRpc,
  SessionArchiveRpc,
  SessionUnarchiveRpc,
  SessionDeleteRpc,
  MessagesListRpc,
  MessagesStreamRpc,
  MessagesSendRpc,
  MessagesInterruptRpc,
);
export type ForkzeroRpcs = typeof ForkzeroRpcs;

/**
 * The Electron IPC channel name used to transport RPC frames in both
 * directions. The frame body is the bytes/string emitted by the configured
 * `RpcSerialization` (we use NDJSON in v1 — see `apps/desktop/src/runtime.ts`).
 *
 * Renderer → main: `ipcRenderer.send(IPC_CHANNEL, frame)`
 * Main → renderer: `webContents.send(IPC_CHANNEL, frame)`
 */
export const IPC_CHANNEL = "forkzero:rpc" as const;
