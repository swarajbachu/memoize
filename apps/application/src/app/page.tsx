import { auth } from '@memoize/auth'
import { client } from '~/trpc/hono'
import { HydrateClient } from '~/trpc/server'
import { AuthShowcase } from './_components/auth-showcase'

export const runtime = 'edge'

export default async function HomePage() {
  // You can await this here if you don't want to show Suspense fallback below
  const res = await client.test.testRoute.$get()
  const test = await res.json()

  return (
    <>
      <main className="container h-screen py-16">
        <div className="flex flex-col items-center justify-center gap-4">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            Create <span className="text-primary">T3</span> Turbo
          </h1>
          <AuthShowcase />
          {test.message}
          <div className="w-full max-w-2xl overflow-y-scroll">cool</div>
        </div>
      </main>
    </>
  )
}
