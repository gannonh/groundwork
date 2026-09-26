import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** A CSV file input that hands the chosen file's bytes to `onFile`. */
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
          void file.arrayBuffer().then((buffer) => {
            onFile(file, new Uint8Array(buffer))
          })
        }}
      />
    </div>
  )
}
