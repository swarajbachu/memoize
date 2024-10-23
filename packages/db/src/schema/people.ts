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

export const people = sqliteTable("entry_persons", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createUniqueIds("en_pe")),
  userId: text("user_id")
    .references(() => User.clerkUserId, {
      onDelete: "cascade",
    })
    .notNull(),
  personName: text("person").notNull(),
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

export const peopleRelations = relations(people, ({ one, many }) => ({
  user: one(User, {
    fields: [people.userId],
    references: [User.clerkUserId],
  }),
  entry: many(peopleToEntry),
}));

export const peopleToEntry = sqliteTable(
  "person_to_entry",
  {
    personId: text("person_id")
      .references(() => people.id, {
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
  (table) => ({
    pk: primaryKey({
      columns: [table.personId, table.entryId],
    }),
  }),
);

export const peopleToEntryRelations = relations(peopleToEntry, ({ one }) => ({
  person: one(people, {
    fields: [peopleToEntry.personId],
    references: [people.id],
  }),
  entry: one(entries, {
    fields: [peopleToEntry.entryId],
    references: [entries.id],
  }),
}));
