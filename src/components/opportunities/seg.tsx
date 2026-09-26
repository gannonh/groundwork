import type { ReactNode } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export type SegProps<T extends string> = {
  readonly label: string
  readonly value: T
  readonly options: readonly { readonly value: T; readonly label: ReactNode }[]
  readonly onChange: (value: T) => void
  readonly className?: string
}

export function Seg<T extends string>({ label, value, options, onChange, className = '' }: SegProps<T>) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const option = options.find((o) => o.value === next)
        if (option) onChange(option.value)
      }}
      className={`rounded-[7px] border bg-background p-0.5 ${className}`}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="h-auto flex-1 rounded-[5px] px-2.5 py-1 text-[13px] text-ink-2 hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_2px_rgba(0,0,0,.08)]"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
