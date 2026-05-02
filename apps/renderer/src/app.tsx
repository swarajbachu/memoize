import { Sidebar } from "./components/sidebar";
import { TerminalPane } from "./components/terminal-pane";
import { GitHistoryPane } from "./components/git-history-pane";

export function App() {
  return (
    <div className="grid h-screen w-screen grid-cols-[240px_1fr_320px] bg-[var(--color-bg)] text-[var(--color-fg)]">
      <Sidebar />
      <main className="flex min-w-0 flex-col border-x border-[var(--color-border)]">
        <header className="flex h-9 items-center px-3 text-xs text-[var(--color-fg-muted)] [-webkit-app-region:drag]">
          <span className="ml-16 select-none">main · scratch session</span>
        </header>
        <div className="min-h-0 flex-1">
          <TerminalPane />
        </div>
      </main>
      <GitHistoryPane />
    </div>
  );
}
