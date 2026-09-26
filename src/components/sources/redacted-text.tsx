import type { RedactedText as Redacted } from '@/domain/types'

const TOKEN = /(\[(?:email|phone|card)\])/

export function RedactedText({ text }: { text: Redacted }) {
  return text.split(TOKEN).map((part, i) =>
    i % 2 === 1 ? (
      <span
        key={i}
        title="Redacted before storage"
        className="rounded-[4px] bg-line-2 px-1 py-px font-mono text-[11px] text-ink-2"
      >
        {part}
      </span>
    ) : (
      part
    ),
  )
}
