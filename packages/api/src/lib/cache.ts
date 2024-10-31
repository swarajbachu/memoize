import type { createTRPCContext } from "../trpc";

/**
 * A function type that returns a promise of a generic type T.
 */
type CacheAbleFunction<T> = () => Promise<T>;

console.log("NODE_ENV", process.env.NODE_ENV);

/**
 * A utility function to handle caching logic. It attempts to retrieve a value from the cache
 * using a specified tag. If the value is not found, it executes a provided function to obtain
 * the value, stores it in the cache, and then returns it.
 *
 * @param ctx - The context object containing the cache instance.
 * @param tag - A string used as the key to store/retrieve the cached value.
 * @param cacheAbleFunction - A function that returns a promise of the value to be cached.
 * @param cachePutOptions - Optional settings for storing the value in the cache.
 * @returns A promise that resolves to the cached value or the result of the cacheAbleFunction.
 */
export async function withCache<T>(
  ctx: Awaited<ReturnType<typeof createTRPCContext>>,
  tag: string,
  cacheAbleFunction: CacheAbleFunction<T>,
  cachePutOptions?: KVNamespacePutOptions,
): Promise<T | null> {
  // Try to get the value from the cache
  const value = await ctx.cache.get(tag);

  if (value) {
    // If value exists in cache, parse and return it
    return JSON.parse(value) as T;
  }

  // No cache hit, call the provided function
  const result = await cacheAbleFunction();
  //   console.log(result, JSON.stringify(result), "result", tag);
  if (result && result !== null) {
    await ctx.cache.put(tag, JSON.stringify(result), {
      ...cachePutOptions,
    });
  }
  return result;
}

// cacheTagManager.ts
type CacheTagDefinition = {
  [key: string]: { value: string; requiresSuffix: boolean };
};

type CacheTagMethods<
  T extends CacheTagDefinition,
  UserId extends string | null,
> = {
  [K in keyof T]: T[K]["requiresSuffix"] extends true
    ? UserId extends string
      ? (suffix?: string) => string
      : (suffix: string) => string
    : () => string;
};

export function createCacheTagManager<
  T extends CacheTagDefinition,
  UserId extends string | null,
>(cacheTags: T, userId: UserId): CacheTagMethods<T, UserId> {
  const manager = {} as CacheTagMethods<T, UserId>;

  for (const tag in cacheTags) {
    const cacheTag = cacheTags[tag];
    if (cacheTag?.requiresSuffix) {
      manager[tag] = ((suffix?: string) => {
        if (!suffix) {
          throw new Error(`Suffix is required for '${tag}' tag`);
        }
        return `${cacheTag.value}:${suffix}:${userId}`;
      }) as CacheTagMethods<T, UserId>[typeof tag];
    } else {
      manager[tag] = (() => {
        return `${cacheTag?.value}:${userId}`;
      }) as CacheTagMethods<T, UserId>[typeof tag];
    }
  }

  return manager;
}
