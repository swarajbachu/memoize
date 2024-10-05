import { desc, entries, eq } from "@memoize/db";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../trpc";

export const entryRouter = {
  // createEntry: protectedProcedure
  //   .input(
  //     z.object({
  //       id: z.string().optional(),
  //       content: z.string(),
  //     })
  //   )
  //   .mutation(async ({ ctx, input }) => {
  //     if (input.id) {
  //       const entry = await ctx.db
  //         .update(entries.entries)
  //         .set({ content: input.content })
  //         .where(eq(entries.entries.id, input.id))
  //         .returning();
  //       return entry[0];
  //     }
  //     const entry = await ctx.db
  //       .insert(entries.entries)
  //       .values({
  //         content: input.content,
  //         userId: ctx.userId,
  //       })
  //       .returning();
  //     return entry[0];
  //   }),

  findAllEntires: protectedProcedure.query(async ({ ctx }) => {
    const allEntries = await ctx.db.query.entries.findMany({
      where: eq(entries.entries.userId, ctx.userId),
      orderBy: desc(entries.entries.createdAt),
    });
    return allEntries;
  }),
  findEntryById: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.query.entries.findFirst({
        where: eq(entries.entries.id, input),
      });
      return entry;
    }),
  addEntry: protectedProcedure
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
          userId: ctx.userId,
        })
        .returning()
        .catch((err) => {
          console.log(err);
          throw err;
        });
      return entry[0];
    }),
  deleteEntry: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const dbEntry = await ctx.db.query.entries.findFirst({
        where: eq(entries.entries.id, input),
      });
      if (!dbEntry) {
        throw new Error("Entry not found");
      }
      if (dbEntry.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }
      const entry = await ctx.db
        .delete(entries.entries)
        .where(eq(entries.entries.id, input))
        .returning();
      return entry[0];
    }),
} satisfies TRPCRouterRecord;
