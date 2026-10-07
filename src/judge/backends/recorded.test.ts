import { describe, expect, test } from 'vitest'
import type { ItemId, RedactedText } from '../../domain/types.ts'
import { answerKey } from '../key.ts'
import type { Question } from '../types.ts'
import { createRecordedJudge, parseRecording, serializeLine } from './recorded.ts'

const ITEM = '0199aaaa-0000-7000-8000-000000000042' as ItemId
const TEXT = '0: The totals are wrong.' as RedactedText
const NOUL = { key: 'states_problem', type: 'noul', instructions: 'Customer describes a problem' } as const satisfies Question
const CHOICE = { key: 'role', type: 'choice', options: ['admin', 'unknown'] } as const satisfies Question

const recording = (...lines: { question: Question; text?: string; model?: string; raw: unknown }[]) =>
  parseRecording(
    lines
      .map(({ question, text, model, raw }) =>
        serializeLine({ key: answerKey('0.3.0', text ?? TEXT, question), question: question.key, model: model ?? 'jev-1.13.0', raw }),
      )
      .join('\n'),
  )

describe('the recorded judge', () => {
  test('a question with no recorded answer throws with the item ID in the message', async () => {
    const judge = createRecordedJudge(recording({ question: NOUL, raw: { p_yes: 0.9 } }), { packVersion: '0.3.0', model: 'jev-1.13.0' })
    await expect(judge.answer({ itemId: ITEM, text: TEXT }, [NOUL, CHOICE] as const)).rejects.toThrow(
      `No recorded answer for item ${ITEM}, question "role"`,
    )
  })

  test('the same text under another pack version has no answer', async () => {
    const judge = createRecordedJudge(recording({ question: NOUL, raw: { p_yes: 0.9 } }), { packVersion: '0.3.1', model: 'jev-1.13.0' })
    await expect(judge.answer({ itemId: ITEM, text: TEXT }, [NOUL] as const)).rejects.toThrow(`No recorded answer for item ${ITEM}`)
  })

  test('recorded answers replay as contract answers, in question order', async () => {
    const judge = createRecordedJudge(
      recording({ question: NOUL, raw: { p_yes: 0.9 } }, { question: CHOICE, raw: { probabilities: { admin: 0.8, unknown: 0.2 }, confidence: 0.8 } }),
      { packVersion: '0.3.0', model: 'jev-1.13.0' },
    )
    const answers = await judge.answer({ itemId: ITEM, text: TEXT }, [CHOICE, NOUL] as const)
    const [role, noul] = answers
    expect(role).toEqual({ value: { type: 'choice', option: 'admin' }, probabilities: { admin: 0.8, unknown: 0.2 }, confidence: 0.8 })
    expect(noul.value).toEqual({ type: 'noul', yes: 0.9 })
    expect(noul.probabilities.no).toBeCloseTo(0.1, 10)
    // Distance from 0.5, scaled to [0, 1].
    expect(noul.confidence).toBeCloseTo(0.8, 10)
    expect(judge.provenance).toEqual({ backend: 'recorded', modelVersion: 'jev-1.13.0' })
  })

  test('an answer recorded by another model than the pack pins is refused', async () => {
    const judge = createRecordedJudge(recording({ question: NOUL, model: 'jev-1.12.0', raw: { p_yes: 0.9 } }), {
      packVersion: '0.3.0',
      model: 'jev-1.13.0',
    })
    await expect(judge.answer({ itemId: ITEM, text: TEXT }, [NOUL] as const)).rejects.toThrow('came from jev-1.12.0, but the pack pins jev-1.13.0')
  })

  test('a malformed answer fails with the item ID too', async () => {
    const judge = createRecordedJudge(recording({ question: CHOICE, raw: { probabilities: { admin: 0.2, unknown: 0.2 }, confidence: 0.8 } }), {
      packVersion: '0.3.0',
      model: 'jev-1.13.0',
    })
    await expect(judge.answer({ itemId: ITEM, text: TEXT }, [CHOICE] as const)).rejects.toThrow(
      `The recorded answer for item ${ITEM}, question "role" is malformed: Answer to "role" has probabilities that sum to 0.4, not 1`,
    )
  })
})

describe('parseRecording', () => {
  test('a bad line is reported with its line number', () => {
    expect(() => parseRecording('{"key":"x"}\n')).toThrow('Recording line 1 is invalid')
  })
})
