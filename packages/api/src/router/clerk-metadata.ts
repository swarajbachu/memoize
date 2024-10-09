import type { TRPCRouterRecord } from "@trpc/server";
import { protectedProcedure } from "../trpc";

export const entryRouter = {
  isUserOnboard: protectedProcedure.query(async ({ ctx }) => {}),
} satisfies TRPCRouterRecord;
