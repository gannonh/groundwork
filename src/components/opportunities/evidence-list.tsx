import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { EvidenceList } from '@/server/opportunity-map.server'
import { formatUsd, mentionCount } from './format'
import { Quote } from './quote'

export type EvidenceSheetProps = {
  readonly open: boolean
  readonly list: EvidenceList
  readonly onClose: () => void
  /** Reloads the map and this list together. */
  readonly onReload: () => void
}

/** The quotes behind one number on the detail, in prototype D's 480px drawer. */
export function EvidenceSheet({ open, list, onClose, onReload }: EvidenceSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="w-[480px] max-w-full gap-0 bg-card leading-[normal] sm:max-w-none">
        <SheetHeader className="gap-1 border-b px-6 pt-[22px] pr-14 pb-4">
          <SheetTitle className="text-[17px] leading-[1.3] font-bold tracking-[-0.01em]">{heading(list)}</SheetTitle>
          <SheetDescription className="text-[12px] text-ink-3">
            {description(list)}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto px-6 pt-4 pb-10">
          <EvidenceRows list={list} onReload={onReload} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function heading(list: EvidenceList): string {
  switch (list.kind) {
    case 'missing':
      return 'Evidence not found'
    case 'stale':
      return 'The numbers changed'
    case 'mentions': {
      const count = mentionCount(list.rows.length)
      return list.scope === null ? count : `${list.scope} · ${count}`
    }
    case 'accounts': {
      const arr = list.groups.reduce((sum, g) => sum + g.account.arr, 0)
      const accounts = `${String(list.groups.length)} ${list.groups.length === 1 ? 'account' : 'accounts'}`
      return `${accounts} · ${formatUsd(arr)} ARR`
    }
  }
}

function description(list: EvidenceList): string {
  switch (list.kind) {
    case 'missing':
      return 'The problem, solution, or account is not on this map.'
    case 'stale':
      return 'New evidence arrived after this page loaded, so this list may not match the number you clicked.'
    case 'mentions':
    case 'accounts':
      return list.subjectTitle
  }
}

function EvidenceRows({ list, onReload }: { list: EvidenceList; onReload: () => void }) {
  switch (list.kind) {
    case 'missing':
      return <p className="text-ink-2">Pick a number on the detail to see the quotes behind it.</p>
    case 'stale':
      return <Button onClick={onReload}>Reload</Button>
    case 'mentions':
      return list.rows.map((quote) => <Quote key={quote.mentionId} quote={quote} />)
    case 'accounts':
      return list.groups.map(({ account, rows }) => (
        <section key={account.id} aria-label={account.name} className="mb-4">
          <h3 className="mb-2 flex items-baseline gap-3 border-b border-line-2 pb-1.5">
            <span className="flex-1 font-semibold">{account.name}</span>
            <span className="text-[12px] text-ink-3 tabular-nums">{mentionCount(rows.length)}</span>
            <span className="tabular-nums">{formatUsd(account.arr)}</span>
          </h3>
          {rows.map((quote) => (
            <Quote key={quote.mentionId} quote={quote} />
          ))}
        </section>
      ))
  }
}
