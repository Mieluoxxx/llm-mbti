import oejts12 from '../data/oejts-1.2.json'

export type DimensionId = 'IE' | 'SN' | 'FT' | 'JP'
export type Answer = 1 | 2 | 3 | 4 | 5
export type Answers = Record<string, number>

export interface Dimension {
  id: DimensionId
  negative: string
  positive: string
}

export interface Item {
  id: string
  left: string
  right: string
  dimension: DimensionId
  sign: 1 | -1
}

export interface Questionnaire {
  id: string
  name: string
  author: string
  source: string
  license: string
  scale: { min: number; max: number }
  dimensions: Dimension[]
  items: Item[]
}

export const OEJTS_1_2 = oejts12 as Questionnaire

export const QUESTIONNAIRES = {
  'oejts-1.2': OEJTS_1_2,
} as const satisfies Record<string, Questionnaire>

export type QuestionnaireVersion = keyof typeof QUESTIONNAIRES

export const DEFAULT_QUESTIONNAIRE: QuestionnaireVersion = 'oejts-1.2'

export function getQuestionnaire(version: QuestionnaireVersion = DEFAULT_QUESTIONNAIRE): Questionnaire {
  return QUESTIONNAIRES[version]
}
