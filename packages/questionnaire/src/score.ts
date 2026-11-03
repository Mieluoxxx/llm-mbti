import type { Answers, DimensionId, Questionnaire } from './questionnaire'

export interface DimensionScore {
  dimension: DimensionId
  raw: number
  min: number
  max: number
  /** 0–100, how far toward the positive pole (E / N / T / P). */
  percent: number
  letter: string
}

export interface ScoreResult {
  questionnaire: string
  type: string
  dimensions: Record<DimensionId, DimensionScore>
}

export class AnswerError extends Error {
  constructor(
    message: string,
    readonly itemIds: string[] = [],
  ) {
    super(message)
    this.name = 'AnswerError'
  }
}

export function validateAnswers(q: Questionnaire, answers: Answers): void {
  const known = new Set(q.items.map((i) => i.id))
  const missing = q.items.filter((i) => !(i.id in answers)).map((i) => i.id)
  if (missing.length) throw new AnswerError(`missing answers: ${missing.join(', ')}`, missing)

  const unknown = Object.keys(answers).filter((id) => !known.has(id))
  if (unknown.length) throw new AnswerError(`unknown items: ${unknown.join(', ')}`, unknown)

  const invalid = q.items
    .filter((i) => {
      const v = answers[i.id]
      return !Number.isInteger(v) || v! < q.scale.min || v! > q.scale.max
    })
    .map((i) => i.id)
  if (invalid.length) {
    throw new AnswerError(
      `answers must be integers ${q.scale.min}-${q.scale.max}: ${invalid.join(', ')}`,
      invalid,
    )
  }
}

/**
 * Equivalent to the OEJTS 1.2 formulas (e.g. IE = 30 - Q3 - Q7 ...): each
 * reverse-keyed item contributes (min + max - v), which folds the formula's
 * constant into the items so every dimension shares one scoring rule.
 */
export function score(q: Questionnaire, answers: Answers): ScoreResult {
  validateAnswers(q, answers)
  const flip = q.scale.min + q.scale.max

  const dimensions = {} as Record<DimensionId, DimensionScore>
  for (const d of q.dimensions) {
    const items = q.items.filter((i) => i.dimension === d.id)
    const raw = items.reduce((sum, i) => {
      const v = answers[i.id]!
      return sum + (i.sign === 1 ? v : flip - v)
    }, 0)
    const min = items.length * q.scale.min
    const max = items.length * q.scale.max
    // The official key resolves a tie at the midpoint to the negative pole (I/S/F/J).
    const letter = raw > (min + max) / 2 ? d.positive : d.negative
    const percent = Math.round(((raw - min) / (max - min)) * 1000) / 10
    dimensions[d.id] = { dimension: d.id, raw, min, max, percent, letter }
  }

  const type = q.dimensions.map((d) => dimensions[d.id].letter).join('')
  return { questionnaire: q.id, type, dimensions }
}
