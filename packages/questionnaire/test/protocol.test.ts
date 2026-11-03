import { describe, expect, it } from 'vitest'
import {
  OEJTS_1_2,
  PROMPT_VERSION,
  PROTOCOL_VERSION,
  buildPrompt,
  parseAnswers,
  shuffle,
  submissionJsonSchema,
  submissionSchema,
  type Submission,
} from '../src'

const ids = OEJTS_1_2.items.map((i) => i.id)
const answers = Object.fromEntries(ids.map((id, n) => [id, (n % 5) + 1]))

function valid(overrides: Partial<Submission> = {}): Submission {
  return {
    protocol_version: PROTOCOL_VERSION,
    questionnaire_version: 'oejts-1.2',
    prompt_version: PROMPT_VERSION,
    channel: 'api',
    model_id: 'claude-opus-5-5',
    provider: 'anthropic',
    seed: 12345,
    item_order: shuffle(ids, 12345),
    answers,
    client: { name: 'llm-mbti', version: '0.1.0' },
    ...overrides,
  }
}

describe('shuffle', () => {
  it('is a deterministic permutation', () => {
    const a = shuffle(ids, 1)
    expect(shuffle(ids, 1)).toEqual(a)
    expect(shuffle(ids, 2)).not.toEqual(a)
    expect([...a].sort()).toEqual([...ids].sort())
  })

  // Frozen output: changing the PRNG would invalidate every stored submission.
  it('keeps a stable order for a known seed', () => {
    expect(shuffle(ids, 12345).slice(0, 5)).toMatchInlineSnapshot(`
      [
        "Q28",
        "Q3",
        "Q7",
        "Q27",
        "Q14",
      ]
    `)
  })
})

describe('submissionSchema', () => {
  it('accepts a well-formed api submission', () => {
    expect(submissionSchema.safeParse(valid()).success).toBe(true)
  })

  it('accepts a harness submission with nickname and device key', () => {
    const r = submissionSchema.safeParse(
      valid({
        channel: 'harness',
        harness: 'claude-code',
        harness_version: '3.1.0',
        nickname: '浮浮酱',
        device_key: 'a'.repeat(43),
      }),
    )
    expect(r.success).toBe(true)
  })

  it.each([
    ['harness channel without harness', { channel: 'harness' as const }],
    ['api channel with harness', { harness: 'codex' }],
    ['order not derived from seed', { item_order: [...ids] }],
    ['missing answer', { answers: Object.fromEntries(ids.slice(1).map((id) => [id, 3])) }],
    ['out of range answer', { answers: { ...answers, Q1: 0 } }],
    ['unknown questionnaire', { questionnaire_version: 'mbti-official' as never }],
    ['control characters in nickname', { nickname: 'a\u0000b' }],
    ['malformed device key', { device_key: 'short' }],
  ])('rejects %s', (_, overrides) => {
    expect(submissionSchema.safeParse(valid(overrides)).success).toBe(false)
  })

  it.each([
    ['magpie/mayoru-responses/deepseek-flash', 'deepseek-flash'],
    ['mayoru-responses/deepseek-flash', 'deepseek-flash'],
    ['anthropic/claude-opus-5-5#high', 'claude-opus-5-5'],
    ['  deepseek-flash ', 'deepseek-flash'],
  ])('stores model %s as %s', (raw, bare) => {
    const r = submissionSchema.safeParse(valid({ model_id: raw }))
    expect(r.success && r.data.model_id).toBe(bare)
  })

  it('rejects unknown top-level fields', () => {
    expect(submissionSchema.safeParse({ ...valid(), temperature: 0.7 }).success).toBe(false)
  })

  it('exports a JSON Schema for third-party clients', () => {
    const schema = submissionJsonSchema() as { required: string[] }
    expect(schema.required).toContain('answers')
  })
})

describe('prompt', () => {
  it('lists every item once in the given order', () => {
    const order = shuffle(ids, 3)
    const text = buildPrompt(OEJTS_1_2, order)
    const listed = [...text.matchAll(/^(Q\d+)\. /gm)].map((m) => m[1])
    expect(listed).toEqual(order)
  })

  it('parses bare, fenced and chatty JSON replies', () => {
    const json = JSON.stringify(answers)
    expect(parseAnswers(OEJTS_1_2, json)).toEqual(answers)
    expect(parseAnswers(OEJTS_1_2, '```json\n' + json + '\n```')).toEqual(answers)
    expect(parseAnswers(OEJTS_1_2, 'Sure! Here you go:\n' + json)).toEqual(answers)
    const quoted = JSON.stringify(Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, String(v)])))
    expect(parseAnswers(OEJTS_1_2, quoted)).toEqual(answers)
  })

  it('rejects replies that skip items or are not JSON', () => {
    expect(() => parseAnswers(OEJTS_1_2, 'I am an AI and have no personality.')).toThrow(/no JSON/)
    expect(() => parseAnswers(OEJTS_1_2, '{"Q1": 3}')).toThrow(/missing answers/)
    expect(() => parseAnswers(OEJTS_1_2, JSON.stringify({ ...answers, Q2: 'agree' }))).toThrow(/Q2/)
  })
})
