import { and, asc, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import * as t from '@/db/schema'
import { triageCount } from '@/domain/triage'

/** Placements below the place threshold of the oldest workspace's newest pack: the number the map marks for review. */
export async function loadTriageCount(db: Db): Promise<number> {
  const [workspace] = await db.select({ id: t.workspace.id }).from(t.workspace).orderBy(asc(t.workspace.createdAt), asc(t.workspace.id)).limit(1)
  if (!workspace) return 0
  const [pack] = await db
    .select({ id: t.pack.id, placeThreshold: t.pack.placeThreshold })
    .from(t.pack)
    .where(eq(t.pack.workspaceId, workspace.id))
    .orderBy(desc(t.pack.createdAt), desc(t.pack.id))
    .limit(1)
  if (!pack) return 0
  const rows = await db
    .select({ confidence: t.placement.confidence })
    .from(t.placement)
    .innerJoin(t.mention, eq(t.mention.id, t.placement.mentionId))
    .innerJoin(t.item, eq(t.item.id, t.mention.itemId))
    .where(and(eq(t.mention.packId, pack.id), eq(t.item.workspaceId, workspace.id)))
  return triageCount(
    rows.map((r) => r.confidence),
    pack.placeThreshold,
  )
}
