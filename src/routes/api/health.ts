import { createFileRoute } from '@tanstack/react-router'
import { pool } from '@/db/client'
import { healthResponse } from '@/db/health'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => healthResponse(pool),
    },
  },
})
