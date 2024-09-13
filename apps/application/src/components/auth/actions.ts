'use server'

import { signIn } from '@memoize/auth'
import { db, eq, users } from '@memoize/db'

export const signInActionWithCredentials = async (data: {
  email: string
  password: string
}) => {
  const user = await db.query.User.findFirst({
    where: eq(users.User.email, data.email),
  })
  if (!user) {
    throw new Error('User not found')
  }

  await signIn('credentials', {
    email: data.email,
    password: data.password,
    redirectTo: '/',
  }).catch((error) => {
    console.log(error)
    throw error
  })
}

export const signInActionWithGoogle = async () => {
  const session = await signIn('google')
  return session
}
