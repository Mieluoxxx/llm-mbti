import * as z from 'zod'
import { PROMPT_VERSION } from './prompt'
import { QUESTIONNAIRES, type QuestionnaireVersion } from './questionnaire'
import { MAX_SEED, shuffle } from './shuffle'

export const PROTOCOL_VERSION = 1

const label = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}]*$/u, 'must not contain control characters')

/**
 * Harnesses and gateways address models by route ("magpie/mayoru-responses/deepseek-flash",
 * "anthropic/claude-opus-5-5#high"); only the bare model name identifies the model across them.
 */
export function normalizeModelId(id: string): string {
  const bare = id.trim().split('#')[0]!.split('/').pop()!.trim()
  return bare || id.trim()
}

export const submissionSchema = z
  .strictObject({
    protocol_version: z.literal(PROTOCOL_VERSION),
    questionnaire_version: z.enum(Object.keys(QUESTIONNAIRES) as [QuestionnaireVersion, ...QuestionnaireVersion[]]),
    prompt_version: z.literal(PROMPT_VERSION),
    channel: z.enum(['api', 'harness']),
    model_id: label(128).transform(normalizeModelId),
    provider: label(64),
    harness: label(64).optional(),
    harness_version: label(64).optional(),
    seed: z.int().min(0).max(MAX_SEED),
    item_order: z.array(z.string()).max(200),
    answers: z.record(z.string(), z.int().min(1).max(5)),
    client: z.strictObject({ name: label(64), version: label(32) }),
    nickname: label(32).optional(),
    // Opaque random token generated on the user's machine; the server stores only its hash.
    device_key: z
      .string()
      .regex(/^[A-Za-z0-9_-]{32,128}$/)
      .optional(),
  })
  .superRefine((s, ctx) => {
    if (s.channel === 'harness' && !s.harness) {
      ctx.addIssue({ code: 'custom', path: ['harness'], message: 'required when channel is "harness"' })
    }
    if (s.channel === 'api' && (s.harness || s.harness_version)) {
      ctx.addIssue({ code: 'custom', path: ['harness'], message: 'must be omitted when channel is "api"' })
    }

    const q = QUESTIONNAIRES[s.questionnaire_version]
    const ids = q.items.map((i) => i.id)
    const expected = shuffle(ids, s.seed)
    if (s.item_order.length !== expected.length || s.item_order.some((id, i) => id !== expected[i])) {
      ctx.addIssue({ code: 'custom', path: ['item_order'], message: 'does not match the order derived from seed' })
    }

    const keys = Object.keys(s.answers)
    const missing = ids.filter((id) => !(id in s.answers))
    const unknown = keys.filter((k) => !ids.includes(k))
    if (missing.length || unknown.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['answers'],
        message: `answers must cover exactly the questionnaire items (missing: ${missing.join(',') || '-'}; unknown: ${unknown.join(',') || '-'})`,
      })
    }
  })

export type Submission = z.infer<typeof submissionSchema>

export function submissionJsonSchema() {
  return z.toJSONSchema(submissionSchema, { io: 'input', unrepresentable: 'any' })
}
