export * from "drizzle-orm/sql";
export { alias } from "drizzle-orm/sqlite-core";

import { drizzle } from "drizzle-orm/d1";

import * as users from "./schema/users";
import * as entries from "./schema/entries";

export * from "drizzle-orm/sql";
import type { cloudflareWorkerTypes } from "@memoize/validators/";

export { users, entries };

export const schema = {
  ...users,
  ...entries,
};

// const pool = new Pool({ connectionString: env.POSTGRES_URL });
// export const db = drizzle(pool, { schema });

export const db = drizzle(
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  process.env.DATABASE as any as cloudflareWorkerTypes.D1Database,
  { schema },
);
