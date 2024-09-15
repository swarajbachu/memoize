import { db, eq } from '@memoize/db'
import { entries } from '@memoize/db/schema/entries.js'
import { z } from 'zod'
import { router } from '../__internals/router'
import { protectedProcedure } from '../procedure'

export const honoAuthRouter = router({
  createEntry: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        content: z.string(),
      }),
    )
    .mutation(async ({ c, ctx, input }) => {
      if (input.id) {
        const entry = await ctx.db
          .update(entries)
          .set({ content: input.content })
          .where(eq(entries.id, input.id))
          .returning()
        return c.superjson(entry[0])
      }
      const entry = await ctx.db
        .insert(entries)
        .values({
          content: input.content,
          userId: ctx.session.user.id,
        })
        .returning()
      return c.superjson(entry[0])
    }),
})
