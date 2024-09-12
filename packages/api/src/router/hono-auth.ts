import { invalidateSessionToken } from '@memoize/auth'
import { users } from '@memoize/db'
import { z } from 'zod'
import { router } from '../__internals/router'
import { protectedProcedure, publicProcedure } from '../procedure'
import { saltAndHashPassword } from '../utils/password'

export const honoAuthRouter = router({
  getSession: protectedProcedure.query(({ ctx, c }) => {
    return c.superjson(ctx.session)
  }),
  getSecretMessage: protectedProcedure.query((c) => {
    return c.c.superjson('you can see this secret message!')
  }),
  registerUser: publicProcedure
    .input(
      z.object({ name: z.string(), password: z.string(), email: z.string() }),
    )
    .mutation(async ({ c, ctx, input }) => {
      const hashedPassword = await saltAndHashPassword(input.password)
      await ctx.db
        .insert(users.User)
        .values({
          name: input.name,
          email: input.email,
          password: hashedPassword,
        })
        .then((res) => {
          console.log(res)
        })
        .catch((err) => {
          console.log(err)
          return c.superjson({ success: false })
        })
      return c.superjson({ success: true })
    }),
  signOut: protectedProcedure.mutation(async ({ ctx, c }) => {
    if (ctx.session) {
      return c.superjson({ success: false })
    }
    await invalidateSessionToken(ctx.token)
    return c.superjson({ success: true })
  }),
})
