import { invalidateSessionToken } from '@memoize/auth'
import { eq, users } from '@memoize/db'
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
      const checkUser = await ctx.db.query.User.findFirst({
        where: eq(users.User.email, input.email),
      })
      if (checkUser) {
        return c.superjson({ success: false, message: 'User already exists' })
      }
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
  checkUser: publicProcedure
    .input(z.object({ email: z.string() }))
    .mutation(async ({ ctx, input, c }) => {
      const user = await ctx.db.query.User.findFirst({
        where: eq(users.User.email, input.email),
      })
      if (!user) {
        return c.superjson({ success: false })
      }
      return c.superjson({ success: true })
    }),
  checkPassword: publicProcedure
    .input(z.object({ email: z.string(), password: z.string() }))
    .mutation(async ({ ctx, input, c }) => {
      const user = await ctx.db.query.User.findFirst({
        where: eq(users.User.email, input.email),
      })
      if (!user) {
        return c.superjson({ success: false })
      }
      const hashedPassword = await saltAndHashPassword(input.password)
      const passwordMatch = hashedPassword === user.password
      return c.superjson({ success: passwordMatch })
    }),
  signOut: protectedProcedure.mutation(async ({ ctx, c }) => {
    if (ctx.session) {
      return c.superjson({ success: false })
    }
    await invalidateSessionToken(ctx.token)
    return c.superjson({ success: true })
  }),
})
