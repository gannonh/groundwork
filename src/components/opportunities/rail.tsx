import { memo, useEffect, useId, useRef, type ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DATE_RANGES, SEGMENTS, SPEAKERS, type MapFilter } from '@/domain/filters'
import { FACTORS, PRESETS, sameWeights, type Factor, type Weights } from '@/domain/rank'
import { isNonEmpty, type NonEmptyArray, type SourceId } from '@/domain/types'
import { FACTOR_COLORS } from './score-bar'
import { Seg } from './seg'

export type RailProps = {
  readonly weights: Weights
  /** Every slider step, for a live re-rank. */
  readonly onWeightsInput: (weights: Weights) => void
  /** A released slider (its own factor only) or a preset. */
  readonly onWeightsCommit: (weights: Partial<Weights>) => void
  readonly filter: MapFilter
  readonly sources: readonly { readonly id: SourceId; readonly name: string }[]
  /** Computes the change from the latest filter, which is ahead of `filter` while a refetch is pending. */
  readonly onFilterChange: (change: (latest: MapFilter) => Partial<MapFilter>) => void
}

const SEGMENT_KEYS = SEGMENTS.map((s) => s.key)
const SPEAKER_KEYS = SPEAKERS.map((s) => s.key)

export const Rail = memo(function Rail({
  weights,
  onWeightsInput,
  onWeightsCommit,
  filter,
  sources,
  onFilterChange,
}: RailProps) {
  return (
    <aside
      aria-label="Ranking and filters"
      className="rail w-[250px] shrink-0 overflow-auto border-r bg-card px-[18px] pt-5 pb-[90px]"
    >
      <RailHeading>Rank by</RailHeading>
      <WeightSliders weights={weights} onInput={onWeightsInput} onCommit={onWeightsCommit} />
      <RailHeading className="mt-[26px]">Filter</RailHeading>
      <FilterGroup title="Segment">
        <CheckboxOptions
          options={SEGMENTS}
          on={filter.segments}
          onToggle={(key) => {
            onFilterChange((latest) => ({ segments: toggledSubset(SEGMENT_KEYS, latest.segments, key) }))
          }}
        />
      </FilterGroup>
      <FilterGroup title="Source">
        <CheckboxOptions
          options={sources.map((s) => ({ key: s.id, label: s.name }))}
          on={filter.sources}
          onToggle={(key) => {
            const keys = sources.map((s) => s.id)
            onFilterChange((latest) => ({ sources: toggledSubset(keys, latest.sources, key) }))
          }}
        />
      </FilterGroup>
      <FilterGroup title="Speaker">
        <ToggleGroup
          type="multiple"
          aria-label="Speaker"
          value={filter.speakers ? [...filter.speakers] : []}
          spacing={1.25}
          className="flex-wrap"
        >
          {SPEAKERS.map((speaker) => (
            <ToggleGroupItem
              key={speaker.key}
              value={speaker.key}
              onClick={() => {
                onFilterChange((latest) => {
                  const speakers = toggled(SPEAKER_KEYS, latest.speakers ?? [], speaker.key)
                  return { speakers: isNonEmpty(speakers) ? speakers : undefined }
                })
              }}
              variant="outline"
              className="h-auto rounded-[6px] bg-card px-2 py-[3px] text-[12px] text-ink-2 shadow-none hover:border-ink-3 data-[state=on]:border-ink-2 data-[state=on]:text-foreground"
            >
              {speaker.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FilterGroup>
      <FilterGroup title="Date">
        <Seg
          label="Date"
          value={filter.since}
          options={DATE_RANGES.map((r) => ({ value: r.key, label: r.key }))}
          onChange={(since) => {
            onFilterChange(() => ({ since }))
          }}
          className="w-full"
        />
      </FilterGroup>
    </aside>
  )
})

function RailHeading({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <h2 className={`mb-3.5 text-[11px] font-bold tracking-[.06em] text-ink-2 uppercase ${className}`}>{children}</h2>
  )
}

const FACTOR_LABELS: Record<Factor, { readonly label: string; readonly hint: string }> = {
  reach: { label: 'Reach', hint: 'Distinct accounts' },
  revenue: { label: 'Revenue', hint: 'ARR of those accounts' },
  pain: { label: 'Pain', hint: 'Judge-scored severity' },
  momentum: { label: 'Momentum', hint: '4-week change in mentions' },
}

export type WeightSlidersProps = {
  readonly weights: Weights
  readonly onInput: (weights: Weights) => void
  readonly onCommit: (weights: Partial<Weights>) => void
}

export function WeightSliders({ weights, onInput, onCommit }: WeightSlidersProps) {
  return (
    <>
      {FACTORS.map((factor) => (
        <WeightSlider
          key={factor}
          factor={factor}
          value={weights[factor]}
          onInput={(value) => {
            onInput({ ...weights, [factor]: value })
          }}
          onCommit={(value) => {
            onCommit({ [factor]: value })
          }}
        />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            aria-pressed={sameWeights(weights, preset.weights)}
            onClick={() => {
              onCommit(preset.weights)
            }}
            className="rounded-[6px] border bg-card px-2 py-[3px] text-[12px] font-medium text-ink-2 hover:border-ink-3 aria-pressed:border-ink-2 aria-pressed:text-foreground"
          >
            {preset.name}
          </button>
        ))}
      </div>
    </>
  )
}

function WeightSlider({
  factor,
  value,
  onInput,
  onCommit,
}: {
  factor: Factor
  value: number
  onInput: (value: number) => void
  onCommit: (value: number) => void
}) {
  const id = useId()
  const root = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    // The shadcn Slider does not pass props to its thumb, which is the element with role=slider.
    const thumb = root.current?.querySelector('[role=slider]')
    thumb?.setAttribute('aria-labelledby', `${id}-label`)
    thumb?.setAttribute('aria-describedby', `${id}-hint`)
  }, [id])
  const { label, hint } = FACTOR_LABELS[factor]
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 flex justify-between font-semibold">
        <span id={`${id}-label`} className="flex items-center">
          <span aria-hidden className={`mr-1.5 inline-block size-[9px] rounded-[2px] ${FACTOR_COLORS[factor]}`} />
          {label}
        </span>
        <span className="tabular-nums">{value}</span>
      </div>
      <Slider
        ref={root}
        min={0}
        max={60}
        step={1}
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) onInput(next)
        }}
        onValueCommit={([next]) => {
          if (next !== undefined) onCommit(next)
        }}
      />
      <small id={`${id}-hint`} className="mt-1 block text-[11.5px] text-ink-3">
        {hint}
      </small>
    </div>
  )
}

export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="mb-4">
      <div id={id} className="mb-1.5 font-semibold">
        {title}
      </div>
      {children}
    </div>
  )
}

function CheckboxOptions<K extends string>({
  options,
  on,
  onToggle,
}: {
  options: readonly { readonly key: K; readonly label: string }[]
  on: readonly K[] | undefined
  onToggle: (key: K) => void
}) {
  return options.map((option) => (
    <label key={option.key} className="flex cursor-pointer items-center gap-2 py-[3px] text-ink-2">
      <Checkbox
        checked={on === undefined || on.includes(option.key)}
        onCheckedChange={() => {
          onToggle(option.key)
        }}
      />
      {option.label}
    </label>
  ))
}

/** `on` with `key` flipped, in `keys` order. */
function toggled<K extends string>(keys: readonly K[], on: readonly K[], key: K): K[] {
  return keys.filter((k) => (k === key) !== on.includes(k))
}

/** Flips `key` in a list where absent means every key is on. Refuses to turn the last key off. */
function toggledSubset<K extends string>(
  keys: readonly K[],
  on: NonEmptyArray<K> | undefined,
  key: K,
): NonEmptyArray<K> | undefined {
  const next = toggled(keys, on ?? keys, key)
  if (!isNonEmpty(next)) return on
  return next.length === keys.length ? undefined : next
}
