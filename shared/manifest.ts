import { isAddress, keccak256, toBytes, type Address, type Hex } from 'viem'
import { canonicalize, hashCanonical, type CanonicalValue } from './canonical.js'
import { ALGORITHM_VERSION, LIMITS, MANIFEST_SCHEMA_VERSION } from './limits.js'

export interface PrizeAssignment {
  /** 1-based main-winner rank that receives this prize (rank 1 = first drawn position) */
  rank: number
  name: string
}

export interface Manifest {
  schemaVersion: number
  eventPublicId: string
  title: string
  description: string
  rules: string
  organizerWallet: Address
  chainId: number
  contractAddress: Address
  /** earliest moment the organizer may request randomness, ISO-8601 UTC, whole seconds, trailing Z */
  drawNotBeforeUtc: string
  algorithmVersion: number
  randomnessFailurePolicy: string
  participantCount: number
  winnerCount: number
  reserveCount: number
  prizes: PrizeAssignment[]
  /** public entry IDs sorted ascending: position in this list is the index the contract returns */
  entries: string[]
}

export const FAILURE_POLICY_V1 =
  'If no randomness proof is accepted before the provider deadline the event ends as FAILED. There is no re-roll, no provider switch and no replacement draw. A proof that was accepted but not delivered is redelivered with the same random word.'

export const ENTRY_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/
export const EVENT_ID_PATTERN = /^fs_[0-9a-hjkmnp-tv-z]{20}$/

export class ManifestError extends Error {}

export function eventIdToBytes32(eventPublicId: string): Hex {
  return keccak256(toBytes(eventPublicId))
}

function isoUtcSeconds(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false
  return !Number.isNaN(Date.parse(value))
}

const MANIFEST_KEYS = [
  'schemaVersion', 'eventPublicId', 'title', 'description', 'rules', 'organizerWallet', 'chainId', 'contractAddress',
  'drawNotBeforeUtc', 'algorithmVersion', 'randomnessFailurePolicy', 'participantCount', 'winnerCount', 'reserveCount',
  'prizes', 'entries',
].sort()

const isStr = (v: unknown): v is string => typeof v === 'string'
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)

/** Shape check for untrusted input (a downloaded file): wrong types or unknown fields are reported, never thrown. */
function shapeErrors(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['not-an-object']
  const m = value as Record<string, unknown>
  const errors: string[] = []
  const keys = Object.keys(m).sort()
  if (keys.join('|') !== MANIFEST_KEYS.join('|')) errors.push('fields')
  for (const k of ['eventPublicId', 'title', 'description', 'rules', 'organizerWallet', 'contractAddress', 'drawNotBeforeUtc', 'randomnessFailurePolicy']) {
    if (!isStr(m[k])) errors.push(`${k} type`)
  }
  for (const k of ['schemaVersion', 'chainId', 'algorithmVersion', 'participantCount', 'winnerCount', 'reserveCount']) {
    if (!isInt(m[k])) errors.push(`${k} type`)
  }
  if (!Array.isArray(m.entries) || !m.entries.every(isStr)) errors.push('entries type')
  if (
    !Array.isArray(m.prizes) ||
    !m.prizes.every((p: unknown) => typeof p === 'object' && p !== null && isInt((p as Record<string, unknown>).rank) && isStr((p as Record<string, unknown>).name) && Object.keys(p).length === 2)
  ) {
    errors.push('prizes type')
  }
  return errors
}

export function validateManifest(m: Manifest): string[] {
  const shape = shapeErrors(m)
  if (shape.length) return shape.map((e) => `malformed: ${e}`)
  const errors: string[] = []
  if (m.schemaVersion !== MANIFEST_SCHEMA_VERSION) errors.push('schemaVersion')
  if (!EVENT_ID_PATTERN.test(m.eventPublicId)) errors.push('eventPublicId')
  if (!m.title.trim() || m.title.length > LIMITS.maxTitleLength) errors.push('title')
  if (m.description.length > LIMITS.maxDescriptionLength) errors.push('description')
  if (m.rules.length > LIMITS.maxRulesLength) errors.push('rules')
  if (!isAddress(m.organizerWallet)) errors.push('organizerWallet')
  if (!isAddress(m.contractAddress)) errors.push('contractAddress')
  if (!Number.isSafeInteger(m.chainId) || m.chainId <= 0) errors.push('chainId')
  if (!isoUtcSeconds(m.drawNotBeforeUtc)) errors.push('drawNotBeforeUtc')
  if (m.algorithmVersion !== ALGORITHM_VERSION) errors.push('algorithmVersion')
  if (m.randomnessFailurePolicy !== FAILURE_POLICY_V1) errors.push('randomnessFailurePolicy')
  const n = m.entries.length
  if (n < 1 || n > LIMITS.maxParticipants) errors.push('entries.length')
  if (m.participantCount !== n) errors.push('participantCount')
  if (m.winnerCount < 1) errors.push('winnerCount')
  if (m.reserveCount < 0) errors.push('reserveCount')
  if (m.winnerCount + m.reserveCount > LIMITS.maxPicks || m.winnerCount + m.reserveCount > n) {
    errors.push('winnerCount+reserveCount')
  }
  if (m.prizes.length !== m.winnerCount) errors.push('prizes.length')
  m.prizes.forEach((p, i) => {
    if (p.rank !== i + 1 || !p.name.trim() || p.name.length > LIMITS.maxPrizeNameLength) errors.push(`prizes[${i}]`)
  })
  for (let i = 0; i < n; i++) {
    const id = m.entries[i]
    if (!ENTRY_ID_PATTERN.test(id)) errors.push(`entries[${i}] format`)
    if (i > 0 && !(m.entries[i - 1] < id)) errors.push(`entries[${i}] order or duplicate`)
  }
  return errors
}

export type ManifestInput = Omit<Manifest, 'schemaVersion' | 'algorithmVersion' | 'randomnessFailurePolicy' | 'participantCount' | 'entries'> & {
  entryIds: string[]
}

/** Builds the canonical manifest. Entries are sorted so the organizer cannot choose the index of any person. */
export function buildManifest(input: ManifestInput): Manifest {
  const { entryIds, ...rest } = input
  const manifest: Manifest = {
    ...rest,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    randomnessFailurePolicy: FAILURE_POLICY_V1,
    participantCount: entryIds.length,
    entries: [...entryIds].sort(),
  }
  const errors = validateManifest(manifest)
  if (errors.length) throw new ManifestError(`Invalid manifest: ${errors.join(', ')}`)
  return manifest
}

export function canonicalManifest(m: Manifest): string {
  return canonicalize(m as unknown as CanonicalValue)
}

export function manifestHash(m: Manifest): Hex {
  return hashCanonical(m as unknown as CanonicalValue)
}

/** Content-addressed storage path: the file name is its own hash, so a different file can never take the name. */
export function manifestObjectPath(m: Manifest, hash: Hex): string {
  return `${m.eventPublicId}/${hash}.json`
}

export type ManifestCheck =
  | { ok: true; manifest: Manifest; hash: Hex }
  | { ok: false; reason: 'invalid-json' | 'invalid-manifest' | 'hash-mismatch'; detail?: string; actualHash?: Hex }

/** Verifies a downloaded manifest file against the hash committed onchain. */
export function checkManifestFile(text: string, expectedHash: Hex): ManifestCheck {
  let parsed: Manifest
  try {
    parsed = JSON.parse(text) as Manifest
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  const shape = shapeErrors(parsed)
  if (shape.length) return { ok: false, reason: 'invalid-manifest', detail: `malformed: ${shape.join(', ')}` }
  let actual: Hex
  try {
    actual = manifestHash(parsed)
  } catch (error) {
    return { ok: false, reason: 'invalid-manifest', detail: error instanceof Error ? error.message : 'unknown' }
  }
  if (actual.toLowerCase() !== expectedHash.toLowerCase()) {
    return { ok: false, reason: 'hash-mismatch', actualHash: actual }
  }
  const errors = validateManifest(parsed)
  if (errors.length) return { ok: false, reason: 'invalid-manifest', detail: errors.join(', ') }
  return { ok: true, manifest: parsed, hash: actual }
}
