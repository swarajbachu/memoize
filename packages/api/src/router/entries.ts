import { entries, eq } from "@memoize/db";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../trpc";

export const entryRouter = {
  createEntry: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        content: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const entry = await ctx.db
          .update(entries.entries)
          .set({ content: input.content })
          .where(eq(entries.entries.id, input.id))
          .returning();
        return entry[0];
      }
      const entry = await ctx.db
        .insert(entries.entries)
        .values({
          content: input.content,
          userId: "testing",
        })
        .returning();
      return entry[0];
    }),

  findAllEntires: protectedProcedure.query(async ({ ctx }) => {
    const allEntries = await ctx.db.query.entries.findMany({
      where: eq(entries.entries.userId, "testing"),
    });
    return allEntries;
  }),
} satisfies TRPCRouterRecord;
