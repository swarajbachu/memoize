import { invalidateSessionToken, saltAndHashPassword } from '@memoize/auth'
import type { TRPCRouterRecord } from '@trpc/server'

import { users } from '@memoize/db'
import { z } from 'zod'
import { protectedProcedure, publicProcedure } from '../trpc'

export const authRouter = {
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session
  }),
  getSecretMessage: protectedProcedure.query(() => {
    return 'you can see this secret message!'
  }),
  // registerUser: publicProcedure
  //   .input(
  //     z.object({ name: z.string(), password: z.string(), email: z.string() })
  //   )
  //   .mutation(async ({ ctx, input }) => {
  //     const hashedPassword = await saltAndHashPassword(input.password);
  //     await ctx.db.insert(users.User).values({
  //       name: input.name,
  //       email: input.email,
  //       password: hashedPassword,
  //     });
  //   }),
  signOut: protectedProcedure.mutation(async (opts) => {
    if (!opts.ctx.token) {
      return { success: false }
    }
    await invalidateSessionToken(opts.ctx.token)
    return { success: true }
  }),
} satisfies TRPCRouterRecord
