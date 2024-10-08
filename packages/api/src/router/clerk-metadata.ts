import { desc, entries, eq } from "@memoize/db";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../trpc";
import { auth } from "@clerk/nextjs/server";

export const entryRouter = {
  isUserOnboard: protectedProcedure.query(async ({ ctx }) => {}),
} satisfies TRPCRouterRecord;
