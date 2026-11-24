import { describe, expect, it } from 'vitest'
import { en } from './en'
import { th } from './th'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('i18n', () => {
  it('English has every Thai key and nothing extra', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(th).sort())
  })

  it('no message is empty and placeholders match between languages', () => {
    for (const key of Object.keys(th) as (keyof typeof th)[]) {
      expect(th[key].trim(), key).not.toBe('')
      expect(en[key].trim(), key).not.toBe('')
      expect(placeholders(en[key]), key).toEqual(placeholders(th[key]))
    }
  })
})
