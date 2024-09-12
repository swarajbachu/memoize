'use server'

import { signIn } from '@memoize/auth'

export const signInActionWithCredentials = async (data: {
  name?: string
  email: string
  password: string
}) => {
  const session = await signIn('credentials', data)
  return session
}

export const signInActionWithGoogle = async () => {
  const session = await signIn('google')
  return session
}
