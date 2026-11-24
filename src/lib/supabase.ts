import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('backend-not-configured')
  return supabase
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

/** POST to a FairSlot API route with the signed-in user's access token. */
export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const client = requireSupabase()
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  })
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string } & Record<string, unknown>
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'request-failed', json.message)
  return json as T
}
