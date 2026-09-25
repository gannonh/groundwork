import type { Pool } from 'pg'

const headers = { 'Cache-Control': 'no-store' }

export async function healthResponse(pool: Pool): Promise<Response> {
  try {
    await pool.query('select 1')
    return Response.json({ ok: true }, { headers })
  } catch {
    return Response.json({ ok: false }, { status: 503, headers })
  }
}
