import { invalidateSessionToken, signIn } from '@memoize/auth'
import { eq, users } from '@memoize/db'
import bcrypt from 'bcrypt-edge'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { router } from '../__internals/router'
import {
  generateVerificationToken,
  getVerificationTokenByToken,
} from '../handlers/auth/tokens'
import { sendVerificationToken } from '../handlers/mail/auth'
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
      const user = await ctx.db.query.User.findFirst({
        where: eq(users.User.email, input.email),
      })
      const hashedPassword = await saltAndHashPassword(input.password)
      // biome-ignore lint/complexity/useOptionalChain: <explanation>
      if (user && user.password) {
        return c.superjson({ success: false, message: 'User already exists' })
      }

      if (user && !user.password) {
        // basically if the user exists but the password is not set ( who might have used oauth to sign up), we set it
        await ctx.db
          .update(users.User)
          .set({
            password: hashedPassword,
          })
          .where(eq(users.User.email, input.email))
        return c.superjson({
          success: true,
          message: 'successfully updated password',
        })
      }
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

      const token = await generateVerificationToken(input.email)
      await sendVerificationToken(input.email, token)
      return c.superjson({ success: true, message: 'verification token sent' })
    }),
  signInUser: publicProcedure
    .input(z.object({ email: z.string(), password: z.string() }))
    .mutation(async ({ ctx, input, c }) => {
      const user = await ctx.db.query.User.findFirst({
        where: eq(users.User.email, input.email),
      })
      if (!user) {
        throw new Error('User not found')
      }

      if (!user.emailVerified) {
        const token = await generateVerificationToken(input.email)
        await sendVerificationToken(input.email, token)
        return c.superjson({
          success: true,
          message: 'confirmation email sent, please check your email',
          redirect: false,
        })
      }
      await signIn('credentials', {
        email: input.email,
        password: input.password,
        redirect: false,
      }).catch((error) => {
        console.log(error)
        throw error
      })

      return c.superjson({
        success: true,
        message: 'login successful',
        redirect: true,
      })
    }),
  verifyEmail: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input, c }) => {
      const token = await getVerificationTokenByToken(input.token)
      if (!token) {
        return c.superjson({ success: false, message: 'invalid token' })
      }
      const isTokenExpired = token.expires < new Date()
      if (isTokenExpired) {
        return c.superjson({ success: false, message: 'token expired' })
      }
      await ctx.db
        .update(users.User)
        .set({ emailVerified: new Date() })
        .where(eq(users.User.email, token.identifier))
      return c.superjson({ success: true, message: 'email verified' })
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
        return c.superjson({ success: false, message: 'user not found' })
      }
      if (!user.password) {
        return c.superjson({
          success: false,
          message: 'Please sign in with oauth',
        })
      }
      const hashedPassword = await saltAndHashPassword(input.password)
      const passwordMatch = bcrypt.compareSync(hashedPassword, user.password)
      return c.superjson({ success: passwordMatch, message: 'success' })
    }),
  signOut: protectedProcedure.mutation(async ({ ctx, c }) => {
    if (ctx.session) {
      return c.superjson({ success: false })
    }
    await invalidateSessionToken(ctx.token)
    return c.superjson({ success: true })
  }),
})
