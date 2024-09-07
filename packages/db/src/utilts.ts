import { customAlphabet, nanoid } from 'nanoid'
import { z } from 'zod'

export const uniqueIds = z.enum(['user', 'account', 'session'])
export type UniqueIdsType = z.infer<typeof uniqueIds>
export function createUniqueIds(
  id: UniqueIdsType,
  length?: number,
  custom?: boolean,
) {
  if (custom) {
    const nanoid = customAlphabet('-abcdefghijklmnopqrstuvwxyz1234567890', 14)
    return `${id}-${nanoid()}`
  }
  return `${id}_${nanoid(length ? length : 11)}`
}
