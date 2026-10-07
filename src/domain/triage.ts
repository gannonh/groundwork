import type { Confidence } from './types.ts'

/** Below the pack's place_confidence a placement needs review. It still counts toward every number. */
export function isLowConfidence(confidence: number, placeThreshold: number): boolean {
  return confidence < placeThreshold
}

/** How many placements sit in the triage queue. */
export function triageCount(confidences: readonly Confidence[], placeThreshold: number): number {
  return confidences.filter((c) => isLowConfidence(c, placeThreshold)).length
}
