'use client'

import { cn } from '@memoize/ui'
import { Button } from '@memoize/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@memoize/ui/card'
import { useMutation } from '@tanstack/react-query'
import { Loader } from 'lucide-react'
import Link from 'next/link'
import React, { useEffect } from 'react'
import { client } from '~/trpc/hono'

export default function VerifyEmail({
  searchParams,
}: {
  searchParams: { token: string }
}) {
  const { token } = searchParams

  const verifyEmail = useMutation({
    mutationFn: async ({ token }: { token: string }) => {
      const response = await client.auth.verifyEmail.$post({ token })
      return response
    },
  })

  useEffect(() => {
    verifyEmail.mutateAsync({ token })
  }, [])

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <Card className="w-96">
        <CardHeader className="text-center">
          <CardTitle>Email Verification</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center">
          <Button asChild>
            <Link href="/sign-in">Go to Login</Link>
          </Button>
          <div
            className={cn(
              'p-4 rounded-md m-3',
              verifyEmail.isSuccess &&
                'bg-lime-700/30 dark:text-lime-400 text-lime-900',
              verifyEmail.isPending &&
                'bg-blue-700/30 dark:text-blue-400 text-blue-900',
              verifyEmail.isError &&
                'bg-red-700/30 dark:text-red-400 text-red-900',
            )}
          >
            {verifyEmail.isPending && (
              <div>
                <p>Verifying email...</p>
                <Loader className="animate-spin" />
              </div>
            )}
            {verifyEmail.isError && <p>Error verifying email</p>}
            {verifyEmail.isSuccess && <p>Email verified</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
