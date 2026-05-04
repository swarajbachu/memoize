# 0012 — Steer uses interrupt + send, not mid-stream injection

Status: Accepted (2026-05-04)

## Context

MVP 0.03 adds a mid-turn queue to the chat composer. When the user
types while a turn is running and presses `Enter`, the input is queued
instead of being dropped or blocked. Each queued chip has an arrow
affordance with a `"Steer"` tooltip. Clicking the arrow should move
that queued input into the active conversation immediately.

There are two possible meanings for "steer":

- Inject the queued user message into the currently streaming turn.
- Interrupt the currently streaming turn, then send the queued input as
  the next user turn.

The product behavior needs to feel immediate, but it also has to map to
provider capabilities that exist today. The system should not invent an
internal semantic that providers cannot faithfully execute.

## Options

### Option A — True mid-stream injection

The renderer would send the queued user input while the assistant is
still streaming, and the server would attempt to splice that input into
the active provider turn.

Pros:

- Feels like the user is steering the exact active thought.
- Could avoid ending the assistant's partial response early.

Cons:

- The current provider integrations do not expose a stable "append user
  message to active turn" primitive.
- Tool calls, permission prompts, and streamed deltas create ambiguous
  ordering. A message injected while a tool call is in progress could be
  interpreted before, during, or after the tool result depending on the
  provider.
- History becomes hard to explain: the transcript would show a user
  message that was not a normal turn boundary.

### Option B — Interrupt, drain, then send

Clicking Steer interrupts the active provider turn, waits for any
required post-interrupt cleanup, then sends the queued input through the
same path as a normal composer submission.

Pros:

- Maps directly to provider primitives available today: interrupt the
  active turn, then submit a new user message.
- Keeps transcript ordering honest. The assistant's partial response
  ends, then the user message appears, then a new assistant response
  starts.
- Reuses the existing `messages.send` pipeline for text, file refs,
  image attachments, and skill refs.
- Works consistently for queue chips with rich `ComposerInput`, not
  just plain text.

Cons:

- The assistant's current response ends immediately, even if it was
  mid-sentence.
- A future provider might support cleaner turn-boundary steering, but
  v1 cannot assume that shape.

### Option C — Queue only, no Steer

The composer would let users queue messages while a turn runs, but the
queue would flush only after the assistant finishes naturally.

Pros:

- Simplest implementation.
- No interrupt behavior to reason about.

Cons:

- Does not satisfy the requested Steer affordance.
- Fails the main user workflow: correcting or redirecting the assistant
  before it spends more time on the wrong path.

## Decision

**Option B: Steer is interrupt + send.**

When the user clicks the queue chip's arrow:

1. The renderer removes the queued chip optimistically.
2. The renderer calls `messages.steer({ sessionId, input })`.
3. The server asks the active provider driver to interrupt the running
   turn.
4. The driver drains any provider-required post-interrupt messages.
5. The server sends the queued `ComposerInput` as the next user turn.

This is the only v1 behavior that is both understandable in the
transcript and implementable against the available provider APIs.

## Consequences

- The timeline shows an explicit turn boundary. A partial assistant
  message may appear before the steered user message; that is expected.
- Queue chips can contain text, file refs, image attachments, and skill
  refs because the final step reuses the normal `messages.send` input
  shape.
- `MessagesSteerRpc` returns `SteerUnsupportedError` for future
  providers that cannot interrupt. The two 0.03 provider drivers declare
  support.
- The Send/Interrupt button should avoid flashing idle between the
  interrupt and the new turn. The store keeps the session marked
  running until the steered send has been dispatched.
- The renderer still supports auto-flush. If the user never clicks
  Steer, queued messages send in order when the running turn completes
  naturally.

## Future Work

- **Boundary-aware Steer**. Defer the interrupt until the next safe
  boundary, such as after a tool call result lands, so partial
  assistant output is less abrupt.
- **Provider-native steering**. If a provider eventually exposes a true
  mid-turn steering primitive, add it behind the driver capability
  contract without changing the queue UI.
- **Persistent queues**. If queue chips become long-lived drafts,
  persist them in SQLite instead of keeping them renderer-only.
