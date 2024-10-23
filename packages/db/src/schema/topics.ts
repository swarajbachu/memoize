import { relations } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { createUniqueIds } from "../utilts";
import { entries } from "./entries";
import { User } from "./users";

export const topics = sqliteTable("entry_topics", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createUniqueIds("en_tp")),
  userId: text("user_id")
    .references(() => User.clerkUserId, {
      onDelete: "cascade",
    })
    .notNull(),
  topic: text("topic").notNull(),
  emoji: text("emoji").notNull(),
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

export const topicRelations = relations(topics, ({ one, many }) => ({
  user: one(User, {
    fields: [topics.userId],
    references: [User.clerkUserId],
  }),
  entry: many(topicToEntry),
}));

export const topicToEntry = sqliteTable(
  "topic_to_entry",
  {
    topicId: text("topic_id")
      .references(() => topics.id, {
        onDelete: "cascade",
      })
      .notNull(),
    entryId: text("entry_id")
      .references(() => entries.id, {
        onDelete: "cascade",
      })
      .notNull(),
    createdAt: integer("created", {
      mode: "timestamp_ms",
    })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updatedAt", {
      mode: "timestamp_ms",
    })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.topicId, t.entryId],
    }),
  }),
);

export const topicToEntryRelations = relations(topicToEntry, ({ one }) => ({
  topic: one(topics, {
    fields: [topicToEntry.topicId],
    references: [topics.id],
  }),
  entry: one(entries, {
    fields: [topicToEntry.entryId],
    references: [entries.id],
  }),
}));
