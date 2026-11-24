import { describe, expect, it } from 'vitest'
import { decodeCsvBytes, parseParticipantCsv, sanitizeCsvCell, toCsv } from './csv'

describe('csv import', () => {
  it('parses rows, optional email and quoted fields', () => {
    const r = parseParticipantCsv('external_id,display_name,email\n1,"สมชาย, ใจดี",a@b.co\n2,Mali,\n')
    expect(r.hasErrors).toBe(false)
    expect(r.rows).toEqual([
      { externalId: '1', displayName: 'สมชาย, ใจดี', email: 'a@b.co' },
      { externalId: '2', displayName: 'Mali', email: null },
    ])
  })

  it('accepts files without an email column, CRLF and a BOM', () => {
    const r = parseParticipantCsv('\ufeffexternal_id,display_name\r\n1,A\r\n2,B\r\n')
    expect(r.rows.length).toBe(2)
  })

  it('flags duplicate external ids as errors and duplicate names as warnings', () => {
    const r = parseParticipantCsv('external_id,display_name\n1,Same\n1,Other\n2,same\n')
    expect(r.hasErrors).toBe(true)
    expect(r.issues.map((i) => `${i.code}:${i.severity}`).sort()).toEqual([
      'duplicate-display-name:warning',
      'duplicate-external-id:error',
    ])
    // the row with an error is not imported, the name duplicate is kept
    expect(r.rows.map((x) => x.externalId)).toEqual(['1', '2'])
  })

  it('reports missing header, invalid email and empty files', () => {
    expect(parseParticipantCsv('a,b\n1,2').issues[0].code).toBe('missing-header')
    expect(parseParticipantCsv('').issues[0].code).toBe('empty')
    const r = parseParticipantCsv('external_id,display_name,email\n1,A,nope\n')
    expect(r.issues[0].code).toBe('invalid-email')
  })

  it('rejects more than 10,000 rows', () => {
    const body = Array.from({ length: 10_001 }, (_, i) => `${i},N${i}`).join('\n')
    const r = parseParticipantCsv(`external_id,display_name\n${body}`)
    expect(r.issues[0].code).toBe('too-many-rows')
  })

  it('rejects invalid UTF-8 and oversize files', () => {
    expect('error' in decodeCsvBytes(new Uint8Array([0xff, 0xfe, 0xfd]))).toBe(true)
    expect('error' in decodeCsvBytes(new Uint8Array(2 * 1024 * 1024 + 1))).toBe(true)
  })
})

describe('csv export', () => {
  it('neutralizes spreadsheet formulas', () => {
    expect(sanitizeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(sanitizeCsvCell('+66')).toBe("'+66")
    expect(sanitizeCsvCell('@cmd')).toBe("'@cmd")
    expect(sanitizeCsvCell('-1')).toBe("'-1")
    expect(sanitizeCsvCell('safe')).toBe('safe')
    expect(toCsv([['=1+1', 'a"b']])).toBe('\'=1+1,"a""b"')
  })

  it('rejects control characters and bidirectional overrides in fields', () => {
    const tab = parseParticipantCsv('external_id,display_name,email\n1,"Some\tone",\n')
    expect(tab.issues.map((i) => i.code)).toContain('control-characters')
    const newline = parseParticipantCsv('external_id,display_name,email\n1,"Line\nBreak",\n')
    expect(newline.hasErrors).toBe(true)
    const bidi = parseParticipantCsv('external_id,display_name,email\n1,"abc\u202Edef",\n')
    expect(bidi.issues.map((i) => i.code)).toContain('control-characters')
    expect(bidi.rows).toHaveLength(0)
  })
})
