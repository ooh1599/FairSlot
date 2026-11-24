import type { Page, Route } from '@playwright/test'

/**
 * A small in-memory stand-in for the parts of Supabase's REST API that the organizer screens use, so the
 * browser flow can be tested without a Supabase project. It mimics the PostgREST conventions the client relies on
 * (filters, ranges, single-object responses, unique violations) and the defaults the real schema sets.
 */
export const FAKE_SUPABASE_URL = 'http://127.0.0.1:54321'
export const FAKE_USER = { id: '11111111-1111-4111-8111-111111111111', email: 'organizer@example.com' }

type Row = Record<string, unknown>
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function publicEntryId(): string {
  let s = ''
  for (let i = 0; i < 12; i++) {
    s += ALPHABET[Math.floor(Math.random() * 32)]
    if (i === 3 || i === 7) s += '-'
  }
  return s
}

export class FakeDb {
  tables: Record<string, Row[]> = { events: [], entries: [], audit_log: [], winner_followups: [], organizer_wallets: [] }
  requests: string[] = []

  private filter(rows: Row[], params: URLSearchParams): Row[] {
    let out = rows
    for (const [key, value] of params) {
      if (['select', 'order', 'limit', 'offset', 'columns'].includes(key)) continue
      const m = /^(eq|neq|in)\.(.*)$/.exec(value)
      if (!m) continue
      if (m[1] === 'eq') out = out.filter((r) => String(r[key]) === m[2])
      else if (m[1] === 'neq') out = out.filter((r) => String(r[key]) !== m[2])
      else if (m[1] === 'in') {
        const set = m[2].replace(/^\(|\)$/g, '').split(',')
        out = out.filter((r) => set.includes(String(r[key])))
      }
    }
    const order = params.get('order')
    if (order) {
      const [col, dir] = order.split('.')
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === 'desc' ? -1 : 1))
    }
    return out
  }

  async handle(route: Route): Promise<void> {
    const req = route.request()
    const url = new URL(req.url())
    const cors = {
      'access-control-allow-origin': req.headers()['origin'] ?? '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
      'access-control-expose-headers': 'content-range',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    this.requests.push(`${req.method()} ${url.pathname}${url.search}`)

    const path = url.pathname.replace('/rest/v1/', '')
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) })

    if (path.startsWith('rpc/')) return json(200, [])
    const table = this.tables[path]
    if (!table) return json(404, { message: `unknown table ${path}` })

    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const returnsRows = (req.headers()['prefer'] ?? '').includes('return=representation')
    const respond = (rows: Row[], status = 200) => {
      if (wantsObject) {
        if (rows.length !== 1) return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` })
        return json(status, rows[0])
      }
      return json(status, rows, { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' })
    }

    if (req.method() === 'GET' || req.method() === 'HEAD') {
      let rows = this.filter(table, url.searchParams)
      const range = req.headers()['range']
      const m = range ? /^(\d+)-(\d+)$/.exec(range) : null
      const total = rows.length
      if (m) rows = rows.slice(Number(m[1]), Number(m[2]) + 1)
      return json(200, wantsObject ? (rows[0] ?? null) : rows, { 'content-range': `${m ? m[1] : 0}-${Math.max(0, rows.length - 1)}/${total}` })
    }

    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Row | Row[]
      const incoming = Array.isArray(body) ? body : [body]
      const created: Row[] = []
      for (const item of incoming) {
        const row: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...item }
        if (path === 'events') {
          Object.assign(row, { status: 'draft', organizer_wallet: null, manifest_hash: null, manifest_uri: null })
          if (this.tables.events.some((e) => e.public_id === row.public_id)) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint' })
        }
        if (path === 'entries') {
          row.public_entry_id = publicEntryId()
          row.email = row.email ?? null
          if (this.tables.entries.some((e) => e.event_id === row.event_id && e.external_id === row.external_id)) {
            return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "entries_event_id_external_id_key"' })
          }
        }
        created.push(row)
      }
      table.push(...created)
      if (path === 'entries') this.tables.audit_log.push({ id: this.tables.audit_log.length + 1, event_id: created[0]?.event_id, action: 'entries_imported', detail: { count: created.length }, created_at: new Date().toISOString() })
      return returnsRows ? respond(created, 201) : route.fulfill({ status: 201, headers: cors, body: '' })
    }

    if (req.method() === 'PATCH') {
      const patch = req.postDataJSON() as Row
      const rows = this.filter(table, url.searchParams)
      for (const r of rows) Object.assign(r, patch)
      return returnsRows ? respond(rows) : route.fulfill({ status: 204, headers: cors, body: '' })
    }

    if (req.method() === 'DELETE') {
      const rows = this.filter(table, url.searchParams)
      this.tables[path] = table.filter((r) => !rows.includes(r))
      return route.fulfill({ status: 204, headers: cors, body: '' })
    }
    return json(405, { message: 'unsupported' })
  }
}

export async function installFakeSupabase(page: Page): Promise<FakeDb> {
  const db = new FakeDb()
  await page.route(`${FAKE_SUPABASE_URL}/**`, (route) => db.handle(route))
  // A signed-in session, so the app skips the email step.
  await page.addInitScript(
    ([key, user]) => {
      const now = Math.floor(Date.now() / 1000)
      localStorage.setItem(
        key as string,
        JSON.stringify({
          access_token: 'fake.access.token',
          refresh_token: 'fake-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: now + 3600 * 24,
          user: { ...(user as object), aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
        }),
      )
    },
    ['sb-127-auth-token', FAKE_USER],
  )
  return db
}
