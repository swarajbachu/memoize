import type { Config } from 'drizzle-kit'

import fs from 'node:fs'
import path from 'node:path'

function getLocalD1DB() {
  try {
    const basePath = path.resolve('../../apps/application/.wrangler')
    const dbFile = fs
      .readdirSync(basePath, { encoding: 'utf-8', recursive: true })
      .find((f) => f.endsWith('.sqlite'))

    if (!dbFile) {
      throw new Error(`.sqlite file not found in ${basePath}`)
    }

    const url = path.resolve(basePath, dbFile)
    return url
  } catch (err) {
    console.log(`Error  ${err}`)
  }
}

console.log(getLocalD1DB(), process.env.NODE_ENV, 'local path')

// if (
//   !process.env.CLOUDFLARE_ACCOUNT_ID ||
//   !process.env.CLOUDFLARE_DATABASE_ID ||
//   !process.env.CLOUDFLARE_API_TOKEN
// ) {
//   throw new Error('database config variables are required in the environment')
// }

export default {
  schema: './src/schema/*',
  dialect: 'sqlite',
  ...(process.env.NODE_ENV === 'production'
    ? {
        driver: 'd1-http',
        dbCredentials: {
          accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
          databaseId: process.env.CLOUDFLARE_DATABASE_ID,
          token: process.env.CLOUDFLARE_API_TOKEN,
        },
      }
    : {
        dbCredentials: {
          url: getLocalD1DB(),
        },
      }),
  out: 'migrations',
} satisfies Config
