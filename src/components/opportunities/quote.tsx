import type { QuoteView } from '@/server/opportunity-map.server'
import { formatDay, formatRole, formatUsd } from './format'
import { Pill } from './pill'

export function Quote({ quote }: { quote: QuoteView }) {
  const { text } = quote
  return (
    <figure
      className={`mb-3.5 border-l-[3px] py-0.5 pl-3 ${quote.lowConfidence === null ? 'border-l-border' : 'border-l-warn-line'}`}
    >
      <blockquote className="mb-[5px] text-[13.5px] leading-normal">
        “{text.leadingEllipsis && '… '}
        {text.sentences.map((sentence, i) => (
          <span key={i}>
            {i > 0 && ' '}
            {sentence.highlighted ? <mark className="bg-mark px-px">{sentence.text}</mark> : sentence.text}
          </span>
        ))}
        {text.trailingEllipsis && ' …'}”
      </blockquote>
      <figcaption className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
        {quote.account && (
          <>
            <b className="font-semibold text-ink-2">{quote.account.name}</b>
            <span>{formatUsd(quote.account.arr)} ARR</span>
          </>
        )}
        {quote.role && <span>{formatRole(quote.role)}</span>}
        <span>
          {quote.source} · {formatDay(quote.date)}
        </span>
        {quote.lowConfidence !== null && (
          <Pill tone="warn">{Math.round(quote.lowConfidence * 100)}% confident</Pill>
        )}
      </figcaption>
    </figure>
  )
}
