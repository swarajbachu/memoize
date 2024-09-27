import type { AuthEnv } from "@hono/auth-js";

export type Bindings = AuthEnv & {
  ENVIRONMENT: "development" | "production" | "staging";
};
