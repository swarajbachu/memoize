import { skipCSRFCheck } from '@auth/core'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import bcrypt from 'bcrypt-edge'
import type {
  DefaultSession,
  NextAuthConfig,
  Session as NextAuthSession,
} from 'next-auth'

import { and, db, eq, users } from '@memoize/db'

import Credentials from '@auth/core/providers/credentials'
import Google from '@auth/core/providers/google'
import { env } from '../env'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}

const adapter = DrizzleAdapter(db, {
  usersTable: users.User,
  accountsTable: users.Account,
  sessionsTable: users.Session,
  verificationTokensTable: users.verificationTokens,
  authenticatorsTable: users.authenticators,
})

export const isSecureContext = env.NEXT_PUBLIC_ENVIRONMENT !== 'development'

export const authConfig = {
  adapter,
  // In development, we need to skip checks to allow Expo to work
  ...(!isSecureContext
    ? {
        skipCSRFCheck: skipCSRFCheck,
        trustHost: true,
      }
    : {}),
  secret: process.env.AUTH_SECRET,
  providers: [
    Google,
    Credentials({
      authorize: async (credentials) => {
        let user = null
        const pass = credentials.password as string

        // logic to salt and hash password
        const email = credentials.email as string

        // logic to verify if the user exists
        user = await getUserFromDb(email)

        console.log(user, 'user found')

        if (!user) {
          // No user found, so this is their first attempt to login
          // meaning this is also the place you could do registration
          throw new Error('User not found.')
        }

        if (!user.password) return null

        const isPasswordValid = bcrypt.compareSync(pass, user.password)
        // Check if the password matches
        if (!isPasswordValid) {
          throw new Error('Incorrect password.')
        }

        // return user object with their profile data
        return user
      },
    }),
  ],
  callbacks: {
    session: (opts) => {
      if (!('user' in opts))
        throw new Error('unreachable with session strategy')

      return {
        ...opts.session,
        user: {
          ...opts.session.user,
          id: opts.user.id,
        },
      }
    },
  },
} satisfies NextAuthConfig

export const validateToken = async (
  token: string,
): Promise<NextAuthSession | null> => {
  const sessionToken = token.slice('Bearer '.length)
  const session = await adapter.getSessionAndUser?.(sessionToken)
  return session
    ? {
        user: {
          ...session.user,
        },
        expires: session.session.expires.toISOString(),
      }
    : null
}

export const invalidateSessionToken = async (token: string) => {
  const sessionToken = token.slice('Bearer '.length)
  await adapter.deleteSession?.(sessionToken)
}

export async function saltAndHashPassword(password: string) {
  // Define the number of salt rounds (higher is more secure but slower)
  const saltRounds = 10

  // Generate the salt and hash the password
  const salt = bcrypt.genSaltSync(saltRounds)
  const hashedPassword = bcrypt.hashSync(password, salt)

  return hashedPassword
}

async function getUserFromDb(email: string) {
  // Logic to get user from database based on email and password hash
  const user = await db.query.User.findFirst({
    where: eq(users.User.email, email),
  })

  return user
}
