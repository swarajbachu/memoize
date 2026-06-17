import { MemoizeRpcs } from "@memoize/wire";
import { Effect, Layer, Stream } from "effect";

import { GitService } from "./services/git-service.ts";

const Log = MemoizeRpcs.toLayerHandler("git.log", ({ folderId, limit }) =>
  Effect.flatMap(GitService, (svc) => svc.log(folderId, limit)),
);

const Status = MemoizeRpcs.toLayerHandler(
  "git.status",
  ({ folderId, worktreeId }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.status(folderId, worktreeId ?? null),
    ),
);

const Branches = MemoizeRpcs.toLayerHandler(
  "git.branches",
  ({ folderId, worktreeId }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.branches(folderId, worktreeId ?? null),
    ),
);

const SwitchBranch = MemoizeRpcs.toLayerHandler(
  "git.switchBranch",
  ({ folderId, worktreeId, branch, remote }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.switchBranch(folderId, branch, remote ?? null, worktreeId ?? null),
    ),
);

const RenameBranch = MemoizeRpcs.toLayerHandler(
  "git.renameBranch",
  ({ folderId, worktreeId, name }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.renameBranch(folderId, name, worktreeId ?? null),
    ),
);

const HeadChanged = MemoizeRpcs.toLayerHandler(
  "git.headChanged",
  ({ folderId }) =>
    Stream.unwrap(
      Effect.map(GitService, (svc) => svc.subscribeHeadChanges(folderId)),
    ),
);

const Origin = MemoizeRpcs.toLayerHandler("git.origin", ({ folderId }) =>
  Effect.flatMap(GitService, (svc) => svc.origin(folderId)),
);

const PrState = MemoizeRpcs.toLayerHandler(
  "git.prState",
  ({ folderId, worktreeId }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.prState(folderId, worktreeId ?? null),
    ),
);

const PrDetails = MemoizeRpcs.toLayerHandler(
  "git.prDetails",
  ({ folderId, worktreeId }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.prDetails(folderId, worktreeId ?? null),
    ),
);

const Changes = MemoizeRpcs.toLayerHandler(
  "git.changes",
  ({ folderId, worktreeId }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.changes(folderId, worktreeId ?? null),
    ),
);

const Diff = MemoizeRpcs.toLayerHandler(
  "git.diff",
  ({ folderId, worktreeId, path }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.diff(folderId, path, worktreeId ?? null),
    ),
);

const Commit = MemoizeRpcs.toLayerHandler(
  "git.commit",
  ({ folderId, worktreeId, message }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.commit(folderId, message, worktreeId ?? null),
    ),
);

const Push = MemoizeRpcs.toLayerHandler(
  "git.push",
  ({ folderId, worktreeId }) =>
    Effect.flatMap(GitService, (svc) => svc.push(folderId, worktreeId ?? null)),
);

const MergePr = MemoizeRpcs.toLayerHandler(
  "git.mergePr",
  ({ folderId, worktreeId, action, method, deleteBranch }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.mergePr(folderId, action, method, deleteBranch, worktreeId ?? null),
    ),
);

const MarkReady = MemoizeRpcs.toLayerHandler(
  "git.markReady",
  ({ folderId, worktreeId }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.markReady(folderId, worktreeId ?? null),
    ),
);

const Init = MemoizeRpcs.toLayerHandler("git.init", ({ folderId }) =>
  Effect.flatMap(GitService, (svc) => svc.init(folderId)),
);

const FixFailingChecks = MemoizeRpcs.toLayerHandler(
  "git.fixFailingChecks",
  ({ folderId, worktreeId }) =>
    Effect.flatMap(GitService, (svc) =>
      svc.fixFailingChecks(folderId, worktreeId ?? null),
    ),
);

export const GitHandlersLayer = Layer.mergeAll(
  Log,
  Status,
  Branches,
  SwitchBranch,
  RenameBranch,
  HeadChanged,
  Origin,
  PrState,
  PrDetails,
  Changes,
  Diff,
  Commit,
  Push,
  MergePr,
  MarkReady,
  Init,
  FixFailingChecks,
);
