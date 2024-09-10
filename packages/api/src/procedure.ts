import { auth, validateToken } from "@memoize/auth";
import { db } from "@memoize/db";
import { j } from "./__internals/j";

/**
 * Middleware for providing a built-in cache with your Prisma database
 *
 * You can remove this if you don't like it, but caching can massively speed up your database queries.
 */

const timingMiddleware = j.middleware(async ({ next, c }) => {
  const start = Date.now();

  if (c.env.ENVIRONMENT === "development") {
    // artificial delay in dev 100-500ms
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next({ db });

  const end = Date.now();
  console.log(`[HONO] took ${end - start}ms to execute`);
  return result;
});

/**
 * Public (unauthenticated) procedures
 *
 * This is the base piece you use to build new queries and mutations on your API.
 */

export const baseProcedure = j.procedure;

export const publicProcedure = baseProcedure.use(timingMiddleware);

/**
 * Isomorphic Session getter for API requests
 * - Expo requests will have a session token in the Authorization header
 * - Next.js requests will have a session token in cookies
 */
const isomorphicGetSession = async (authToken: string | undefined) => {
  if (authToken) return validateToken(authToken);
  return auth();
};

/**
 * Authenticated procedures
 *
 * This is the base piece you use to build new queries and mutations on your API.
 */

const authMiddleware = j.middleware(async ({ c, next }) => {
  const authToken = c.req.header("Authorization");
  if (!authToken) {
    throw new Error("Unauthorized");
  }
  const session = await isomorphicGetSession(authToken);
  if (!session) {
    throw new Error("Unauthorized");
  }
  return next({ session, db, token: authToken });
});

export const protectedProcedure = baseProcedure
  .use(authMiddleware)
  .use(timingMiddleware);
