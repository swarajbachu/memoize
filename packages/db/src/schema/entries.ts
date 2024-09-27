import { relations } from "drizzle-orm/relations";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createUniqueIds } from "../utilts";
import { User } from "./users";

// Entries table
export const entries = sqliteTable("entries", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createUniqueIds("entry")),
  userId: text("user_id")
    .references(() => User.id)
    .notNull(),
  content: text("content").notNull(),
  sentimentScore: integer("sentiment_score"),
  emotions: text("emotions"),
  wordCount: integer("word_count"),
  analyzed: integer("analyzed", { mode: "boolean" }).default(false),
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

export const entriesRelations = relations(entries, ({ one }) => ({
  user: one(User, {
    fields: [entries.userId],
    references: [User.id],
  }),
}));
