import { Link } from '@tanstack/react-router'

const navItems = [
  { to: '/', label: 'Opportunities' },
  { to: '/triage', label: 'Triage' },
  { to: '/sources', label: 'Sources' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/packs', label: 'Packs' },
] as const

export function TopBar() {
  return (
    <header className="flex h-12 items-center gap-6 border-b bg-card px-5">
      <div className="flex shrink-0 items-center gap-2 font-bold tracking-[-0.01em]">
        <div className="size-[18px] rounded-[5px] bg-[linear-gradient(135deg,#4f46e5,#0f766e)]" />
        <span className="max-sm:sr-only">Groundwork</span>
      </div>
      <nav className="flex min-w-0 gap-1 overflow-x-auto">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === '/' }}
            className="rounded-md px-2.5 py-1.5 font-medium whitespace-nowrap"
            activeProps={{ className: 'bg-line-2 text-foreground' }}
            inactiveProps={{ className: 'text-ink-2' }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
