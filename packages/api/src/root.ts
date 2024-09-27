import { authRouter } from "./router/auth";
import { entryRouter } from "./router/entries";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  entries: entryRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
