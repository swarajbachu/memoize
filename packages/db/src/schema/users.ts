import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { entries } from "./entries";
import { people } from "./people";
import { topics } from "./topics";

export const User = sqliteTable("user", {
  clerkUserId: text("clerk_user_id", { length: 255 }).primaryKey(),
  name: text("name", { length: 255 }),
  email: text("email", { length: 255 }).notNull(),
  image: text("image", { length: 255 }),
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
});

export const UserRelations = relations(User, ({ many }) => ({
  entires: many(entries),
  topics: many(topics),
  people: many(people),
}));

export const userInsertSchema = createInsertSchema(User);
export type UserInsert = z.infer<typeof userInsertSchema>;
export const userSelectSchema = createSelectSchema(User);
export type UserSelect = z.infer<typeof userSelectSchema>;
