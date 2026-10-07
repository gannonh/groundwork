/**
 * Writes the recorded judge's fixture: `node scripts/record-judge.ts [--csv path] [--out path] [--pack path]`.
 *
 * It runs the real pipeline stages over every row of a CSV export against a simulated judge, and writes each answer
 * under the key the recorded backend looks it up by. The simulated judge is a seeded stand-in for Jev: keyword rules
 * choose the problem a sentence is about, and a PRNG seeded by the question and the text shapes how sure the judge
 * sounds. The same inputs always write the same file. KAT-3467 replaces the fixture with answers recorded from Jev.
 *
 * Rerun it after editing the pack's questions or version, since both are part of every key.
 */
import { createHash } from 'node:crypto'
import * as NodeFs from 'node:fs'
import { parseArgs } from 'node:util'
import { NONE_OF_THESE, type ItemId, type NonEmptyArray, type OpportunityId } from '../src/domain/types.ts'
import { parseCsv } from '../src/ingest/csv.ts'
import { guessMapping, toItemDrafts } from '../src/ingest/mapping.ts'
import { adapt, rawSchemaFor } from '../src/judge/adapters.ts'
import { serializeLine } from '../src/judge/backends/recorded.ts'
import { answerKey } from '../src/judge/key.ts'
import type { Judge, JudgeState, Question } from '../src/judge/types.ts'
import { parsePack } from '../src/pack/pack.ts'
import { parseTemplate } from '../src/pack/template.ts'
import { judgeItem } from '../src/pipeline/item.ts'
import type { PlaceTree } from '../src/pipeline/place.ts'

const { values } = parseArgs({
  options: {
    csv: { type: 'string', default: 'fixtures/exports/zendesk-500.csv' },
    out: { type: 'string', default: 'fixtures/judge/zendesk-500.jsonl' },
    pack: { type: 'string', default: 'packs/product-insights.yaml' },
    template: { type: 'string', default: 'templates/b2b-saas.yaml' },
  },
})

function unwrap<T>(parsed: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.value
}

type Rng = () => number
function mulberry32(seed: number): Rng {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rngFor = (...parts: string[]): Rng => mulberry32(createHash('sha256').update(parts.join('\u0000')).digest().readUInt32BE(0))
const between = (r: Rng, low: number, high: number) => low + r() * (high - low)
const round = (n: number) => Math.round(n * 1000) / 1000

/** What a sentence has to say for the simulated judge to hear a given problem in it. */
const TOPICS: readonly (readonly [problem: string, pattern: RegExp])[] = [
  ['CSV imports fail silently on malformed rows', /csv|importer|malformed|rows? (?:came|are missing|is malformed)|no error message|split the file/gi],
  ['Field mapping must be redone for every import', /map all|mapping|columns again|same headers|remember the mapping/gi],
  ["Dashboard totals don't match the source system", /salesforce|reconcile|mismatch|source system|totals? (?:still )?differ|which rows make up/gi],
  ["Can't tell when data was last refreshed", /refresh|last updated|stale|sync was|data was current|is the data current/gi],
  ['Exported charts lose formatting in slides', /slides|powerpoint|png|svg|board deck|high-resolution/gi],
  ["Admins can't restrict access by team", /restrict|salary data|groups|finance team only|share a folder/gi],
  ['Usage-based bill is unpredictable', /invoice|overage|spending cap|usage breakdown|query volume/gi],
  ['SSO setup requires contacting support', /sso|saml|okta/gi],
]
const PROBLEM_CUES = /can't|cannot|don't|doesn't|not |no error|wrong|missing|fail|blurry|higher|lost|gone|stale|broke|reset|overlap|differ|block|deal breaker|hold|silently|unclear|mismatch|rejected/i
const SOLUTION_CUES = /could the app|can admins|could |please |would fix|would save|is there a way|should |instead of|an svg|simple "last updated"/i
const WORKAROUND_CUES = /by hand|screenshot|rebuild|split the file|prove|reconcile it ourselves|take screenshots|manually/i
const PAIN_CUES: readonly (readonly [level: number, pattern: RegExp])[] = [
  [3, /deal breaker|on hold|hold until/i],
  [2, /blocks|incomplete|unusable|cannot work/i],
  [1, /afternoon|every time|spends about|rebuild|hours|twice this week|back and forth/i],
]

function topicOf(text: string): string | null {
  let best: { problem: string; score: number } | null = null
  for (const [problem, pattern] of TOPICS) {
    const score = (text.match(pattern) ?? []).length
    if (score > (best?.score ?? 0)) best = { problem, score }
  }
  return best?.problem ?? null
}

/** Probabilities over `names` with `top` on `winner` and the rest split by `weights` (equal when absent). */
function distribute(names: readonly string[], winner: string, top: number, weights: Readonly<Record<string, number>> = {}) {
  const rest = names.filter((n) => n !== winner)
  const total = rest.reduce((sum, n) => sum + (weights[n] ?? 1), 0)
  const out: Record<string, number> = {}
  let used = 0
  for (const name of rest) {
    out[name] = round(((1 - top) * (weights[name] ?? 1)) / total)
    used += out[name]
  }
  out[winner] = round(1 - used)
  return out
}

function simulate(question: Question, text: string, tree: PlaceTree): unknown {
  const r = rngFor(question.key, text)
  switch (question.type) {
    case 'noul': {
      const cues = { states_problem: PROBLEM_CUES, proposes_solution: SOLUTION_CUES, workaround: WORKAROUND_CUES }[question.key]
      if (!cues) throw new Error(`The simulated judge has no rule for the question "${question.key}"`)
      const yes = cues.test(text)
      // A few real problems read as indirect, which is how a literal judge misses them.
      const missed = question.key === 'states_problem' && yes && r() < 0.05
      return { p_yes: round(missed ? between(r, 0.3, 0.55) : yes ? between(r, 0.82, 0.99) : between(r, 0.03, 0.3)) }
    }
    case 'score': {
      const level = PAIN_CUES.find(([, pattern]) => pattern.test(text))?.[0] ?? 0
      const top = round(between(r, 0.55, 0.85))
      const names = question.levels
      const winner = names[level] ?? names[0]
      const weights = Object.fromEntries(names.map((n, i) => [n, 1 / (1 + Math.abs(i - level) * 2)]))
      return { probabilities: distribute(names, winner, top, weights), confidence: top }
    }
    case 'choice':
      return simulateChoice(question, text, tree, r)
  }
}

function simulateChoice(question: Question & { type: 'choice' }, text: string, tree: PlaceTree, r: Rng): unknown {
  const options = question.options
  if (question.key === 'role') {
    const winner = options[Math.floor(r() * r() * options.length)] ?? options[0]
    const top = round(between(r, 0.4, 0.8))
    return { probabilities: distribute(options, winner, top), confidence: top }
  }
  if (question.key === 'quote') {
    // The sentence with the most cues carries the mention.
    const scored = text.split('\n').map((line) => ({ ordinal: line.slice(0, line.indexOf(':')), score: (PROBLEM_CUES.test(line) ? 2 : 0) + (topicOf(line) ? 2 : 0) + (SOLUTION_CUES.test(line) ? 1 : 0) }))
    const winner = scored.reduce((top, s) => (s.score > top.score ? s : top)).ordinal
    const top = round(between(r, 0.6, 0.88))
    return { probabilities: distribute(options, winner, top, Object.fromEntries(scored.map((s) => [s.ordinal, 1 + s.score]))), confidence: top }
  }
  const outcomeLevel = question.key === 'place_outcome'
  const topic = topicOf(text)
  const topicOutcome = tree.find((o) => o.problems.some((p) => p.title === topic))?.title ?? null
  // How the judge sounds about this mention is fixed by the mention's text, so both levels agree.
  const mood = rngFor('mood', text)()
  const sure = topic !== null && mood < 0.78
  const unsure = topic !== null && mood >= 0.78 && mood < 0.9
  const borderline = topic !== null && mood >= 0.9 && mood < 0.95
  const off = topic === null ? mood < 0.5 : mood >= 0.95

  if (outcomeLevel) {
    const others = options.filter((o) => o !== NONE_OF_THESE && o !== topicOutcome)
    const runnerUp = others[Math.floor(r() * others.length)] ?? NONE_OF_THESE
    if (off) return answer(options, NONE_OF_THESE, between(r, 0.5, 0.7), { [runnerUp]: 3 })
    const winner = topicOutcome ?? runnerUp
    const top = sure || borderline ? between(r, 0.9, 0.99) : between(r, 0.62, 0.82)
    return answer(options, winner, top, { [runnerUp]: 4, [NONE_OF_THESE]: 0.3 })
  }
  const outcomeTitle = question.key.slice('place_problem:'.length)
  const inBranch = topic !== null && tree.find((o) => o.title === outcomeTitle)?.problems.some((p) => p.title === topic)
  if (!inBranch) return answer(options, NONE_OF_THESE, between(r, 0.5, 0.8), {})
  const top = sure ? between(r, 0.88, 0.98) : borderline ? between(r, 0.72, 0.8) : between(r, 0.6, 0.86)
  // An unsure judge sometimes prefers a neighbouring problem over the one the text is about.
  const winner = unsure && r() < 0.25 ? (options.find((o) => o !== topic && o !== NONE_OF_THESE) ?? topic) : topic
  return answer(options, winner, top, { [NONE_OF_THESE]: 0.3 })
}

function answer(options: readonly string[], winner: string, top: number, weights: Record<string, number>) {
  const t = round(top)
  return { probabilities: distribute(options, winner, t, weights), confidence: t }
}

function main(): void {
  const pack = unwrap(parsePack(NodeFs.readFileSync(values.pack, 'utf8')))
  const template = unwrap(parseTemplate(NodeFs.readFileSync(values.template, 'utf8')))
  const table = unwrap(parseCsv(NodeFs.readFileSync(values.csv)))
  const { drafts } = unwrap(toItemDrafts(table, guessMapping(table)))

  let n = 0
  const nextId = (): OpportunityId => `00000000-0000-8000-8000-${String(++n).padStart(12, '0')}` as OpportunityId
  const tree: PlaceTree = template.outcomes.map((o) => ({
    id: nextId(),
    title: o.title,
    problems: o.problems.map((p) => ({ id: nextId(), title: p.title })),
  }))

  const lines = new Map<string, string>()
  const judge: Judge = {
    provenance: { backend: 'recorded', modelVersion: pack.judge },
    answer(state: JudgeState, questions: NonEmptyArray<Question>) {
      const answers = questions.map((question) => {
        const raw = rawSchemaFor(question.type).parse(simulate(question, state.text, tree))
        const key = answerKey(pack.version, state.text, question)
        lines.set(key, serializeLine({ key, question: question.key, model: pack.judge, raw }))
        return adapt(question, raw)
      })
      return Promise.resolve(answers as never)
    },
  }

  const stats = { items: 0, mentions: 0, placed: 0, triage: 0, unplaced: 0 }
  const perProblem = new Map<OpportunityId, number>()
  const run = async () => {
    for (const [i, draft] of drafts.entries()) {
      const sentences = draft.sentences.map((text, ordinal) => ({ ordinal, text })) as unknown as NonEmptyArray<{
        ordinal: number
        text: (typeof draft.sentences)[number]
      }>
      const judged = await judgeItem(judge, pack, tree, { id: `item-${String(i)}` as ItemId, sentences })
      stats.items++
      if (!judged.mention) continue
      stats.mentions++
      const placement = judged.mention.placement
      if (!placement) stats.unplaced++
      else {
        perProblem.set(placement.opportunityId, (perProblem.get(placement.opportunityId) ?? 0) + 1)
        if (placement.confidence < pack.thresholds.place_confidence) stats.triage++
        else stats.placed++
      }
      // psql's `confidence < 0.7` and the app disagree about a placement exactly on the threshold, so say so.
      if (placement && Math.abs(placement.confidence - pack.thresholds.place_confidence) < 1e-4) {
        console.warn(`Item ${String(i)} places at ${String(placement.confidence)}, on the pack's threshold.`)
      }
    }
  }
  void run().then(() => {
    NodeFs.mkdirSync(values.out.slice(0, values.out.lastIndexOf('/')), { recursive: true })
    NodeFs.writeFileSync(values.out, [...lines.values()].join('\n') + '\n')
    const share = ((100 * stats.triage) / Math.max(1, stats.placed + stats.triage)).toFixed(1)
    console.log(`Wrote ${String(lines.size)} answers for ${String(stats.items)} items to ${values.out}.`)
    for (const problem of tree.flatMap((o) => o.problems)) console.log(`  ${String(perProblem.get(problem.id) ?? 0).padStart(4)}  ${problem.title}`)
    console.log(`${String(stats.mentions)} mentions: ${String(stats.placed)} placed, ${String(stats.triage)} in triage (${share}% of placements), ${String(stats.unplaced)} unplaced.`)
  })
}

main()
