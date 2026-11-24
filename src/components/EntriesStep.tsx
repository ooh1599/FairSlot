import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, FileUp, Pencil, Plus, Search, Trash2, X, Check } from 'lucide-react'
import { decodeCsvBytes, parseParticipantCsv, toCsv, type CsvIssue, type CsvParseResult } from '@shared/csv'
import { LIMITS } from '@shared/limits'
import { useI18n, type MessageKey } from '@/i18n'
import { useAudit, useEntries, type DbEntry, type DbEvent } from '@/hooks/data'
import { requireSupabase } from '@/lib/supabase'
import { formatBangkok } from '@/lib/time'
import { Alert, Badge, EmptyState, Mono, PageLoading, Spinner } from './ui'

const PAGE = 25
const BATCH = 500

const ISSUE_KEY: Record<CsvIssue['code'], MessageKey> = {
  'file-too-large': 'csv.issue.fileTooLarge',
  'bad-encoding': 'csv.issue.badEncoding',
  empty: 'csv.issue.empty',
  'missing-header': 'csv.issue.missingHeader',
  'too-many-rows': 'csv.issue.tooManyRows',
  'missing-external-id': 'csv.issue.missingExternalId',
  'missing-display-name': 'csv.issue.missingDisplayName',
  'duplicate-external-id': 'csv.issue.duplicateExternalId',
  'duplicate-display-name': 'csv.issue.duplicateDisplayName',
  'invalid-email': 'csv.issue.invalidEmail',
  'field-too-long': 'csv.issue.fieldTooLong',
  'control-characters': 'csv.issue.controlCharacters',
  'column-count': 'csv.issue.columnCount',
}

export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function EntriesStep({ event }: { event: DbEvent }) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const entries = useEntries(event.id)
  const audit = useAudit(event.id)
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<CsvParseResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ external_id: '', display_name: '', email: '' })
  const [manual, setManual] = useState({ external_id: '', display_name: '', email: '' })

  const all = useMemo(() => entries.data ?? [], [entries.data])
  const refresh = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['entries', event.id] }), queryClient.invalidateQueries({ queryKey: ['audit', event.id] })])
  }

  const nameCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of all) m.set(e.display_name.toLocaleLowerCase(), (m.get(e.display_name.toLocaleLowerCase()) ?? 0) + 1)
    return m
  }, [all])
  const duplicateNames = useMemo(() => [...nameCounts.values()].filter((n) => n > 1).length, [nameCounts])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((e) => [e.display_name, e.external_id, e.public_entry_id, e.email ?? ''].some((v) => v.toLowerCase().includes(q)))
  }, [all, query])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE))
  const visible = filtered.slice(page * PAGE, page * PAGE + PAGE)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMessage(null)
    setFileName(file.name)
    const decoded = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()))
    if ('error' in decoded) setParsed({ rows: [], issues: [decoded.error], hasErrors: true })
    else setParsed(parseParticipantCsv(decoded.text))
  }

  const importRows = async () => {
    if (!parsed) return
    setBusy(true)
    setMessage(null)
    const existing = new Set(all.map((x) => x.external_id))
    const fresh = parsed.rows.filter((r) => !existing.has(r.externalId))
    const skipped = parsed.rows.length - fresh.length
    if (all.length + fresh.length > LIMITS.maxParticipants) {
      setBusy(false)
      setMessage({ tone: 'error', text: t('entries.tooMany', { max: LIMITS.maxParticipants }) })
      return
    }
    const db = requireSupabase()
    for (let i = 0; i < fresh.length; i += BATCH) {
      const chunk = fresh.slice(i, i + BATCH).map((r) => ({ event_id: event.id, external_id: r.externalId, display_name: r.displayName, email: r.email }))
      const { error } = await db.from('entries').insert(chunk)
      if (error) {
        setBusy(false)
        await refresh()
        setMessage({ tone: 'error', text: t('entries.importFailed', { done: i }) })
        return
      }
    }
    setBusy(false)
    setParsed(null)
    setFileName('')
    await refresh()
    setMessage({ tone: 'success', text: t('entries.imported', { count: fresh.length, skipped }) })
  }

  const addManual = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const external = manual.external_id.trim() || `manual-${crypto.randomUUID().slice(0, 8)}`
    const { error } = await requireSupabase().from('entries').insert({ event_id: event.id, external_id: external, display_name: manual.display_name.trim(), email: manual.email.trim() || null })
    setBusy(false)
    if (error) {
      setMessage({ tone: 'error', text: error.code === '23505' ? t('entries.duplicateId') : t('entries.saveFailed') })
      return
    }
    setManual({ external_id: '', display_name: '', email: '' })
    await refresh()
  }

  const saveEdit = async (entry: DbEntry) => {
    const { error } = await requireSupabase().from('entries').update({ external_id: draft.external_id.trim(), display_name: draft.display_name.trim(), email: draft.email.trim() || null }).eq('id', entry.id)
    if (error) {
      setMessage({ tone: 'error', text: error.code === '23505' ? t('entries.duplicateId') : t('entries.saveFailed') })
      return
    }
    setEditing(null)
    await refresh()
  }

  const remove = async (entry: DbEntry) => {
    if (!window.confirm(t('entries.confirmDelete', { name: entry.display_name }))) return
    const { error } = await requireSupabase().from('entries').delete().eq('id', entry.id)
    if (error) setMessage({ tone: 'error', text: t('entries.saveFailed') })
    await refresh()
  }

  const exportCsv = () => {
    download(`${event.public_id}-entries.csv`, toCsv([['public_entry_id', 'external_id', 'display_name', 'email'], ...all.map((e) => [e.public_entry_id, e.external_id, e.display_name, e.email ?? ''])]))
  }

  const issues = parsed?.issues ?? []
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <h2 className="text-xl font-semibold">{t('entries.importTitle')}</h2>
        <p className="text-sm text-navy-600 text-pretty">{t('entries.importBody')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" id="csv" onChange={(e) => void onFile(e)} />
          <label htmlFor="csv" className="btn-ghost cursor-pointer">
            <FileUp className="h-4 w-4" aria-hidden />
            {t('entries.chooseFile')}
          </label>
          {fileName && <Mono>{fileName}</Mono>}
          <button type="button" className="btn-ghost" onClick={() => download('fairslot-template.csv', toCsv([['external_id', 'display_name', 'email'], ['001', 'Somchai Jaidee', 'somchai@example.com']]))}>
            <Download className="h-4 w-4" aria-hidden />
            {t('entries.template')}
          </button>
        </div>
        {parsed && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t('entries.preview', { valid: parsed.rows.length, errors: errors.length, warnings: warnings.length })}</p>
            {errors.length > 0 && (
              <Alert tone="error" title={t('entries.errorsTitle')}>
                <ul className="list-disc pl-4">
                  {errors.slice(0, 20).map((i, k) => (
                    <li key={k}>
                      {i.line > 0 && <span className="mono">{t('csv.line', { n: i.line })} </span>}
                      {t(ISSUE_KEY[i.code])}
                    </li>
                  ))}
                </ul>
                {errors.length > 20 && <p>{t('csv.more', { n: errors.length - 20 })}</p>}
                <p className="mt-1 font-medium">{t('entries.errorsSkipped')}</p>
              </Alert>
            )}
            {warnings.length > 0 && (
              <Alert tone="warn" title={t('entries.warningsTitle')}>
                {t('entries.warningsBody', { n: warnings.length })}
              </Alert>
            )}
            <button type="button" className="btn-primary" disabled={busy || parsed.rows.length === 0} onClick={() => void importRows()}>
              {busy && <Spinner />}
              {t('entries.importCta', { count: parsed.rows.length })}
            </button>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">{t('entries.addTitle')}</h2>
        <form onSubmit={(e) => void addManual(e)} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_1.4fr_auto]">
          <input className="input" aria-label={t('entries.externalId')} placeholder={t('entries.externalId')} value={manual.external_id} onChange={(e) => setManual({ ...manual, external_id: e.target.value })} maxLength={LIMITS.maxExternalIdLength} />
          <input className="input" required aria-label={t('entries.name')} placeholder={t('entries.name')} value={manual.display_name} onChange={(e) => setManual({ ...manual, display_name: e.target.value })} maxLength={LIMITS.maxNameLength} />
          <input className="input" type="email" aria-label={t('entries.email')} placeholder={t('entries.emailOptional')} value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
          <button className="btn-teal" disabled={busy || !manual.display_name.trim()}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('common.add')}
          </button>
        </form>
      </section>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{t('entries.listTitle')}</h2>
            <Badge tone="info">{all.length.toLocaleString()}</Badge>
            {duplicateNames > 0 && <Badge tone="warn">{t('entries.dupNames', { n: duplicateNames })}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" aria-hidden />
              <input className="input pl-9" aria-label={t('common.search')} placeholder={t('common.search')} value={query} onChange={(e) => { setQuery(e.target.value); setPage(0) }} />
            </div>
            <button type="button" className="btn-ghost" onClick={exportCsv} disabled={all.length === 0}>
              <Download className="h-4 w-4" aria-hidden />
              CSV
            </button>
          </div>
        </div>
        {entries.isLoading && <PageLoading label={t('common.loading')} />}
        {entries.data && all.length === 0 && <EmptyState title={t('entries.emptyTitle')} body={t('entries.emptyBody')} />}
        {visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-navy-500">
                <tr>
                  <th className="py-2 pr-3">{t('entries.publicId')}</th>
                  <th className="py-2 pr-3">{t('entries.externalId')}</th>
                  <th className="py-2 pr-3">{t('entries.name')}</th>
                  <th className="py-2 pr-3">{t('entries.email')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((en) => {
                  const dup = (nameCounts.get(en.display_name.toLocaleLowerCase()) ?? 0) > 1
                  const isEditing = editing === en.id
                  return (
                    <tr key={en.id} className="border-t border-navy-100 align-middle">
                      <td className="py-2 pr-3"><Mono>{en.public_entry_id}</Mono></td>
                      {isEditing ? (
                        <>
                          <td className="py-2 pr-3"><input className="input" aria-label={t('entries.externalId')} value={draft.external_id} onChange={(e) => setDraft({ ...draft, external_id: e.target.value })} /></td>
                          <td className="py-2 pr-3"><input className="input" aria-label={t('entries.name')} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} /></td>
                          <td className="py-2 pr-3"><input className="input" aria-label={t('entries.email')} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></td>
                          <td className="whitespace-nowrap py-2 text-right">
                            <button type="button" className="btn-ghost !min-h-[36px] !px-2" aria-label={t('common.save')} onClick={() => void saveEdit(en)}><Check className="h-4 w-4" aria-hidden /></button>
                            <button type="button" className="btn-ghost !min-h-[36px] !px-2" aria-label={t('common.cancel')} onClick={() => setEditing(null)}><X className="h-4 w-4" aria-hidden /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-3">{en.external_id}</td>
                          <td className="py-2 pr-3">{en.display_name} {dup && <Badge tone="warn">{t('entries.sameName')}</Badge>}</td>
                          <td className="py-2 pr-3 text-navy-600">{en.email ?? '-'}</td>
                          <td className="whitespace-nowrap py-2 text-right">
                            <button type="button" className="btn-ghost !min-h-[36px] !px-2" aria-label={t('common.edit')} onClick={() => { setEditing(en.id); setDraft({ external_id: en.external_id, display_name: en.display_name, email: en.email ?? '' }) }}><Pencil className="h-4 w-4" aria-hidden /></button>
                            <button type="button" className="btn-danger !min-h-[36px] !px-2" aria-label={t('common.delete')} onClick={() => void remove(en)}><Trash2 className="h-4 w-4" aria-hidden /></button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between text-sm">
            <button type="button" className="btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('common.prev')}</button>
            <span className="tabular-nums">{page + 1} / {pageCount}</span>
            <button type="button" className="btn-ghost" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>{t('common.next')}</button>
          </div>
        )}
      </section>

      {audit.data && audit.data.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold">{t('audit.title', { n: audit.data.length })}</summary>
          <ul className="mt-3 space-y-1 text-sm text-navy-600">
            {audit.data.map((a) => (
              <li key={a.id}>
                <span className="mono">{formatBangkok(a.created_at, lang)}</span> · {a.action}{' '}
                {typeof a.detail.count === 'number' ? `(${a.detail.count})` : typeof a.detail.publicEntryId === 'string' ? `(${a.detail.publicEntryId})` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
