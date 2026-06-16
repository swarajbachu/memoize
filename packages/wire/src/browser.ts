import { Rpc } from "@effect/rpc";
import { Schema } from "effect";

import { SessionId } from "./session.ts";

/**
 * In-app agent browser bridge.
 *
 * MCP tools run in the server process; the `<webview>` lives in the renderer.
 * So every agent browser action round-trips server → renderer → server,
 * mirroring `permission.ts`: the server broadcasts a `BrowserCommandRequest`
 * on `browser.commands`, the renderer drives the webview, and posts the
 * outcome back via `browser.respond`, which resolves a server-side Deferred.
 *
 * The command union is intentionally small for Phase 1 (navigate + screenshot);
 * interaction commands (snapshot/click/type/wait) and login land in later
 * phases as new members — a wire change, never a stringly-typed addition.
 */
export const BrowserCommand = Schema.Union(
  /** Load a URL into the shared in-app webview and wait for it to settle. */
  Schema.TaggedStruct("Navigate", { url: Schema.String }),
  /** Capture the visible viewport. The renderer returns a base64 PNG. */
  Schema.TaggedStruct("Screenshot", {}),
  /**
   * Walk the page and return a compact list of interactive/visible elements,
   * each tagged with a stable `ref` the agent then targets with Click/Type.
   * Cheaper for the model than a screenshot and robust to scroll/DPI.
   */
  Schema.TaggedStruct("Snapshot", {}),
  /** Click the element carrying this snapshot `ref`. */
  Schema.TaggedStruct("Click", { ref: Schema.String }),
  /**
   * Type into the element with this `ref`. `submit` presses Enter afterward
   * (e.g. to submit a search box / login form).
   */
  Schema.TaggedStruct("Type", {
    ref: Schema.String,
    text: Schema.String,
    submit: Schema.optional(Schema.Boolean),
  }),
  /**
   * Settle after navigation/AJAX. Either wait a fixed `ms`, or poll until a
   * CSS `selector` appears (whichever is given; selector wins).
   */
  Schema.TaggedStruct("Wait", {
    ms: Schema.optional(Schema.Number),
    selector: Schema.optional(Schema.String),
  }),
  /**
   * Scroll the page (or a `ref` into view). `direction` moves the viewport;
   * `ref` (when given) scrolls that element to center instead.
   */
  Schema.TaggedStruct("Scroll", {
    direction: Schema.optional(
      Schema.Literal("up", "down", "top", "bottom"),
    ),
    ref: Schema.optional(Schema.String),
  }),
  /** Hover an element by `ref` (reveal menus / tooltips). */
  Schema.TaggedStruct("Hover", { ref: Schema.String }),
  /** Choose an option in a <select> by `ref`, matching value or visible label. */
  Schema.TaggedStruct("Select", { ref: Schema.String, value: Schema.String }),
  /**
   * Press a key (Enter, Tab, Escape, ArrowDown, …) on the element `ref`, or on
   * whatever is focused when `ref` is omitted.
   */
  Schema.TaggedStruct("Press", {
    key: Schema.String,
    ref: Schema.optional(Schema.String),
  }),
  /**
   * Read the visible text of the page, or of one element when `ref` is given.
   * Cheaper than a screenshot for confirming content / verifying a flow.
   */
  Schema.TaggedStruct("Read", { ref: Schema.optional(Schema.String) }),
  /** Browser history / reload — back, forward, or reload the current page. */
  Schema.TaggedStruct("History", {
    action: Schema.Literal("back", "forward", "reload"),
  }),
  /** Return recent console messages + page errors captured since last load. */
  Schema.TaggedStruct("Console", {}),
  /**
   * Autofill + submit the saved (DUMMY/TEST) credentials for this origin.
   * SECURITY: the command carries ONLY the origin — never the password. The
   * renderer pulls the secret out-of-band via `browser.fillForOrigin` and
   * injects it into the page, so the password never enters the agent's tool
   * args/results or the LLM context.
   */
  Schema.TaggedStruct("Login", { origin: Schema.String }),
);
export type BrowserCommand = typeof BrowserCommand.Type;

/**
 * Renderer-visible summary of a saved browser credential. Deliberately omits
 * the password — the settings UI only ever sees the origin + username, mirroring
 * the `hasApiKey` boolean exposure for provider API keys.
 */
export class BrowserCredentialSummary extends Schema.Class<BrowserCredentialSummary>(
  "BrowserCredentialSummary",
)({
  origin: Schema.String,
  username: Schema.String,
}) {}

/**
 * The actual secret, returned ONLY to the trusted renderer executor when it
 * handles a `Login` command. Never flows through the agent event stream, a
 * tool result, or the command broadcast.
 */
export class BrowserCredentialSecret extends Schema.Class<BrowserCredentialSecret>(
  "BrowserCredentialSecret",
)({
  username: Schema.String,
  password: Schema.String,
}) {}

/**
 * One outstanding command. `id` is the server-minted handle the renderer
 * echoes back on `browser.respond`. `sessionId` is the agent session that
 * issued it — the renderer uses it only for display/attribution today.
 */
export class BrowserCommandRequest extends Schema.Class<BrowserCommandRequest>(
  "BrowserCommandRequest",
)({
  id: Schema.String,
  sessionId: SessionId,
  command: BrowserCommand,
}) {}

/**
 * Renderer's reply for one command. `ok=false` carries a human-readable
 * `error` the tool surfaces to the agent. Successful results fill the
 * command-specific optional fields:
 *   - Navigate   → `url`, `title`
 *   - Screenshot → `screenshot` (base64 PNG, no data-URL prefix)
 */
export class BrowserCommandResult extends Schema.Class<BrowserCommandResult>(
  "BrowserCommandResult",
)({
  id: Schema.String,
  ok: Schema.Boolean,
  error: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  screenshot: Schema.optional(Schema.String),
  /** Snapshot → JSON array of `{ ref, role, name, value }`. */
  snapshot: Schema.optional(Schema.String),
  /** Click/Type/Scroll/… → short human-readable note for the agent. */
  detail: Schema.optional(Schema.String),
  /** Read → page/element text; Console → captured console + error log. */
  text: Schema.optional(Schema.String),
}) {}

export class BrowserCommandNotFoundError extends Schema.TaggedError<BrowserCommandNotFoundError>()(
  "BrowserCommandNotFoundError",
  { id: Schema.String },
) {}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

/**
 * Live stream of pending browser commands. The renderer's BrowserPane
 * subscribes once (independent of which right-pane tab is active) and
 * executes each against the webview. Broadcasting once and filtering on the
 * client mirrors `permission.requests`.
 */
export const BrowserCommandsRpc = Rpc.make("browser.commands", {
  payload: Schema.Struct({}),
  success: BrowserCommandRequest,
  stream: true,
});

/**
 * Renderer posts the outcome of a command back here; the server resolves the
 * Deferred the MCP tool handler is awaiting. Fails if the id is unknown
 * (already resolved, timed out, or from a previous server run).
 */
export const BrowserRespondRpc = Rpc.make("browser.respond", {
  payload: Schema.Struct({ result: BrowserCommandResult }),
  success: Schema.Void,
  error: BrowserCommandNotFoundError,
});

// ---------------------------------------------------------------------------
// Browser credentials (DUMMY / TEST passwords only — see settings UI warning).
// Stored in the OS keychain, namespaced by origin. Write-only from the UI's
// perspective; the password is never returned to the settings UI, only to the
// renderer's Login executor via `browser.fillForOrigin`.
// ---------------------------------------------------------------------------

/** Save (or overwrite) the dummy credential for an origin. */
export const BrowserSetCredentialRpc = Rpc.make("browser.setCredential", {
  payload: Schema.Struct({
    origin: Schema.String,
    username: Schema.String,
    password: Schema.String,
  }),
  success: Schema.Void,
});

/** List saved credentials (origin + username only — never the password). */
export const BrowserListCredentialsRpc = Rpc.make("browser.listCredentials", {
  payload: Schema.Struct({}),
  success: Schema.Array(BrowserCredentialSummary),
});

export const BrowserRemoveCredentialRpc = Rpc.make("browser.removeCredential", {
  payload: Schema.Struct({ origin: Schema.String }),
  success: Schema.Void,
});

/**
 * Renderer-only: fetch the secret for an origin to inject into the page during
 * a Login command. Returns null when nothing is saved. NEVER call this from any
 * agent-facing path — the result is the cleartext dummy password.
 */
export const BrowserFillForOriginRpc = Rpc.make("browser.fillForOrigin", {
  payload: Schema.Struct({ origin: Schema.String }),
  success: Schema.NullOr(BrowserCredentialSecret),
});
