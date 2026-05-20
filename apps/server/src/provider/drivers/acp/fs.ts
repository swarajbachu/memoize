import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Minimal ACP FS client implementation.
 *
 * The Grok (and Gemini/Cursor) agent advertises and then calls fs/* methods
 * to read/write the workspace instead of (or in addition to) shelling out.
 * Until we implement them we NACK every call → the agent gets tool errors
 * and falls back to "Other" + repeated List Dir (exactly what you saw).
 *
 * This module provides a dispatcher + safe implementations for the common
 * methods the agent actually uses (read_text_file, read_directory, etc.).
 *
 * Security: all paths are forced under the session cwd.
 */

export interface FsHandleContext {
  readonly cwd: string;
  // Later: permissionMode, PermissionService, etc.
}

const isUnderCwd = (requested: string, cwd: string): boolean => {
  const abs = path.resolve(requested);
  const root = path.resolve(cwd);
  return abs === root || abs.startsWith(root + path.sep);
};

const ensureUnderCwd = (p: string, cwd: string): string => {
  const abs = path.resolve(p);
  if (!isUnderCwd(abs, cwd)) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return abs;
};

const toBase64 = (buf: Buffer): string => buf.toString("base64");

async function handleReadTextFile(params: unknown, cwd: string): Promise<unknown> {
  const p = (params as any)?.path;
  if (typeof p !== "string") throw new Error("fs/read_text_file: missing path");

  const abs = ensureUnderCwd(p, cwd);
  const data = await fs.readFile(abs, "utf8");

  // The Grok agent has been observed to fail deserializing { dataBase64 }.
  // Return the content in multiple common shapes so at least one works.
  return {
    content: data,
    text: data,
    data: data,
    dataBase64: toBase64(Buffer.from(data)),
  };
}

async function handleReadFile(params: unknown, cwd: string): Promise<unknown> {
  // Some agents use fs/readFile instead of read_text_file
  return handleReadTextFile(params, cwd);
}

async function handleReadDirectory(params: unknown, cwd: string): Promise<unknown> {
  const p = (params as any)?.path;
  if (typeof p !== "string") throw new Error("fs/read_directory: missing path");

  const abs = ensureUnderCwd(p, cwd);
  const entries = await fs.readdir(abs, { withFileTypes: true });

  // Return in shapes that various ACP clients have been seen to accept
  const list = entries.map((ent) => ({
    name: ent.name,
    isDirectory: ent.isDirectory(),
    isFile: ent.isFile(),
    isSymlink: ent.isSymbolicLink(),
  }));

  return {
    entries: list,
    children: list, // some agents look for this
  };
}

async function handleWriteFile(params: unknown, cwd: string): Promise<unknown> {
  const p = (params as any)?.path;
  const dataBase64 = (params as any)?.dataBase64 ?? (params as any)?.content;
  if (typeof p !== "string") throw new Error("fs/write_file: missing path");

  const abs = ensureUnderCwd(p, cwd);

  let buf: Buffer;
  if (typeof dataBase64 === "string") {
    buf = Buffer.from(dataBase64, "base64");
  } else if (typeof dataBase64 === "string") {
    buf = Buffer.from(dataBase64, "utf8");
  } else {
    throw new Error("fs/write_file: missing data");
  }

  await fs.writeFile(abs, buf);
  return {};
}

export async function handleFsRequest(
  method: string,
  params: unknown,
  ctx: FsHandleContext,
): Promise<unknown> {
  const { cwd } = ctx;

  try {
    switch (method) {
      case "fs/read_text_file":
      case "fs/readFile":
      case "fs/read_file":
        return await handleReadTextFile(params, cwd);

      case "fs/read_directory":
      case "fs/readDirectory":
      case "fs/list_directory":
      case "fs/read_dir":
        return await handleReadDirectory(params, cwd);

      case "fs/write_file":
      case "fs/writeFile":
        return await handleWriteFile(params, cwd);

      // Future: fs/remove, fs/mkdir, fs/move, fs/copy, etc.

      default:
        throw new Error(`Method not implemented by memoize ACP client: ${method}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message);
  }
}
