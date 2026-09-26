import { useId, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function CsvFileField({
  label,
  disabled,
  onFile,
}: {
  label: string
  disabled?: boolean
  onFile: (file: File, bytes: Uint8Array) => void
}) {
  const id = useId()
  const latest = useRef<File | null>(null)
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        accept=".csv,text/csv"
        disabled={disabled}
        className="max-w-md bg-card"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          latest.current = file
          void file.arrayBuffer().then((buffer) => {
            if (latest.current === file) onFile(file, new Uint8Array(buffer))
          })
        }}
      />
    </div>
  )
}
