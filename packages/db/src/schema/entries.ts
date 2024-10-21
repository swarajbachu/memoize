import { MessageSchema, type MessageType } from "@memoize/validators/entries";
import { relations } from "drizzle-orm/relations";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import z from "zod";
import { createUniqueIds } from "../utilts";
import { peopleToEntry } from "./people";
import { topicToEntry } from "./topics";
import { User } from "./users";

export const entries = sqliteTable("entries", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createUniqueIds("entry")),
  userId: text("user_id")
    .references(() => User.clerkUserId)
    .notNull(),
  content: text("content", {
    mode: "json",
  })
    .$type<MessageType[]>()
    .notNull(),
  sentimentScore: integer("sentiment_score"),
  emotions: text("emotions"),
  wordCount: integer("word_count"),
  journalId: text("journal_id"),
  analyzed: integer("analyzed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created", {
    mode: "timestamp_ms",
  })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", {
    mode: "timestamp_ms",
  })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const entriesInsertSchema = createInsertSchema(entries, {
  content: z.array(MessageSchema),
});
export type EntryInsert = z.infer<typeof entriesInsertSchema>;
export const entriesSelectSchema = createSelectSchema(entries, {
  content: z.array(MessageSchema),
});
export type EntrySelect = z.infer<typeof entriesSelectSchema>;

export const entriesRelations = relations(entries, ({ one, many }) => ({
  user: one(User, {
    fields: [entries.userId],
    references: [User.clerkUserId],
  }),
  entryToTopics: many(topicToEntry),
  entryToPeople: many(peopleToEntry),
  entryAnalysis: one(entryAnalysis),
}));

export const entryAnalysis = sqliteTable("entry_analysis", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createUniqueIds("en_ai")),
  entryId: text("entry_id")
    .references(() => entries.id)
    .notNull(),
  analysis: text("analysis").notNull(),
  title: text("title"),
  feelings: text("feelings", {
    mode: "json",
  }),
  createdAt: integer("created", {
    mode: "timestamp_ms",
  })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", {
    mode: "timestamp_ms",
  })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const entryAnalysisInsertSchema = createInsertSchema(entryAnalysis);
export type EntryAnalysisInsert = z.infer<typeof entryAnalysisInsertSchema>;
export const entryAnalysisSelectSchema = createSelectSchema(entryAnalysis);
export type EntryAnalysisSelect = z.infer<typeof entryAnalysisSelectSchema>;

export const entryAnalysisRelations = relations(entryAnalysis, ({ one }) => ({
  entry: one(entries, {
    fields: [entryAnalysis.entryId],
    references: [entries.id],
  }),
}));
