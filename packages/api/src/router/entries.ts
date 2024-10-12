import { desc, entries, eq } from "@memoize/db";
import { MessageSchema } from "@memoize/validators/entries";
import { journals } from "@memoize/validators/journal-constants";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import {
  createInDepthResponse,
  createInitialQuestion,
} from "../handlers/entries-ai";
import { protectedProcedure } from "../trpc";

export const entryRouter = {
  getNextQuestion: protectedProcedure
    .input(
      z.object({
        journalId: z.string().optional(),
        currentConversation: z.array(z.string()),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.currentConversation.length < 6) {
        // 3 pairs of user-AI interactions
        console.log(input.journalId, "id");
        if (input.journalId) {
          console.log(input.journalId, "prompting");

          return (
            journals.find((j) => j.value === input.journalId)?.prompts[
              input.currentConversation.length / 2
            ] ?? "what do you want to talk about today?"
          );
        }
        const { question, proceedToNext } = await createInitialQuestion(
          input.currentConversation.join("\n\n"),
        );
        if (!proceedToNext) {
          return question;
        }
      }

      return await createInDepthResponse(
        input.currentConversation.join("\n\n"),
      );
    }),
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
        messages: z.array(MessageSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db
        .insert(entries.entries)
        .values({
          id: input.id,
          content: input.messages,
          userId: ctx.userId,
        })
        .onConflictDoUpdate({
          target: entries.entries.id,
          set: {
            content: input.messages,
          },
        })
        .returning();
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
