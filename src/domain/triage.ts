import { toConfidence, type Confidence, type MentionId, type OpportunityId, type Placement } from './types.ts'

/** Below the pack's place_confidence a placement needs review. It still counts toward every number. */
export function isLowConfidence(confidence: number, placeThreshold: number): boolean {
  return confidence < placeThreshold
}

/** How many placements sit in the triage queue. */
export function triageCount(confidences: readonly Confidence[], placeThreshold: number): number {
  return confidences.filter((c) => isLowConfidence(c, placeThreshold)).length
}

/** The PM's answer: keep the judge's opportunity, put the mention on another one, or say it is not a problem. */
export type HumanAnswer =
  | { readonly action: 'accept' | 'move'; readonly opportunityId: OpportunityId }
  | { readonly action: 'discard'; readonly opportunityId: null }

export type TriageChoice = { readonly action: 'accept' } | { readonly action: 'move'; readonly to: OpportunityId } | { readonly action: 'discard' }

/** One triage decision as stored: the judge's answer next to the PM's, a label for tuning the pack. */
export type TriageLabel = {
  readonly mentionId: MentionId
  readonly judgeOpportunityId: OpportunityId
  readonly judgeConfidence: Confidence
  readonly human: HumanAnswer
}

/** A person decided, so the placement no longer needs review. */
const HUMAN_CONFIDENCE = toConfidence(1)

/** The label a choice on `placement` writes. A move to the judge's own opportunity is an accept. */
export function decide(placement: Placement, choice: TriageChoice): TriageLabel {
  const judge = { mentionId: placement.mentionId, judgeOpportunityId: placement.opportunityId, judgeConfidence: placement.confidence }
  if (choice.action === 'discard') return { ...judge, human: { action: 'discard', opportunityId: null } }
  if (choice.action === 'move' && choice.to !== placement.opportunityId) return { ...judge, human: { action: 'move', opportunityId: choice.to } }
  return { ...judge, human: { action: 'accept', opportunityId: placement.opportunityId } }
}

/** The placement every number counts: the PM's answer over the judge's, or nothing once discarded. */
export function decidedPlacement(placement: Placement, human: HumanAnswer | null): Placement | null {
  if (!human) return placement
  if (human.action === 'discard') return null
  return { ...placement, opportunityId: human.opportunityId, confidence: HUMAN_CONFIDENCE }
}

/** Parses a stored decision's action and opportunity, which the table's check keeps consistent. */
export function toHumanAnswer(action: 'accept' | 'move' | 'discard', opportunityId: OpportunityId | null): HumanAnswer {
  if (action === 'discard') return { action, opportunityId: null }
  if (!opportunityId) throw new Error(`A ${action} decision names no opportunity`)
  return { action, opportunityId }
}
