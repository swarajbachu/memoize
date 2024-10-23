import {
  and,
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
import type { EntrySelect } from "../../../db/dist/schema/entries";
import {
  createInDepthResponse,
  generateReflection,
  generateTopicsAndPeople,
} from "../handlers/entries-ai";
import { protectedProcedure } from "../trpc";

export const entryRouter = {
  getTodayReflectionStatus: protectedProcedure.query(async ({ ctx }) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayMorningReflection = await ctx.db.query.entries.findFirst({
      where: (entries) => {
        return and(
          eq(entries.userId, ctx.userId),
          gt(entries.createdAt, startOfDay),
          eq(entries.journalId, "morning_intention"),
        );
      },
    });
    console.log(todayMorningReflection, "morning");
    const todayEveningReflection = await ctx.db.query.entries.findFirst({
      where: (entries) => {
        return and(
          eq(entries.userId, ctx.userId),
          eq(entries.createdAt, new Date()),
          eq(entries.journalId, "evening_reflection"),
        );
      },
    });
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
      return analysis;
    }),
  findAllEntires: protectedProcedure.query(async ({ ctx }) => {
    const allEntries = await ctx.db.query.entries.findMany({
      where: eq(entries.entries.userId, ctx.userId),
      orderBy: desc(entries.entries.createdAt),
    });
    const groupedEntriesByMonth = allEntries.reduce(
      (acc: Record<string, EntrySelect[]>, entry) => {
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
  }),
  allEntries: protectedProcedure.query(async ({ ctx }) => {
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
        with: {
          entryAnalysis: true,
          entryToTopics: {
            with: {
              topic: true,
            },
          },
        },
      });
      return entry;
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
      console.log(input, "input add entry");

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
    type Streak = {
      count: number;
      start: Date | null;
      end: Date | null;
    };

    const descEntries = await ctx.db.query.entries.findMany({
      where: (entries) => eq(entries.userId, ctx.userId),
      orderBy: desc(entries.entries.createdAt),
    });
    let currentStreak: Streak = { count: 0, start: null, end: null };
    let longestStreak: Streak = { count: 0, start: null, end: null };
    let streakStart: Date | null = null;

    for (let i = 0; i < descEntries.length; i++) {
      const entryDate = new Date(descEntries[i]?.createdAt || new Date());
      const nextEntryDate =
        i > 0 ? new Date(descEntries[i - 1]?.createdAt ?? new Date()) : null;

      if (
        i === 0 ||
        (nextEntryDate && isConsecutiveDay(entryDate, nextEntryDate))
      ) {
        if (!streakStart) streakStart = entryDate;
        currentStreak.count++;
      } else {
        if (currentStreak.count > longestStreak.count) {
          longestStreak = {
            ...currentStreak,
            // biome-ignore lint/style/noNonNullAssertion: <explanation>
            start: streakStart!,
            end: entryDate,
          };
        }
        currentStreak = { count: 1, start: entryDate, end: null };
        streakStart = entryDate;
      }
    }
    // Check if the current streak is the longest
    if (currentStreak.count > longestStreak.count) {
      longestStreak = {
        ...currentStreak,
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        start: streakStart!,
        end: new Date(
          descEntries[descEntries.length - 1]?.createdAt ?? new Date(),
        ),
      };
    }

    // Update current streak start date
    currentStreak.start = streakStart;

    // Update current streak end date
    currentStreak.end = new Date(descEntries[0]?.createdAt || new Date());

    // Reset current streak if the last entry is not from today or yesterday
    const lastEntryDate = new Date(descEntries[0]?.createdAt || new Date());
    const today = new Date();
    if (
      !isConsecutiveDay(lastEntryDate, today) &&
      !isSameDay(lastEntryDate, today)
    ) {
      currentStreak = { count: 0, start: null, end: null };
    }

    return { currentStreak, longestStreak };
  }),
  getEntriesCount: protectedProcedure.query(async ({ ctx }) => {
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

function isConsecutiveDay(date1: Date, date2: Date): boolean {
  const oneDayInMs = 24 * 60 * 60 * 1000;
  const diffInDays = Math.round(
    (date2.getTime() - date1.getTime()) / oneDayInMs,
  );
  return diffInDays === 1;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}
