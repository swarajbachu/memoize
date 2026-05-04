import { randomUUID } from "node:crypto";

import { FileSystem, Path } from "@effect/platform";
import { SqlClient } from "@effect/sql";
import { Duration, Effect, Fiber, Layer, Ref, Schedule } from "effect";

import {
  AttachmentBadMimeError,
  AttachmentTooLargeError,
  type SessionId,
} from "@forkzero/wire";

import { AppPaths } from "../../app-paths.ts";
import { extForMime, isImageMime } from "../image-mime.ts";
import {
  AttachmentService,
  type AttachmentServiceShape,
} from "../services/attachment-service.ts";

/**
 * Per-image cap, validated client-side and re-validated here. Matches the
 * spec — see `specs/0.03-MVP/features/composer.md` "Image attachments".
 */
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;

/** GC keeps a blob if it was last touched within this window. */
const HEARTBEAT_TTL_MS = 90_000;

/** Minimum age before a *referenced-by-nothing* blob is eligible for GC. */
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Sweep cadence: once on boot, then once a day. */
const GC_INTERVAL = Duration.hours(24);

const sessionSegment = (sessionId: string): string =>
  sessionId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 80);

const attachmentsDir = (userData: string, pathSvc: Path.Path): string =>
  pathSvc.join(userData, "attachments");

const blobFilename = (id: string, ext: string): string => `${id}.${ext}`;

export const AttachmentServiceLive = Layer.scoped(
  AttachmentService,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    const sql = yield* SqlClient.SqlClient;
    const { userData } = yield* AppPaths;

    const dir = attachmentsDir(userData, pathSvc);
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orDie);

    // In-memory heartbeat map. The renderer touches ids it cares about
    // every 30 s; blobs not seen recently become GC-eligible after the
    // 24 h floor. Initialised eagerly on upload so freshly written blobs
    // are not reaped before the first heartbeat fires.
    const lastTouched = yield* Ref.make<Map<string, number>>(new Map());

    const touchOne = (id: string): Effect.Effect<void> =>
      Ref.update(lastTouched, (m) => {
        const next = new Map(m);
        next.set(id, Date.now());
        return next;
      });

    const upload: AttachmentServiceShape["upload"] = (
      sessionId,
      bytes,
      mimeType,
      originalName,
    ) =>
      Effect.gen(function* () {
        if (!isImageMime(mimeType)) {
          return yield* Effect.fail(
            new AttachmentBadMimeError({ sessionId, mimeType }),
          );
        }
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          return yield* Effect.fail(
            new AttachmentTooLargeError({
              sessionId,
              sizeBytes: bytes.byteLength,
              limit: MAX_IMAGE_BYTES,
            }),
          );
        }

        // We do not validate `sessionId` against the sessions table here.
        // The session exists by the time the renderer can reach the
        // composer; bouncing on a missing row is overkill and would
        // require a second query per upload. The id only flavours the
        // on-disk filename for human-debuggability.

        const id = `${sessionSegment(sessionId)}-${randomUUID()}`;
        const ext = extForMime(mimeType);
        const filename = blobFilename(id, ext);
        const absPath = pathSvc.join(dir, filename);

        yield* fs.writeFile(absPath, bytes).pipe(Effect.orDie);

        const now = new Date().toISOString();
        yield* sql`
          INSERT INTO attachments (
            id, session_id, mime_type, size_bytes, original_name, created_at
          )
          VALUES (
            ${id}, ${sessionId as string}, ${mimeType}, ${bytes.byteLength},
            ${originalName}, ${now}
          )
        `.pipe(Effect.orDie);

        yield* touchOne(id);

        return {
          id,
          sizeBytes: bytes.byteLength,
          mimeType,
          ext,
        };
      });

    const touch: AttachmentServiceShape["touch"] = (ids) =>
      Ref.update(lastTouched, (m) => {
        const next = new Map(m);
        const now = Date.now();
        for (const id of ids) next.set(id, now);
        return next;
      });

    /**
     * Sweep: drop rows + blob files for attachments that
     *   - are not referenced by any message_attachments row, and
     *   - were created at least MIN_AGE_MS ago, and
     *   - haven't been heartbeat in HEARTBEAT_TTL_MS.
     * The triple-guard keeps drafts and queued chips alive across the
     * "user typed it but hasn't sent yet" window.
     */
    const sweep = Effect.gen(function* () {
      const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString();
      const heartbeats = yield* Ref.get(lastTouched);
      const stale = (id: string): boolean => {
        const seen = heartbeats.get(id);
        return seen === undefined || Date.now() - seen > HEARTBEAT_TTL_MS;
      };

      interface Candidate {
        readonly id: string;
        readonly mime_type: string;
      }
      const candidates = yield* sql<Candidate>`
        SELECT a.id, a.mime_type
        FROM attachments a
        LEFT JOIN message_attachments ma ON ma.attachment_id = a.id
        WHERE ma.attachment_id IS NULL
          AND a.created_at < ${cutoff}
      `.pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<Candidate>));

      for (const { id, mime_type } of candidates) {
        if (!stale(id)) continue;
        const absPath = pathSvc.join(dir, blobFilename(id, extForMime(mime_type)));
        yield* fs
          .remove(absPath, { force: true })
          .pipe(Effect.ignoreLogged);
        yield* sql`DELETE FROM attachments WHERE id = ${id}`.pipe(
          Effect.ignoreLogged,
        );
        yield* Ref.update(lastTouched, (m) => {
          const next = new Map(m);
          next.delete(id);
          return next;
        });
      }
    });

    // Run once on boot and then every 24 h. The sweep is best-effort —
    // any failure is logged and we keep the service alive.
    const gcFiber = yield* Effect.forkScoped(
      sweep.pipe(
        Effect.ignoreLogged,
        Effect.repeat(Schedule.spaced(GC_INTERVAL)),
      ),
    );
    yield* Effect.addFinalizer(() => Fiber.interrupt(gcFiber));

    return { upload, touch } satisfies AttachmentServiceShape;
  }),
);
