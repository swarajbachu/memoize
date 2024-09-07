import { HydrateClient } from '~/trpc/server'
import { AuthShowcase } from './_components/auth-showcase'

export const runtime = 'edge'

export default function HomePage() {
  // You can await this here if you don't want to show Suspense fallback below

  return (
    <HydrateClient>
      <main className="container h-screen py-16">
        <div className="flex flex-col items-center justify-center gap-4">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            Create <span className="text-primary">T3</span> Turbo
          </h1>
          <AuthShowcase />

          <div className="w-full max-w-2xl overflow-y-scroll">cool</div>
        </div>
      </main>
    </HydrateClient>
  )
}
