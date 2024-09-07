export * from "drizzle-orm/sql";
export { alias } from "drizzle-orm/sqlite-core";

import { drizzle } from 'drizzle-orm/d1'

import * as users from './schema/users'

export * from 'drizzle-orm/sql'
import type { cloudflareWorkerTypes } from '@memoize/validators/'

export { users }

export const schema = {
  ...users,
}


// const pool = new Pool({ connectionString: env.POSTGRES_URL });
// export const db = drizzle(pool, { schema });

export const db = drizzle(
  process.env.DATABASE as any as cloudflareWorkerTypes.D1Database,
  { schema },
)