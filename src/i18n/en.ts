import type { th } from './th'
import { enApp } from './en.app'
import { enFlow } from './en.flow'

export const en: Record<keyof typeof th, string> = { ...enApp, ...enFlow }
