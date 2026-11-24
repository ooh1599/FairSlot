import { keccak256, toBytes, type Hex } from 'viem'

/**
 * Canonical serialization (v1) used for the public manifest:
 *  - JSON, no insignificant whitespace, encoded as UTF-8
 *  - every string (values and object keys) is Unicode-normalized to NFC before encoding
 *  - object keys are sorted ascending by UTF-16 code unit (all FairSlot keys are ASCII)
 *  - arrays keep their order, which is meaningful (entries, prizes)
 *  - only strings, booleans, null and safe integers are allowed: no floats, no undefined, no NaN
 *  - hash algorithm: keccak256 over the UTF-8 bytes, shown as 0x-prefixed lowercase hex
 */
export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue }

export class CanonicalError extends Error {}

export function canonicalize(value: CanonicalValue): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value.normalize('NFC'))
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isSafeInteger(value)) throw new CanonicalError(`Only safe integers are allowed, got ${value}`)
      return String(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
      const normalized = new Map<string, CanonicalValue>()
      for (const [key, v] of Object.entries(value)) {
        if (v === undefined) throw new CanonicalError(`Undefined value for key ${key}`)
        const nk = key.normalize('NFC')
        if (normalized.has(nk)) throw new CanonicalError(`Duplicate key after normalization: ${nk}`)
        normalized.set(nk, v)
      }
      const keys = [...normalized.keys()].sort()
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(normalized.get(k) as CanonicalValue)}`).join(',')}}`
    }
    default:
      throw new CanonicalError(`Unsupported type ${typeof value}`)
  }
}

export function canonicalBytes(value: CanonicalValue): Uint8Array {
  return toBytes(canonicalize(value))
}

export function hashCanonical(value: CanonicalValue): Hex {
  return keccak256(canonicalBytes(value))
}

export function hashText(text: string): Hex {
  return keccak256(toBytes(text))
}
