/** Times are stored as UTC and always shown in Asia/Bangkok (UTC+7, no daylight saving). */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

export type Lang = 'th' | 'en'

export function formatBangkok(value: string | number | Date, lang: Lang): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const locale = lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-US'
  const text = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'long',
    timeStyle: 'short',
    hour12: lang === 'en',
    hourCycle: lang === 'en' ? 'h12' : 'h23',
  }).format(date)
  return lang === 'th' ? `${text} (เวลาประเทศไทย UTC+7)` : `${text} (Thailand time, UTC+7)`
}

/** Value for <input type="datetime-local"> interpreted as Bangkok wall-clock time. */
export function toBangkokInput(value: string | number | Date): string {
  const shifted = new Date(new Date(value).getTime() + BANGKOK_OFFSET_MS)
  return shifted.toISOString().slice(0, 16)
}

/** Reads a datetime-local string as Bangkok time and returns the UTC instant. */
export function fromBangkokInput(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input)
  if (!m) return null
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - BANGKOK_OFFSET_MS
  const d = new Date(utc)
  return Number.isNaN(d.getTime()) ? null : d
}

export function shortHash(value: string, head = 8, tail = 6): string {
  return value.length <= head + tail + 2 ? value : `${value.slice(0, head)}...${value.slice(-tail)}`
}
