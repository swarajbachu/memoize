import { httpHandler } from '@memoize/api/hono'

export const runtime = 'edge'
export { httpHandler as GET, httpHandler as POST }
