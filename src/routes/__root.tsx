import type { ReactNode } from 'react'
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { TopBar } from '@/components/top-bar'
import { db } from '@/db/client'
import { loadTriageCount } from '@/server/triage-count.server'
import appCss from '@/styles/app.css?url'

const getTriageCount = createServerFn({ method: 'GET' }).handler(() => loadTriageCount(db))

export const Route = createRootRoute({
  loader: () => getTriageCount(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Groundwork' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  const triage = Route.useLoaderData()
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <TopBar triage={triage} />
        {children}
        <Scripts />
      </body>
    </html>
  )
}
