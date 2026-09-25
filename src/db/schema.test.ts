import { afterAll, describe, expect, test } from 'vitest'
import { pool } from './client.ts'
import { opportunity, pack, workspace } from './schema.ts'
import { rollbackAfter, violatedConstraint } from './testing.ts'
import type { Confidence, OpportunityId, WorkspaceId } from '../domain/types.ts'

const WORKSPACE_A = '00000000-0000-8000-8000-00000000000a' as WorkspaceId
const WORKSPACE_B = '00000000-0000-8000-8000-00000000000b' as WorkspaceId
const OUTCOME_A = '00000000-0000-8000-8000-0000000000a1' as OpportunityId

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

  test("a problem's parent outcome must belong to the problem's workspace", async () => {
    const results = await rollbackAfter(async (tx) => {
      await tx.insert(workspace).values([
        { id: WORKSPACE_A, slug: 'schema-test-a', name: 'A' },
        { id: WORKSPACE_B, slug: 'schema-test-b', name: 'B' },
      ])
      await tx.insert(opportunity).values({ id: OUTCOME_A, workspaceId: WORKSPACE_A, kind: 'outcome', title: 'Outcome A' })
      const insertProblem = (workspaceId: WorkspaceId) =>
        violatedConstraint(tx, (sp) =>
          sp.insert(opportunity).values({
            workspaceId,
            kind: 'problem',
            parentId: OUTCOME_A,
            parentKind: 'outcome',
            title: 'Problem',
          }),
        )
      return { otherWorkspace: await insertProblem(WORKSPACE_B), sameWorkspace: await insertProblem(WORKSPACE_A) }
    })
    expect(results).toEqual({ otherWorkspace: 'opportunity_parent_fk', sameWorkspace: null })
  })
})
