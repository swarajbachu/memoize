import { db, eq, users } from '@memoize/db'
import { nanoid } from 'nanoid'

export const getVerificationTokenByEmail = async (email: string) => {
  const token = await db.query.verificationTokens.findFirst({
    where: eq(users.verificationTokens.identifier, email),
  })
  return token
}

export const getVerificationTokenByToken = async (token: string) => {
  const verificationToken = await db.query.verificationTokens.findFirst({
    where: eq(users.verificationTokens.token, token),
  })
  return verificationToken
}

export const generateVerificationToken = async (email: string) => {
  const token = nanoid(6)
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 1) // 1 hour

  const existingToken = await getVerificationTokenByEmail(email)
  if (existingToken) {
    await db
      .delete(users.verificationTokens)
      .where(eq(users.verificationTokens.identifier, email))
  }

  const newToken = await db.insert(users.verificationTokens).values({
    identifier: email,
    token,
    expires,
  })

  return newToken
}
