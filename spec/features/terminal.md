# Feature: Terminal

xterm.js renders, node-pty backs it. One terminal per folder in Phase 1; multiple in Phase 4.

## Lifecycle

1. Renderer requests `pty:open` with cols/rows/folderId
2. Main spawns `node-pty` with `process.env.SHELL ?? '/bin/bash'`, cwd = folder.path
3. Main returns `ptyId`; renderer subscribes to `pty:output`
4. On unmount or folder switch, renderer calls `pty:close`; main sends SIGHUP, waits 1s, then SIGKILL

## Resize

Debounced 100ms. Renderer sends `pty:resize` after layout settles.

## Encoding

UTF-8 throughout. Output chunks are passed verbatim — xterm handles ANSI.

## Scrollback

In-memory only in Phase 1. xterm's internal scrollback (default 1000 lines) is the truth. Phase 3 adds optional disk persistence.

## Activity signaling (Phase 2+)

Main maintains a "last output at" timestamp per PTY. Used by sidebar to show a dot when a non-active terminal has output.
