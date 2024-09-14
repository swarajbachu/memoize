import { auth } from '@memoize/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@memoize/ui/card'
import { client } from '~/trpc/hono'
import { HydrateClient } from '~/trpc/server'
import { AuthShowcase } from '../_components/auth-showcase'

export const runtime = 'edge'

export default async function HomePage() {
  // You can await this here if you don't want to show Suspense fallback below
  const res = await client.test.testRoute.$get()
  const test = await res.json()

  return (
    <>
      <main className="h-[200vh] py-16">
        <Card className="w-full">
          <CardHeader>
            <h1>Hello</h1>
          </CardHeader>
          <CardContent>
            <AuthShowcase />
            {test.message}
          </CardContent>
        </Card>
      </main>
    </>
  )
}
