import type { IsoDate, ItemKind } from '@/domain/types'

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  ticket: 'Ticket',
  call: 'Call',
  survey_response: 'Survey response',
  review: 'Review',
  interview: 'Interview',
}

export function plural(n: number, noun: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? noun : `${noun}s`}`
}

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
export function formatDate(date: IsoDate): string {
  return DATE.format(new Date(`${date}T00:00:00Z`))
}

export function formatDollars(value: number): string {
  return `$${value.toLocaleString('en-US')}`
}

export const TABLE_HEAD = 'h-8 px-3 text-[11px] font-semibold text-ink-3'
export const TABLE_CELL = 'px-3 py-2'
