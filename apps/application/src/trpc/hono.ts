import type { AppType } from '@memoize/api/hono'
import { hc } from 'hono/client'
import { HTTPException } from 'hono/http-exception'
import type { StatusCode } from 'hono/utils/http-status'
import superjson from 'superjson'

const getBaseUrl = () => {
  return process.env.NEXT_PUBLIC_NEXT_URL ?? 'https://app.memoize.co'
}

console.log(getBaseUrl(), 'getBaseUrl')

export const baseClient = hc<AppType>(getBaseUrl(), {
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, { ...init })

    if (!response.ok) {
      throw new HTTPException(response.status as StatusCode, {
        message: response.statusText,
        res: response,
      })
    }

    const serializedJson = await response.text()
    const deserializedJson = superjson.parse(serializedJson)

    const superJSONResponse = new Response(JSON.stringify(deserializedJson), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })

    Object.defineProperty(superJSONResponse, 'json', {
      value: async () => deserializedJson,
    })

    return superJSONResponse
  },
}).api.hono

function getHandler(obj: Object, ...keys: string[]) {
  let current = obj
  for (const key of keys) {
    current = current[key as keyof typeof current]
  }
  return current as Function
}

function serializeWithSuperJSON(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data
  }
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      superjson.stringify(value),
    ]),
  )
}

/**
 * This is an optional convenience proxy to pass data directly to your API
 * instead of using nested objects as hono does by default
 */
function createProxy(target: any, path: string[] = []): any {
  return new Proxy(target, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        const newPath = [...path, prop]

        if (prop === '$get') {
          return async (...args: any[]) => {
            const executor = getHandler(baseClient, ...newPath)
            const serializedQuery = serializeWithSuperJSON(args[0])
            return executor({ query: serializedQuery })
          }
        }

        if (prop === '$post') {
          return async (...args: any[]) => {
            const executor = getHandler(baseClient, ...newPath)
            const serializedJson = serializeWithSuperJSON(args[0])
            return executor({ json: serializedJson })
          }
        }

        return createProxy(target[prop], newPath)
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

export const client: typeof baseClient = createProxy(baseClient)
