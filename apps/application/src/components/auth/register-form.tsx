'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { signIn } from '@memoize/auth'
import { cn } from '@memoize/ui'
import { Alert, AlertDescription, AlertTitle } from '@memoize/ui/alert'
import { Button } from '@memoize/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@memoize/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@memoize/ui/form'
import { Input } from '@memoize/ui/input'
import { Separator } from '@memoize/ui/separator'
import { type RegisterType, registerSchema } from '@memoize/validators/auth'
import { useMutation } from '@tanstack/react-query'
import { Github, Loader } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { client } from '~/trpc/hono'
import { signInActionWithCredentials, signInActionWithGoogle } from './actions'
import { PasswordInput } from './password-input'

export default function RegisterForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [formStatus, setFormStatus] = useState<{
    type: 'error' | 'success' | null
    message: string | null
  }>({ type: null, message: null })

  const form = useForm<RegisterType>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      name: '',
    },
  })

  const createUser = useMutation({
    mutationFn: async ({
      name,
      password,
      email,
    }: {
      name: string
      password: string
      email: string
    }) => {
      await client.auth.registerUser.$post({ name, password, email })
    },
    onSuccess: async () => {
      form.reset()
    },
  })

  async function onSubmit(data: RegisterType) {
    setIsLoading(true)
    setFormStatus({ type: null, message: null })

    try {
      // Simulate API call
      // await new Promise((resolve) => setTimeout(resolve, 2000))
      await createUser.mutateAsync({
        email: data.email,
        password: data.password,
        name: data.name,
      })
      // Simulated success
      setFormStatus({
        type: 'success',
        message: 'Login successful! Redirecting...',
      })
    } catch (error) {
      console.log(error)
      setFormStatus({
        type: 'error',
        message: 'Invalid credentials. Please try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-[400px] shadow-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">
          Welcome Back
        </CardTitle>
        <CardDescription className="text-center">
          Login or sign up to continue
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-1">
          <Button
            variant="outline"
            disabled={isLoading}
            onClick={() => {
              signInActionWithGoogle().catch(console.error)
            }}
          >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: <explanation> */}
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
              <path d="M1 1h22v22H1z" fill="none" />
            </svg>
            Google
          </Button>
          <Button
            variant="outline"
            onClick={() => signIn('google').catch(console.error)}
          >
            <Github className="mr-2 h-4 w-4" /> Github
          </Button>
        </div>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="name"
                      placeholder="whizzy"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="whizzy@example.com"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      placeholder="********"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader className="mr-2 h-4 w-4 animate-spin" />
                  Registering...
                </>
              ) : (
                'Register'
              )}
            </Button>
          </form>
        </Form>
        {formStatus.type && (
          <Alert
            variant={formStatus.type === 'error' ? 'destructive' : 'default'}
            className={cn(
              'mt-4',
              formStatus.type === 'success' && 'bg-green-700/20 text-green-700',
            )}
          >
            <AlertTitle>
              {formStatus.type === 'error' ? 'Error' : 'Success'}
            </AlertTitle>
            <AlertDescription>{formStatus.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-sm text-center w-full text-muted-foreground">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-primary hover:underline">
            Sign In
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
