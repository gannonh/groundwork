import pg from 'pg'
import { afterAll, describe, expect, test } from 'vitest'
import { pool } from '@/db/client'
import { healthResponse } from '@/db/health'

describe('GET /api/health', () => {
  afterAll(() => pool.end())

  test('returns 200 and ok true when the database answers', async () => {
    const response = await healthResponse(pool)
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
