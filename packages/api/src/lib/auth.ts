import { DrizzleSQLiteAdapter } from "@lucia-auth/adapter-drizzle";
import { db } from "@memoize/db";
import { users } from "@memoize/db";
import { Lucia, TimeSpan } from "lucia";


const adapter = new DrizzleSQLiteAdapter(db, users.sessions, users.User);

export const lucia = new Lucia(adapter, {
  getSessionAttributes: (/* attributes */) => {
    return {};
  },
  getUserAttributes: (attributes) => {
    return {
      id: attributes.id,
      email: attributes.email,
      emailVerified: attributes.emailVerified,
      avatar: attributes.avatar,
      createdAt: attributes.createdAt,
      updatedAt: attributes.updatedAt,
    };
  },
  sessionExpiresIn: new TimeSpan(30, "d"),
  sessionCookie: {
    name: "session",
    expires: false, // session cookies have very long lifespan (2 years)
    attributes: {
      secure: process.env.NODE_ENV === "production",
    },
  },
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseSessionAttributes: DatabaseSessionAttributes;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

type DatabaseSessionAttributes = {};
interface DatabaseUserAttributes
  extends Omit<users.UserSelect, "hashedPassword"> {}
