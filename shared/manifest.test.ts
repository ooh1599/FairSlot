import { describe, expect, it } from 'vitest'
import { canonicalize, CanonicalError } from './canonical'
import { generatePublicEntryId, generatePublicEventId, normalizeEntryIdInput } from './ids'
import {
  buildManifest,
  checkManifestFile,
  canonicalManifest,
  manifestHash,
  ENTRY_ID_PATTERN,
  EVENT_ID_PATTERN,
  ManifestError,
  type ManifestInput,
} from './manifest'

function sample(overrides: Partial<ManifestInput> = {}): ManifestInput {
  const entryIds = Array.from({ length: 12 }, () => generatePublicEntryId())
  return {
    eventPublicId: generatePublicEventId(),
    title: 'งานเลี้ยงปีใหม่',
    description: 'จับสลากของขวัญ',
    rules: 'หนึ่งคนหนึ่งสิทธิ์',
    organizerWallet: '0x00000000000000000000000000000000000abc01',
    chainId: 5042,
    contractAddress: '0x000000000000000000000000000000000000fa15',
    drawNotBeforeUtc: '2026-12-31T12:00:00Z',
    winnerCount: 2,
    reserveCount: 1,
    prizes: [
      { rank: 1, name: 'หูฟัง' },
      { rank: 2, name: 'บัตรกำนัล' },
    ],
    entryIds,
    ...overrides,
  }
}

describe('canonical serialization', () => {
  it('ignores key order and sorts keys', () => {
    expect(canonicalize({ b: 1, a: [2, 1] })).toBe('{"a":[2,1],"b":1}')
    expect(canonicalize({ a: [2, 1], b: 1 })).toBe('{"a":[2,1],"b":1}')
  })

  it('normalizes unicode to NFC', () => {
    const nfd = 'e\u0301' // e + combining acute
    const nfc = '\u00e9'
    expect(canonicalize({ n: nfd })).toBe(canonicalize({ n: nfc }))
  })

  it('rejects floats and duplicate normalized keys', () => {
    expect(() => canonicalize({ x: 1.5 })).toThrow(CanonicalError)
    expect(() => canonicalize({ 'e\u0301': 1, '\u00e9': 2 })).toThrow(CanonicalError)
  })
})

describe('manifest', () => {
  it('sorts entries so the organizer cannot choose an index', () => {
    const m = buildManifest(sample())
    expect([...m.entries].sort()).toEqual(m.entries)
    expect(m.entries.every((e) => ENTRY_ID_PATTERN.test(e))).toBe(true)
    expect(EVENT_ID_PATTERN.test(m.eventPublicId)).toBe(true)
  })

  it('hash is stable and changes with any field', () => {
    const input = sample()
    const a = manifestHash(buildManifest(input))
    const b = manifestHash(buildManifest({ ...input, entryIds: [...input.entryIds].reverse() }))
    expect(a).toBe(b)
    expect(manifestHash(buildManifest({ ...input, title: 'อื่น' }))).not.toBe(a)
  })

  it('rejects inconsistent counts and prizes', () => {
    expect(() => buildManifest(sample({ winnerCount: 0, prizes: [] }))).toThrow(ManifestError)
    expect(() => buildManifest(sample({ winnerCount: 20, reserveCount: 0 }))).toThrow(ManifestError)
    expect(() => buildManifest(sample({ prizes: [{ rank: 1, name: 'x' }] }))).toThrow(ManifestError)
    const dup = generatePublicEntryId()
    expect(() => buildManifest(sample({ entryIds: [dup, dup, ...Array(10).fill(0).map(() => generatePublicEntryId())] }))).toThrow(ManifestError)
  })

  it('checkManifestFile detects a matching file, a hash mismatch and bad json', () => {
    const m = buildManifest(sample())
    const text = canonicalManifest(m)
    const h = manifestHash(m)
    expect(checkManifestFile(text, h).ok).toBe(true)
    const tampered = text.replace('หูฟัง', 'หูฟัง2')
    const bad = checkManifestFile(tampered, h)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toBe('hash-mismatch')
    const junk = checkManifestFile('not json', h)
    expect(junk.ok === false && junk.reason).toBe('invalid-json')
  })
})

describe('ids', () => {
  it('generates well formed, distinct IDs', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => generatePublicEntryId()))
    expect(ids.size).toBe(2000)
    for (const id of ids) expect(ENTRY_ID_PATTERN.test(id)).toBe(true)
  })

  it('normalizes what people type', () => {
    expect(normalizeEntryIdInput('7k3m 9qx2 h4td')).toBe('7K3M-9QX2-H4TD')
    expect(normalizeEntryIdInput('o1l1-0000-0000')).toBe('0111-0000-0000')
  })

  it('reports malformed or extended manifest files instead of throwing', () => {
    for (const text of ['null', '[]', '"x"', '{}', '{"title":5}']) {
      const out = checkManifestFile(text, ('0x' + '11'.repeat(32)) as `0x${string}`)
      expect(out.ok).toBe(false)
    }
    const good = buildManifest(sample())
    const extra = JSON.stringify({ ...good, surprise: true })
    const out = checkManifestFile(extra, manifestHash(good))
    expect(out.ok).toBe(false)
    const wrongType = JSON.stringify({ ...good, entries: 'nope' })
    expect(checkManifestFile(wrongType, manifestHash(good)).ok).toBe(false)
  })
})
