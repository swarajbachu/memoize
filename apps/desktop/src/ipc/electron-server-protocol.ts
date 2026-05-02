import { RpcSerialization, RpcServer } from "@effect/rpc";
import type { FromClientEncoded } from "@effect/rpc/RpcMessage";
import { ipcMain, type WebContents } from "electron";
import { Effect, Exit, Layer, Mailbox, Stream } from "effect";

import { IPC_CHANNEL } from "@forkzero/wire";

/**
 * RpcServer.Protocol implementation for Electron IPC. Modeled on
 * `RpcServer.makeProtocolStdio` in `@effect/rpc`: read incoming frames from a
 * source, decode via the configured serialization, hand each decoded message
 * to `writeRequest`. For sending, encode + push out via webContents.
 *
 * v1 is single-window: the protocol owns one webContents and uses clientId 0.
 * Multi-window in a later phase becomes "register the protocol per webContents
 * with a stable clientId per window."
 */
const SINGLE_WINDOW_CLIENT_ID = 0;

export const makeElectronServerProtocol = (webContents: WebContents) =>
  RpcServer.Protocol.make(
    Effect.fnUntraced(function* (writeRequest) {
      const serialization = yield* RpcSerialization.RpcSerialization;
      const parser = serialization.unsafeMake();
      const disconnects = yield* Mailbox.make<number>();

      // ---- inbound: ipcMain → writeRequest --------------------------------
      // The renderer pushes encoded RPC frames on IPC_CHANNEL. We can't run
      // Effects from a synchronous ipc handler, so we shovel into a Mailbox
      // and consume that as a Stream.
      const inbound = yield* Mailbox.make<unknown>();
      const handler = (event: Electron.IpcMainEvent, frame: unknown) => {
        if (event.sender.id !== webContents.id) return;
        inbound.unsafeOffer(frame);
      };
      yield* Effect.acquireRelease(
        Effect.sync(() => ipcMain.on(IPC_CHANNEL, handler)),
        () => Effect.sync(() => ipcMain.off(IPC_CHANNEL, handler)),
      );

      yield* Mailbox.toStream(inbound).pipe(
        Stream.runForEach((frame) =>
          Effect.suspend(() => {
            const decoded = parser.decode(frame as Uint8Array | string);
            if (decoded.length === 0) return Effect.void;
            let i = 0;
            return Effect.whileLoop({
              while: () => i < decoded.length,
              body: () =>
                writeRequest(
                  SINGLE_WINDOW_CLIENT_ID,
                  decoded[i++] as FromClientEncoded,
                ),
              step: () => undefined,
            });
          }),
        ),
        Effect.forkScoped,
        Effect.interruptible,
      );

      // ---- disconnects: webContents destroyed -----------------------------
      const onDestroyed = () => {
        disconnects.unsafeOffer(SINGLE_WINDOW_CLIENT_ID);
        inbound.unsafeDone(Exit.void);
      };
      yield* Effect.acquireRelease(
        Effect.sync(() => webContents.once("destroyed", onDestroyed)),
        () =>
          Effect.sync(() => {
            if (!webContents.isDestroyed()) {
              webContents.off("destroyed", onDestroyed);
            }
          }),
      );

      return {
        disconnects,
        send: (_clientId, response) =>
          Effect.sync(() => {
            const encoded = parser.encode(response);
            if (encoded === undefined) return;
            if (webContents.isDestroyed()) return;
            webContents.send(IPC_CHANNEL, encoded);
          }),
        end: (_clientId) => Effect.void,
        clientIds: Effect.succeed(new Set([SINGLE_WINDOW_CLIENT_ID])),
        initialMessage: Effect.succeedNone,
        supportsAck: true,
        supportsTransferables: false,
        supportsSpanPropagation: false,
      };
    }),
  );

/**
 * Build a Layer providing `RpcServer.Protocol` bound to a specific webContents.
 * Compose with `RpcSerialization.layerJson` and the RpcServer + handlers.
 */
export const electronServerProtocolLayer = (webContents: WebContents) =>
  Layer.scoped(RpcServer.Protocol, makeElectronServerProtocol(webContents));
