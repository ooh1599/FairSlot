import type { SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest } from '@vercel/node'
import { describe, expect, it } from 'vitest'
import { clientIp, HttpError, rateLimit, requireUser } from './_lib/server.js'

const req = (headers: Record<string, string>) => ({ headers }) as unknown as VercelRequest
const db = (user: { id: string } | null) =>
  ({ auth: { getUser: () => Promise.resolve(user ? { data: { user }, error: null } : { data: { user: null }, error: new Error('bad') }) } }) as unknown as SupabaseClient

describe('rate limiting and caller identity', () => {
  it('blocks the call after the limit and counts callers separately', () => {
    for (let i = 0; i < 3; i++) rateLimit('t:a', 3, 60_000)
    expect(() => rateLimit('t:a', 3, 60_000)).toThrow(HttpError)
    expect(() => rateLimit('t:b', 3, 60_000)).not.toThrow()
  })

  it('prefers the platform-set client IP over a client-supplied forwarded header', () => {
    expect(clientIp(req({ 'x-vercel-forwarded-for': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.1.1.1')
    expect(clientIp(req({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8' }))).toBe('9.9.9.9')
    expect(clientIp(req({}))).toBe('unknown')
  })

  it('rejects missing and invalid tokens, and throttles a flood from one address', async () => {
    await expect(requireUser(req({ 'x-vercel-forwarded-for': '5.5.5.5' }), db(null))).rejects.toMatchObject({ status: 401 })
    await expect(requireUser(req({ 'x-vercel-forwarded-for': '5.5.5.5', authorization: 'Bearer nope' }), db(null))).rejects.toMatchObject({ status: 401 })
    await expect(requireUser(req({ 'x-vercel-forwarded-for': '6.6.6.6', authorization: 'Bearer ok' }), db({ id: 'u1' }))).resolves.toEqual({ id: 'u1' })
    let last: unknown
    for (let i = 0; i < 125; i++) last = await requireUser(req({ 'x-vercel-forwarded-for': '7.7.7.7' }), db(null)).catch((e: unknown) => e)
    expect(last).toMatchObject({ status: 429 })
  })

  // Keep this last: it fills the shared in-memory table.
  it('never lets a flood of new keys reset an existing caller', () => {
    for (let i = 0; i < 3; i++) rateLimit('victim', 3, 60_000)
    for (let i = 0; i < 6000; i++) rateLimit(`noise:${i}`, 3, 60_000)
    expect(() => rateLimit('victim', 3, 60_000)).toThrow(HttpError)
  })
})
