import type { QuoteView } from '@/server/opportunity-map.server'
import { formatConfidence, formatDay, formatRole, formatUsd } from './format'
import { ItemAnchor } from './map-links'
import { Pill } from './pill'

export function Quote({ quote }: { quote: QuoteView }) {
  const { text } = quote
  return (
    <figure
      className={`mb-3.5 border-l-[3px] py-0.5 pl-3 ${quote.lowConfidence === null ? 'border-l-border' : 'border-l-warn-line'}`}
    >
      <blockquote className="mb-1.25 text-body leading-normal">
        “{text.leadingEllipsis && '… '}
        {text.sentences.map((sentence, i) => (
          <span key={i}>
            {i > 0 && ' '}
            {sentence.highlighted ? <mark className="bg-mark px-px">{sentence.text}</mark> : sentence.text}
          </span>
        ))}
        {text.trailingEllipsis && ' …'}”
      </blockquote>
      <figcaption className="flex flex-wrap items-center gap-2 text-meta text-ink-3">
        {quote.account && (
          <>
            <b className="font-semibold text-ink-2">{quote.account.name}</b>
            <span>{formatUsd(quote.account.arr)} ARR</span>
          </>
        )}
        {quote.role && <span>{formatRole(quote.role)}</span>}
        <ItemAnchor
          itemId={quote.itemId}
          mention={quote.mentionId}
          label={`Open ${quote.source} · ${formatDay(quote.date)}`}
          className="rounded-[3px] text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {quote.source} · {formatDay(quote.date)}
        </ItemAnchor>
        {quote.lowConfidence !== null && <Pill tone="warn">{formatConfidence(quote.lowConfidence)}</Pill>}
      </figcaption>
    </figure>
  )
}
