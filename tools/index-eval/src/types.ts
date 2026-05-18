export interface RunResult {
  readonly taskId: string;
  readonly tier: "baseline" | "tier1";
  readonly succeeded: boolean;
  readonly tokens: number;
  readonly wallMs: number;
  readonly toolCalls: number;
  readonly notes: string;
}
