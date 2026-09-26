import type { ReactNode } from 'react'

const TONES = {
  error: 'border-up/30 bg-up-soft text-up',
  success: 'border-down/30 bg-down-soft text-down',
  info: 'border-primary/20 bg-primary-soft text-primary',
} as const

export function Notice({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 font-medium ${TONES[tone]}`}>
      {children}
    </div>
  )
}
