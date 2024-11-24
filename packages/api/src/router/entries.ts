import {
  and,
  asc,
  count,
  db,
  desc,
  entries,
  eq,
  gt,
  people,
  sum,
  topics,
} from "@memoize/db";
import { MessageSchema } from "@memoize/validators/entries";
import { journals } from "@memoize/validators/journal-constants";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import {
  createInDepthResponse,
  generateReflection,
  generateTopicsAndPeople,
} from "../handlers/entries-ai";
import { withCache } from "../lib/cache";
import { protectedProcedure } from "../trpc";

export const entryRouter = {
  getTodayReflectionStatus: protectedProcedure.query(async ({ ctx }) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayMorningReflection = await withCache(
      ctx,
      ctx.cacheTagManager.morningReflection(),
      async () =>
        await ctx.db.query.entries.findFirst({
          where: (entries) => {
            return and(
              eq(entries.userId, ctx.userId),
              gt(entries.createdAt, startOfDay),
              eq(entries.journalId, "morning_intention"),
            );
          },
        }),
      {
        expirationTtl: calculateSecondsUntilEndOfDay(),
      },
    );
    const todayEveningReflection = await withCache(
      ctx,
      ctx.cacheTagManager.eveningReflection(),
      async () =>
        await ctx.db.query.entries.findFirst({
          where: (entries) => {
            return and(
              eq(entries.userId, ctx.userId),
              eq(entries.createdAt, new Date()),
              eq(entries.journalId, "evening_reflection"),
            );
          },
        }),
      {
        expirationTtl: calculateSecondsUntilEndOfDay(),
      },
    );
    return {
      morningReflection: {
        status: !!todayMorningReflection,
        entry: todayMorningReflection,
      },
      eveningReflection: {
        status: !!todayEveningReflection,
        entry: todayEveningReflection,
      },
    };
  }),
  getNextQuestion: protectedProcedure
    .input(
      z.object({
        journalId: z.string().optional(),
        currentConversation: z.array(z.string()),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.currentConversation.length < 6 && input.journalId) {
        return (
          journals.find((j) => j.value === input.journalId)?.prompts[
            input.currentConversation.length / 2
          ] ?? "what do you want to talk about today?"
        );
      }
      if (input.currentConversation.length < 2) {
        return "what do you want to talk about today?";
      }

      return await createInDepthResponse(
        input.currentConversation.join("\n\n"),
      );
    }),
  finishEntryAnalysis: protectedProcedure
    .input(
      z.object({
        journalEntires: z.array(MessageSchema),
        entryId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const analysis = await generateReflection({
        journalEntry: input.journalEntires,
      });
      await db
        .update(entries.entries)
        .set({
          title: analysis.title,
        })
        .where(eq(entries.entries.id, input.entryId));
      await db.insert(entries.entryAnalysis).values({
        entryId: input.entryId,
        analysis: analysis.summary,
        feelings: analysis.feelings,
      });
      const existingTopics = await db.query.topics.findMany({
        where: (topics) => eq(topics.userId, ctx.userId),
      });
      const existingPeople = await db.query.people.findMany({
        where: (people) => eq(people.userId, ctx.userId),
      });
      const topicsAndPeople = await generateTopicsAndPeople({
        summary: analysis.summary,
        existingTopics: existingTopics.map((topic) => topic.topic),
        existingPeople: existingPeople.map((person) => person.personName),
      });
      for (const topic of topicsAndPeople.topics) {
        if (topic.isNew) {
          const [insertedTopic] = await db
            .insert(topics.topics)
            .values({
              topic: topic.name,
              emoji: topic.emoji,
              userId: ctx.userId,
            })
            .returning();
          if (!insertedTopic) {
            throw new Error("Failed to insert topic");
          }
          await db.insert(topics.topicToEntry).values({
            entryId: input.entryId,
            topicId: insertedTopic?.id,
          });
        } else {
          const existingTopic = await db.query.topics.findFirst({
            where: and(
              eq(topics.topics.topic, topic.name),
              eq(topics.topics.userId, ctx.userId),
            ),
          });
          if (!existingTopic) {
            console.log("existing topic not found", topic.name);
            continue;
          }
          await db.insert(topics.topicToEntry).values({
            entryId: input.entryId,
            topicId: existingTopic.id,
          });
        }
      }
      for (const person of topicsAndPeople.people) {
        if (person.isNew) {
          const [insertedPerson] = await db
            .insert(people.people)
            .values({
              personName: person.name,
              userId: ctx.userId,
            })
            .returning();
          if (!insertedPerson) {
            throw new Error("Failed to insert person");
          }
          await db.insert(people.peopleToEntry).values({
            entryId: input.entryId,
            personId: insertedPerson?.id,
          });
        } else {
          const existingPerson = await db.query.people.findFirst({
            where: and(
              eq(people.people.personName, person.name),
              eq(people.people.userId, ctx.userId),
            ),
          });
          if (!existingPerson) {
            console.log("existing person not found", person.name);
            continue;
          }
          await db.insert(people.peopleToEntry).values({
            entryId: input.entryId,
            personId: existingPerson.id,
          });
        }
      }

      // Invalidate cache for entries
      await ctx.cache.delete(ctx.cacheTagManager.allEntries());
      await ctx.cache.delete(ctx.cacheTagManager.findAllEntries());
      await ctx.cache.delete(ctx.cacheTagManager.getEntriesCount());
      await ctx.cache.delete(ctx.cacheTagManager.getStreak());
      return analysis;
    }),
  findAllEntries: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = ctx.cacheTagManager.findAllEntries();
    const result = await withCache(ctx, cacheKey, async () => {
      const allEntries = await ctx.db.query.entries.findMany({
        where: eq(entries.entries.userId, ctx.userId),
        orderBy: desc(entries.entries.createdAt),
      });
      const groupedEntriesByMonth = allEntries.reduce(
        (acc: Record<string, entries.EntrySelect[]>, entry) => {
          const date = entry.createdAt ? new Date(entry.createdAt) : new Date();
          const monthKey = date.toLocaleString("default", {
            month: "long",
            year: "numeric",
          });
          if (!acc[monthKey]) {
            acc[monthKey] = [];
          }
          acc[monthKey].push(entry);
          return acc;
        },
        {},
      );
      return groupedEntriesByMonth;
    });
    return result;
  }),
  allEntries: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = ctx.cacheTagManager.allEntries();
    const result = await withCache(ctx, cacheKey, async () => {
      const allEntries = await ctx.db.query.entries.findMany({
        where: eq(entries.entries.userId, ctx.userId),
        orderBy: desc(entries.entries.createdAt),
      });
      return allEntries;
    });
    return result;
  }),
  findEntryById: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      const cacheKey = ctx.cacheTagManager.findEntryById(input);
      const result = await withCache(ctx, cacheKey, async () => {
        const entry = await ctx.db.query.entries.findFirst({
          where: eq(entries.entries.id, input),
          with: {
            entryAnalysis: true,
            entryToTopics: {
              with: {
                topic: true,
              },
            },
            entryToPeople: {
              with: {
                person: true,
              },
            },
          },
        });
        return entry;
      });
      return result;
    }),
  addEntry: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        journalId: z.string().optional(),
        messages: z.array(MessageSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Calculate word count for messages with role 'user'
      const wordCount = input.messages
        .filter((message) => message.role === "user")
        .reduce(
          (count, message) => count + message.content.split(/\s+/).length,
          0,
        );

      const entry = await ctx.db
        .insert(entries.entries)
        .values({
          id: input.id,
          content: input.messages,
          journalId: input.journalId,
          userId: ctx.userId,
          wordCount: wordCount, // Add word count to the database
        })
        .onConflictDoUpdate({
          target: entries.entries.id,
          set: {
            content: input.messages,
            journalId: input.journalId,
            wordCount: wordCount, // Update word count on conflict
          },
        })
        .returning();

      return entry[0];
    }),
  getStreak: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = ctx.cacheTagManager.getStreak();
    const result = await withCache(
      ctx,
      cacheKey,
      async () => {
        // existing code of getStreak
        type Streak = {
          count: number;
          start: Date | undefined;
          end: Date | undefined;
        };

        // Fetch all entries for the user, sorted ascending by createdAt
        const allEntries = await ctx.db.query.entries.findMany({
          where: (entries) => eq(entries.userId, ctx.userId),
          orderBy: asc(entries.entries.createdAt),
          columns: {
            createdAt: true,
          },
        });

        if (allEntries.length === 0) {
          return {
            currentStreak: { count: 0, start: undefined, end: undefined },
            longestStreak: { count: 0, start: undefined, end: undefined },
          };
        }

        // Helper functions to manipulate dates
        const startOfDay = (date: Date): Date =>
          new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const isSameDay = (d1: Date, d2: Date): boolean =>
          d1.getFullYear() === d2.getFullYear() &&
          d1.getMonth() === d2.getMonth() &&
          d1.getDate() === d2.getDate();

        const isConsecutiveDay = (d1: Date, d2: Date): boolean => {
          const diffTime = startOfDay(d2).getTime() - startOfDay(d1).getTime();
          const diffDays = diffTime / (1000 * 60 * 60 * 24);
          return diffDays === 1;
        };

        // Remove multiple entries on the same day by using a Set of date strings
        const uniqueDateStrings = Array.from(
          new Set(
            allEntries.map((entry) =>
              startOfDay(new Date(entry.createdAt)).toISOString(),
            ),
          ),
        );

        const uniqueDates: Date[] = uniqueDateStrings.map(
          (dateStr) => new Date(dateStr),
        );

        // Sort the unique dates in ascending order (oldest to newest)
        uniqueDates.sort((a, b) => a.getTime() - b.getTime());

        if (uniqueDates.length === 0) {
          // Should not happen, but handle it to satisfy TypeScript
          return {
            currentStreak: { count: 0, start: undefined, end: undefined },
            longestStreak: { count: 0, start: undefined, end: undefined },
          };
        }

        const firstDate = uniqueDates[0]; // uniqueDates[0] is defined since length > 0
        let longestStreak: Streak = {
          count: 1,
          start: firstDate,
          end: firstDate,
        };
        let tempStreak: Streak = {
          count: 1,
          start: firstDate,
          end: firstDate,
        };

        for (let i = 1; i < uniqueDates.length; i++) {
          const prevDate = uniqueDates[i - 1];
          const currentDate = uniqueDates[i];

          if (
            prevDate &&
            currentDate &&
            isConsecutiveDay(prevDate, currentDate)
          ) {
            tempStreak.count += 1;
            tempStreak.end = currentDate;
          } else {
            // Update longest streak if needed
            if (tempStreak.count > longestStreak.count) {
              longestStreak = { ...tempStreak };
            }
            // Reset temp streak
            if (currentDate) {
              tempStreak = { count: 1, start: currentDate, end: currentDate };
            }
          }
        }

        // Final check after loop
        if (tempStreak.count > longestStreak.count) {
          longestStreak = { ...tempStreak };
        }

        // Determine the current streak
        const today = startOfDay(new Date());
        const lastEntryDate =
          uniqueDates.length > 0
            ? // biome-ignore lint/style/noNonNullAssertion: <explanation>
              startOfDay(uniqueDates[uniqueDates.length - 1]!)
            : undefined;

        let currentStreak: Streak = {
          count: 0,
          start: undefined,
          end: undefined,
        };

        if (lastEntryDate && isSameDay(lastEntryDate, today)) {
          // User has made an entry today; streak includes today
          currentStreak = {
            count: tempStreak.count,
            start: tempStreak.start,
            end: tempStreak.end,
          };
        } else if (lastEntryDate && isConsecutiveDay(lastEntryDate, today)) {
          // User has not made an entry today but did yesterday; streak counts up to yesterday
          currentStreak = {
            count: tempStreak.count,
            start: tempStreak.start,
            end: tempStreak.end,
          };
        }

        return { currentStreak, longestStreak };
      },
      { expirationTtl: calculateSecondsUntilEndOfDay() }, // Cache for 1 hour
    );
    return result;
  }),
  getEntriesCount: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = ctx.cacheTagManager.getEntriesCount();
    const result = await withCache(ctx, cacheKey, async () => {
      const entriesCount = await ctx.db
        .select({ count: count() })
        .from(entries.entries)
        .where(eq(entries.entries.userId, ctx.userId));
      const wordsCount = await ctx.db
        .select({ value: sum(entries.entries.wordCount) })
        .from(entries.entries)
        .where(eq(entries.entries.userId, ctx.userId));
      console.log(entriesCount, wordsCount);
      return {
        count: entriesCount[0]?.count ?? 0,
        words: wordsCount[0]?.value ?? "0",
      };
    });
    return result;
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
      // Invalidate cache for entries
      await ctx.cache.delete(ctx.cacheTagManager.allEntries());
      await ctx.cache.delete(ctx.cacheTagManager.findAllEntries());
      await ctx.cache.delete(ctx.cacheTagManager.findEntryById(input));
      await ctx.cache.delete(ctx.cacheTagManager.getEntriesCount());
      await ctx.cache.delete(ctx.cacheTagManager.getStreak());
      return entry[0];
    }),
} satisfies TRPCRouterRecord;

function calculateSecondsUntilEndOfDay(): number {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
}
