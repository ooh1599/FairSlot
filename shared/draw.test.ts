import { describe, expect, it } from 'vitest'
import vectors from '../docs/golden-vectors.json'
import { computeWinners, drawBase, uniform, type CandidateHash } from './draw'
import { VECTOR_CASES, VECTOR_CHAIN_ID, VECTOR_CONTRACT, VECTOR_EVENT_ID, VECTOR_FIRST_REQUEST_ID, VECTOR_MANIFEST_HASH, VECTOR_WORD } from './vectors'

function inputFor(i: number) {
  const c = VECTOR_CASES[i]
  return {
    chainId: VECTOR_CHAIN_ID,
    contract: VECTOR_CONTRACT,
    eventId: VECTOR_EVENT_ID,
    manifestHash: VECTOR_MANIFEST_HASH,
    requestId: VECTOR_FIRST_REQUEST_ID + BigInt(i),
    randomWord: VECTOR_WORD,
    participantCount: c.participants,
    winnerCount: c.winners,
    reserveCount: c.reserves,
  }
}

describe('golden vectors (must equal contracts/test/FairSlot.t.sol)', () => {
  vectors.cases.forEach((v, i) => {
    it(`${v.name}`, () => {
      expect(drawBase(inputFor(i))).toBe(v.drawBase)
      expect(computeWinners(inputFor(i))).toEqual(v.result)
    })
  })

  it('pins the exact values the Solidity test asserts', () => {
    expect(computeWinners(inputFor(0))).toEqual([22, 56, 2, 98, 53, 40, 28, 27])
    expect(computeWinners(inputFor(1))).toEqual([1, 6, 9, 5, 2, 7, 8, 0, 4, 3])
    expect(computeWinners(inputFor(3))).toEqual([0])
    expect(drawBase(inputFor(0))).toBe('0x5fc904b9a6adf40aed6e666ea88081ca96f1b6c789bfd5167ed0a08caa417415')
  })
})

describe('draw properties', () => {
  it('returns distinct in-range winners', () => {
    for (let k = 0; k < 20; k++) {
      const out = computeWinners({
        ...inputFor(2),
        randomWord: `0x${k.toString(16).padStart(64, '0')}`,
      })
      expect(new Set(out).size).toBe(out.length)
      expect(out.every((v) => v >= 0 && v < 10_000)).toBe(true)
    }
  })

  it('is a full permutation when picks equal participants', () => {
    const out = computeWinners({ ...inputFor(1), participantCount: 10, winnerCount: 10, reserveCount: 0 })
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('is roughly uniform over many words (chi-square sanity)', () => {
    const buckets = new Array(10).fill(0)
    const trials = 3000
    for (let k = 0; k < trials; k++) {
      const [w] = computeWinners({
        ...inputFor(0),
        participantCount: 10,
        winnerCount: 1,
        reserveCount: 0,
        randomWord: `0x${k.toString(16).padStart(64, '0')}`,
      })
      buckets[w]++
    }
    const expected = trials / 10
    const chi = buckets.reduce((s, o) => s + (o - expected) ** 2 / expected, 0)
    expect(chi).toBeLessThan(27.88) // chi-square, 9 dof, p = 0.001
  })

  it('rejects invalid counts', () => {
    expect(() => computeWinners({ ...inputFor(0), winnerCount: 0 })).toThrow()
    expect(() => computeWinners({ ...inputFor(0), participantCount: 5, winnerCount: 4, reserveCount: 2 })).toThrow()
    expect(() => computeWinners({ ...inputFor(0), participantCount: 10_001 })).toThrow()
    expect(() => computeWinners({ ...inputFor(0), winnerCount: 40, reserveCount: 11 })).toThrow()
  })
})

describe('rejection sampling', () => {
  const MAX = (1n << 256n) - 1n
  it('rejects candidates in the biased tail and retries with the next counter', () => {
    const range = 3
    // 2^256 mod 3 = 1, so only MAX itself is rejected
    const calls: number[] = []
    const hash: CandidateHash = (_b, _p, counter) => {
      calls.push(counter)
      return counter === 0 ? MAX : 7n
    }
    expect(uniform('0x00', 0, range, hash)).toBe(7n % 3n)
    expect(calls).toEqual([0, 1])
  })

  it('accepts everything when range is a power of two', () => {
    const hash: CandidateHash = () => MAX
    expect(uniform('0x00', 0, 4, hash)).toBe(3n)
  })

  it('does not hash for a range of one', () => {
    const hash: CandidateHash = () => {
      throw new Error('must not be called')
    }
    expect(uniform('0x00', 0, 1, hash)).toBe(0n)
  })
})
