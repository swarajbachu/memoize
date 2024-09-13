'use server'

import { signIn } from '@memoize/auth'

export const signInActionWithCredentials = async (data: {
  email: string
  password: string
}) => {
  const session = await signIn('credentials', {
    email: data.email,
    password: data.password,
    redirectTo: '/',
  }).catch((error) => {
    console.log(error)
    throw error
  })
  return session
}

export const signInActionWithGoogle = async () => {
  const session = await signIn('google')
  return session
}
