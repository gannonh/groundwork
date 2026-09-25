import { afterAll, describe, expect, test } from 'vitest'
import { pool } from './client.ts'
import { pack, workspace } from './schema.ts'
import { rollbackAfter, violatedConstraint } from './testing.ts'
import type { Confidence, WorkspaceId } from '../domain/types.ts'

const WORKSPACE_A = '00000000-0000-8000-8000-00000000000a' as WorkspaceId

describe('schema constraints', () => {
  afterAll(() => pool.end())

  test('a pack must pin its judge model to a name and semantic version', async () => {
    const results = await rollbackAfter(async (tx) => {
      await tx.insert(workspace).values({ id: WORKSPACE_A, slug: 'schema-test-a', name: 'A' })
      const insertPack = (judgeModel: string) =>
        violatedConstraint(tx, (sp) =>
          sp.insert(pack).values({
            workspaceId: WORKSPACE_A,
            name: 'product-insights',
            version: judgeModel,
            judgeModel,
            detectThreshold: 0.6 as Confidence,
            placeThreshold: 0.7 as Confidence,
            definition: {},
          }),
        )
      return {
        latest: await insertPack('jev-LATEST'),
        bare: await insertPack('jev'),
        pinned: await insertPack('jev-1.13.0'),
      }
    })
    expect(results).toEqual({ latest: 'pack_judge_model_pinned', bare: 'pack_judge_model_pinned', pinned: null })
  })
})
