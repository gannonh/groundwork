import pg from 'pg'
import { afterAll, describe, expect, test } from 'vitest'
import { pool } from '@/db/client'
import { healthResponse } from '@/db/health'
import { Route } from './health'

describe('GET /api/health', () => {
  afterAll(() => pool.end())

  test('the registered GET handler returns 200 and ok true when the database answers', async () => {
    const handlers = Route.options.server?.handlers
    if (typeof handlers !== 'object' || !('GET' in handlers)) throw new Error('GET /api/health is not registered')
    const response = await handlers.GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: true })
  })

  test('returns 503 and ok false when the database is unreachable', async () => {
    const deadPool = new pg.Pool({
      connectionString: 'postgres://groundwork:groundwork@127.0.0.1:1/groundwork',
      connectionTimeoutMillis: 2000,
    })
    try {
      const response = await healthResponse(deadPool)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ ok: false })
    } finally {
      await deadPool.end()
    }
  })
})
