// Generated by Wrangler on Tue Oct 29 2024 17:14:39 GMT+0700 (Indochina Time)
// by running `wrangler types --env-interface CloudflareEnv env.d.ts`

interface CloudflareEnv {
  "memoize-cache": KVNamespace;
  AUTH_SECRET: string;
  AUTH_GOOGLE_ID: string;
  AUTH_GOOGLE_SECRET: string;
  POSTGRES_URL: string;
  NEXTAUTH_URL: string;
  NEXT_PUBLIC_NEXT_URL: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
  WEBHOOK_SECRET: string;
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: string;
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: string;
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: string;
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: string;
  OPENAI_API_KEY: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_DATABASE_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  BACKEND_SECRET: string;
  NEXT_PUBLIC_ENVIRONMENT: string;
  BACKEND_SECURITY_KEY: string;
  RESEND_API_KEY: string;
  DATABASE: D1Database;
}
