import { FACTORS, type Factor, type Score } from '@/domain/rank'

const COLORS: Record<Factor, string> = {
  reach: 'bg-reach',
  revenue: 'bg-revenue',
  pain: 'bg-pain',
  momentum: 'bg-momentum',
}

export function ScoreBar({ score }: { score: Score }) {
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-[4px] bg-line-2">
        {FACTORS.map((factor) => (
          <i key={factor} className={`block h-full ${COLORS[factor]}`} style={{ width: `${String(score.parts[factor])}%` }} />
        ))}
      </div>
      <div className="mt-1 font-mono text-[12px] text-ink-2">{score.total.toFixed(0)}</div>
    </div>
  )
}
