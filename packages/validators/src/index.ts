import { z } from 'zod'

import * as cloudflareWorkerTypes from '@cloudflare/workers-types'

export { cloudflareWorkerTypes }

export const unused = z.string().describe(
  `This lib is currently not used as we use drizzle-zod for simple schemas
   But as your application grows and you need other validators to share
   with back and frontend, you can put them in here
  `,
)
