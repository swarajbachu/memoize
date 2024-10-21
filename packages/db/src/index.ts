export * from "drizzle-orm/sql";
export { alias } from "drizzle-orm/sqlite-core";

import { drizzle } from "drizzle-orm/d1";

import * as entries from "./schema/entries";
import * as people from "./schema/people";
import * as topics from "./schema/topics";
import * as users from "./schema/users";

export * from "drizzle-orm/sql";

import type { cloudflareWorkerTypes } from "@memoize/validators/";

export { users, entries, topics, people };

export const schema = {
  ...users,
  ...entries,
  ...topics,
  ...people,
};

// const pool = new Pool({ connectionString: env.POSTGRES_URL });
// export const db = drizzle(pool, { schema });

export const db = drizzle(
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  process.env.DATABASE as any as cloudflareWorkerTypes.D1Database,
  { schema },
);
