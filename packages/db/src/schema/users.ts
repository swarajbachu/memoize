import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";
import { entries } from "./entries";
import { createUniqueIds } from "../utilts";

export const User = sqliteTable("user", {
  id: text("user_id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => createUniqueIds("user")).notNull(),
  name: text("name", { length: 255 }),
  email: text("email", { length: 255 }).notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false),
  hashedPassword: text("hashed_password"),
  avatar: text("image", { length: 255 }),
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
}));

export const userInsertSchema = createInsertSchema(User);
export type UserInsert = z.infer<typeof userInsertSchema>;
export const userSelectSchema = createSelectSchema(User);
export type UserSelect = z.infer<typeof userSelectSchema>;

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id", { length: 255 }).primaryKey(),
    userId: text("user_id", { length: 21 })
      .notNull()
      .references(() => User.id, {
        onDelete: "cascade",
      }),
      expiresAt: integer("expires_at").notNull(),
  },
  (t) => ({
    userIdx: index("session_user_idx").on(t.userId),
  })
);

export const emailVerificationCodes = sqliteTable(
  "email_verification_codes",
  {
    id: integer("id").primaryKey({
      autoIncrement: true,
    }),
    userId: text("user_id", { length: 21 })
      .unique()
      .notNull()
      .references(() => User.id, {
        onDelete: "cascade",
      }),
    email: text("email", { length: 255 }).notNull(),
    code: text("code", { length: 8 }).notNull(),
    expiresAt: integer("expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
  },
  (t) => ({
    userIdx: index("verification_code_user_idx").on(t.userId),
    emailIdx: index("verification_code_email_idx").on(t.email),
  })
);

export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: text("id", { length: 40 }).primaryKey(),
    userId: text("user_id", { length: 21 }).notNull(),
    expiresAt: integer("expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
  },
  (t) => ({
    userIdx: index("password_token_user_idx").on(t.userId),
  })
);
