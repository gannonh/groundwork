import { DELTA_WEEKS, type TrendWindow, type WeeklyCounts } from '@/domain/metrics'
import { formatDay } from './format'

const WIDTH = 380
const HEIGHT = 70

export type TrendBarsProps = { readonly weekly: WeeklyCounts; readonly window: TrendWindow }

/** Mentions per week, oldest first. The last DELTA_WEEKS bars, the ones momentum compares, are dark. */
export function TrendBars({ weekly, window }: TrendBarsProps) {
  const max = Math.max(1, ...weekly)
  const barWidth = WIDTH / weekly.length
  return (
    <svg
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT + 16)}`}
      width="100%"
      role="img"
      aria-label={`Mentions per week from ${formatDay(window.firstWeek)}: ${weekly.join(', ')}`}
    >
      {weekly.map((count, i) => {
        const height = (count / max) * HEIGHT
        return (
          <rect
            key={i}
            x={i * barWidth + 2}
            y={HEIGHT - height}
            width={barWidth - 4}
            height={height}
            rx={2}
            className={i >= weekly.length - DELTA_WEEKS ? 'fill-foreground' : 'fill-border'}
          />
        )
      })}
      <text x={0} y={HEIGHT + 13} fontSize={10} className="fill-ink-3">
        {formatDay(window.firstWeek)}
      </text>
      <text x={WIDTH} y={HEIGHT + 13} fontSize={10} textAnchor="end" className="fill-ink-3">
        Week of {formatDay(window.lastWeek)}
      </text>
    </svg>
  )
}
