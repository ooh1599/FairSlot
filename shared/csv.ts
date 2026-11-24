import { LIMITS } from './limits.js'

export interface ParticipantRow {
  externalId: string
  displayName: string
  email: string | null
}

export type CsvIssueCode =
  | 'file-too-large'
  | 'bad-encoding'
  | 'empty'
  | 'missing-header'
  | 'too-many-rows'
  | 'missing-external-id'
  | 'missing-display-name'
  | 'duplicate-external-id'
  | 'duplicate-display-name'
  | 'invalid-email'
  | 'field-too-long'
  | 'control-characters'
  | 'column-count'

export interface CsvIssue {
  /** 1-based line number in the file (header = line 1), 0 for file-level problems */
  line: number
  code: CsvIssueCode
  severity: 'error' | 'warning'
  detail?: string
}

export interface CsvParseResult {
  rows: ParticipantRow[]
  issues: CsvIssue[]
  hasErrors: boolean
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Control characters (tabs and line breaks included) and bidirectional overrides, which can disguise a name on screen.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]/

/** RFC 4180 style splitter that keeps quoted newlines. Returns rows with the 1-based start line. */
function splitRecords(text: string): { fields: string[]; line: number }[] {
  const records: { fields: string[]; line: number }[] = []
  let field = ''
  let fields: string[] = []
  let inQuotes = false
  let line = 1
  let recordLine = 1
  let sawAny = false
  const endField = () => {
    fields.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    if (!(fields.length === 1 && fields[0] === '' && !sawAny)) records.push({ fields, line: recordLine })
    fields = []
    sawAny = false
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else {
        if (ch === '\n') line++
        field += ch
      }
      continue
    }
    if (ch === '"' && field === '') {
      inQuotes = true
      sawAny = true
    } else if (ch === ',') {
      sawAny = true
      endField()
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRecord()
      line++
      recordLine = line
    } else {
      sawAny = true
      field += ch
    }
  }
  if (field !== '' || fields.length > 0 || sawAny) endRecord()
  return records
}

export function decodeCsvBytes(bytes: Uint8Array): { text: string } | { error: CsvIssue } {
  if (bytes.byteLength > LIMITS.maxCsvBytes) {
    return { error: { line: 0, code: 'file-too-large', severity: 'error', detail: String(bytes.byteLength) } }
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text }
  } catch {
    return { error: { line: 0, code: 'bad-encoding', severity: 'error' } }
  }
}

/** Parses and validates a participant CSV (columns: external_id, display_name, email). */
export function parseParticipantCsv(rawText: string): CsvParseResult {
  const issues: CsvIssue[] = []
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText
  if (text.length > LIMITS.maxCsvBytes) {
    return { rows: [], issues: [{ line: 0, code: 'file-too-large', severity: 'error' }], hasErrors: true }
  }
  const records = splitRecords(text)
  if (records.length === 0) {
    return { rows: [], issues: [{ line: 0, code: 'empty', severity: 'error' }], hasErrors: true }
  }
  const header = records[0].fields.map((h) => h.trim().toLowerCase())
  const ixId = header.indexOf('external_id')
  const ixName = header.indexOf('display_name')
  const ixEmail = header.indexOf('email')
  if (ixId < 0 || ixName < 0) {
    return { rows: [], issues: [{ line: 1, code: 'missing-header', severity: 'error' }], hasErrors: true }
  }
  const dataRecords = records.slice(1)
  if (dataRecords.length > LIMITS.maxParticipants) {
    return {
      rows: [],
      issues: [{ line: 0, code: 'too-many-rows', severity: 'error', detail: String(dataRecords.length) }],
      hasErrors: true,
    }
  }

  const rows: ParticipantRow[] = []
  const seenIds = new Map<string, number>()
  const seenNames = new Map<string, number>()
  for (const rec of dataRecords) {
    const get = (ix: number) => (ix >= 0 ? (rec.fields[ix] ?? '').normalize('NFC').trim() : '')
    const externalId = get(ixId)
    const displayName = get(ixName)
    const email = get(ixEmail)
    if (rec.fields.length > header.length) {
      issues.push({ line: rec.line, code: 'column-count', severity: 'error' })
      continue
    }
    if (rec.fields.every((f) => f.trim() === '')) continue
    let rowOk = true
    if (!externalId) {
      issues.push({ line: rec.line, code: 'missing-external-id', severity: 'error' })
      rowOk = false
    }
    if (!displayName) {
      issues.push({ line: rec.line, code: 'missing-display-name', severity: 'error' })
      rowOk = false
    }
    if (
      externalId.length > LIMITS.maxExternalIdLength ||
      displayName.length > LIMITS.maxNameLength ||
      email.length > LIMITS.maxEmailLength
    ) {
      issues.push({ line: rec.line, code: 'field-too-long', severity: 'error' })
      rowOk = false
    }
    if (CONTROL.test(externalId) || CONTROL.test(displayName) || CONTROL.test(email)) {
      issues.push({ line: rec.line, code: 'control-characters', severity: 'error' })
      rowOk = false
    }
    if (email && !EMAIL.test(email)) {
      issues.push({ line: rec.line, code: 'invalid-email', severity: 'error' })
      rowOk = false
    }
    if (externalId) {
      const first = seenIds.get(externalId)
      if (first !== undefined) {
        issues.push({ line: rec.line, code: 'duplicate-external-id', severity: 'error', detail: `line ${first}` })
        rowOk = false
      } else seenIds.set(externalId, rec.line)
    }
    if (displayName) {
      const key = displayName.toLocaleLowerCase()
      const first = seenNames.get(key)
      if (first !== undefined) {
        // Warn only: two people can share a name. Never removed automatically.
        issues.push({ line: rec.line, code: 'duplicate-display-name', severity: 'warning', detail: `line ${first}` })
      } else seenNames.set(key, rec.line)
    }
    if (rowOk) rows.push({ externalId, displayName, email: email || null })
  }
  return { rows, issues, hasErrors: issues.some((i) => i.severity === 'error') }
}

/** Neutralizes spreadsheet formulas: a cell that starts with = + - @ tab or CR gets a leading apostrophe. */
export function sanitizeCsvCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const safe = sanitizeCsvCell(cell)
          return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
        })
        .join(','),
    )
    .join('\r\n')
}
