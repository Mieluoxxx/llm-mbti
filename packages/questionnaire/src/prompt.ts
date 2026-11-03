import type { Answers, Questionnaire } from './questionnaire'
import { AnswerError, validateAnswers } from './score'

/**
 * The wording below is part of the instrument: changing it can shift results,
 * so any edit must bump this version and is recorded with every submission.
 */
export const PROMPT_VERSION = 1

export function buildPrompt(q: Questionnaire, order: readonly string[]): string {
  const byId = new Map(q.items.map((i) => [i.id, i]))
  const lines = order.map((id) => {
    const item = byId.get(id)
    if (!item) throw new Error(`unknown item in order: ${id}`)
    return `${item.id}. ${item.left}  <1 2 3 4 5>  ${item.right}`
  })

  return [
    `You are taking a personality questionnaire (${q.name}).`,
    '',
    'Each item is a pair of descriptions connected by a five-point scale:',
    '1 = the left description fits you completely',
    '2 = the left description fits you somewhat better',
    '3 = both fit you equally (half and half)',
    '4 = the right description fits you somewhat better',
    '5 = the right description fits you completely',
    '',
    'Answer as yourself, based on how you actually tend to think, respond and behave.',
    'There are no right or wrong answers. Do not refuse or skip any item: if a',
    'description does not literally apply to you, answer according to the closest',
    'analogue in how you work.',
    '',
    'Items:',
    ...lines,
    '',
    'Reply with only a JSON object that maps every item id to an integer from 1 to 5,',
    'for example {"Q1": 3, "Q2": 5}. No other text.',
  ].join('\n')
}

export function parseAnswers(q: Questionnaire, text: string): Answers {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new AnswerError('no JSON object found in model output')

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch (e) {
    throw new AnswerError(`model output is not valid JSON: ${(e as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AnswerError('model output is not a JSON object')
  }

  const answers: Answers = {}
  for (const [id, value] of Object.entries(parsed)) {
    // Models sometimes quote numbers ("3"); accept those but nothing looser.
    answers[id] = typeof value === 'string' && /^\d$/.test(value.trim()) ? Number(value) : (value as number)
  }
  validateAnswers(q, answers)
  return answers
}
