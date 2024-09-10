import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handle } from 'hono/vercel'
import { honoAuthRouter } from './router/hono-auth'
import { honoTestRouter } from './router/test'

const app = new Hono().basePath('/api/hono/').use(cors())

/**
 * This is the primary router for your server.
 *
 * All routers added in /server/routers should be manually added here.
 */

const appRouter = app
  .route('/auth', honoAuthRouter)
  .route('/test', honoTestRouter)

// The handler Next.js uses to answer API requests
export const httpHandler = handle(app)

/**
 * (Optional)
 * Exporting our API here for easy deployment
 *
 * Run `npm run deploy` for one-click API deployment to Cloudflare's edge network
 */
export default app

// export type definition of API
export type AppType = typeof appRouter
