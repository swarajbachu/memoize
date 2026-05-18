export function WelcomeStep() {
  return (
    <div className="flex h-full flex-col gap-10">
      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
          Welcome
        </span>
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-foreground">
          A calm home for
          <br />
          parallel agents.
        </h1>
        <p className="max-w-md pt-1 text-[15px] leading-relaxed text-muted-foreground">
          Run Claude or Codex on your repos — each chat in its own git worktree,
          each agent on its own thread. We&apos;ll set things up in under a
          minute.
        </p>
      </div>

      <ul className="flex flex-col gap-0.5 text-sm">
        <Row title="No new logins">
          We reuse your local CLI auth (claude, codex, gemini, grok, cursor).
          Just pick your default and go — no API keys, no re-auth.
        </Row>
        <Row title="One worktree per chat">
          Experiments stay isolated, branches stay tidy.
        </Row>
        <Row title="Two quick picks">
          Choose your default agent, add a project — you&apos;re in.
        </Row>
      </ul>
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-3 py-2">
      <span className="flex size-1 shrink-0 translate-y-[-3px] rounded-full bg-foreground/40" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-xs leading-snug text-muted-foreground">
          {children}
        </span>
      </span>
    </li>
  );
}
