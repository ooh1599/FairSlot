import { thApp } from './th.app'
import { thFlow } from './th.flow'

/** Thai is the primary language and defines the key set. English lives in en.ts and must have every key. */
export const th = { ...thApp, ...thFlow } as const
