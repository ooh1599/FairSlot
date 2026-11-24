/** Crockford base32 without I, L, O, U. Random IDs carry no information about the person. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function randomChars(count: number): string {
  const bytes = new Uint8Array(count)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b & 31]
  return out
}

/** 60 bits of randomness, e.g. 7K3M-9QX2-H4TD */
export function generatePublicEntryId(): string {
  const raw = randomChars(12)
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

/** Public event ID, e.g. fs_7k3m9qx2h4td8a1b5c6e */
export function generatePublicEventId(): string {
  return `fs_${randomChars(20).toLowerCase()}`
}

/** Normalizes what a participant typed: case, spaces and the look-alike letters Crockford maps. */
export function normalizeEntryIdInput(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (cleaned.length !== 12) return input.trim().toUpperCase()
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}`
}
