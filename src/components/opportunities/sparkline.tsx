export type SparklineProps = {
  readonly series: readonly number[]
  readonly width?: number
  readonly height?: number
  readonly label: string
}

export function Sparkline({ series, width = 72, height = 20, label }: SparklineProps) {
  const max = Math.max(...series)
  const min = Math.min(...series)
  const points = series.map(
    (value, i) =>
      [(i / Math.max(series.length - 1, 1)) * width, height - 2 - ((value - min) / Math.max(max - min, 1)) * (height - 4)] as const,
  )
  const path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
  const last = points.at(-1)
  return (
    <svg width={width} height={height} className="block shrink-0 text-ink-2" role="img" aria-label={label}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={2} fill="currentColor" />}
    </svg>
  )
}
