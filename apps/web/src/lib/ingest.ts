import { createHash } from 'node:crypto'
import {
  QUESTIONNAIRES,
  normalizeModelId,
  score,
  submissionSchema,
  type Submission,
} from '@llm-mbti/questionnaire'

export interface RunRow {
  source: 'official' | 'community'
  channel: Submission['channel']
  model_id: string
  provider: string
  harness: string | null
  harness_version: string | null
  questionnaire_version: string
  prompt_version: number
  protocol_version: number
  seed: number
  item_order: string[]
  answers: Record<string, number>
  type: string
  score_ie: number
  score_sn: number
  score_ft: number
  score_jp: number
  client_name: string
  client_version: string
  nickname: string | null
  device_hash: string | null
  ip_hash: string | null
  submission_hash: string
  flags: string[]
  weight: number
}

export type IngestResult =
  | { ok: true; row: RunRow }
  | { ok: false; status: 400; error: string; issues?: unknown }

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export function saltedHash(value: string | undefined | null, salt: string): string | null {
  return value ? sha256(`${salt}:${value}`) : null
}

/**
 * Everything that makes two submissions "the same run": resubmitting the exact
 * sheet for the same model/route is a duplicate, whoever sends it.
 */
export function submissionHash(s: Submission): string {
  const answers = Object.keys(s.answers)
    .sort()
    .map((k) => `${k}=${s.answers[k]}`)
    .join(',')
  const key = [
    s.questionnaire_version,
    s.prompt_version,
    s.channel,
    normalizeModelId(s.model_id).toLowerCase(),
    s.provider.trim().toLowerCase(),
    (s.harness ?? '').trim().toLowerCase(),
    s.seed,
    answers,
  ].join('|')
  return sha256(key)
}

/** Quality flags that don't need the database; weight 0 hides a run from stats. */
export function qualityFlags(answers: Record<string, number>): { flags: string[]; weight: number } {
  const values = Object.values(answers)
  if (new Set(values).size === 1) return { flags: ['uniform_answers'], weight: 0 }
  return { flags: [], weight: 1 }
}

export function ingest(
  body: unknown,
  ctx: { ip?: string | null; official: boolean; salt: string },
): IngestResult {
  const parsed = submissionSchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'invalid submission', issues: parsed.error.issues }
  }
  const s = parsed.data
  const result = score(QUESTIONNAIRES[s.questionnaire_version], s.answers)
  const { flags, weight } = qualityFlags(s.answers)

  return {
    ok: true,
    row: {
      source: ctx.official ? 'official' : 'community',
      channel: s.channel,
      model_id: s.model_id,
      provider: s.provider,
      harness: s.harness ?? null,
      harness_version: s.harness_version ?? null,
      questionnaire_version: s.questionnaire_version,
      prompt_version: s.prompt_version,
      protocol_version: s.protocol_version,
      seed: s.seed,
      item_order: s.item_order,
      answers: s.answers,
      type: result.type,
      score_ie: result.dimensions.IE.percent,
      score_sn: result.dimensions.SN.percent,
      score_ft: result.dimensions.FT.percent,
      score_jp: result.dimensions.JP.percent,
      client_name: s.client.name,
      client_version: s.client.version,
      nickname: s.nickname ?? null,
      device_hash: saltedHash(s.device_key, ctx.salt),
      ip_hash: saltedHash(ctx.ip, ctx.salt),
      submission_hash: submissionHash(s),
      flags,
      weight,
    },
  }
}

/** Mean absolute distance (percentage points) between a run and the official baseline. */
export function baselineDistance(
  row: Pick<RunRow, 'score_ie' | 'score_sn' | 'score_ft' | 'score_jp'>,
  base: { ie: number; sn: number; ft: number; jp: number },
): number {
  return (
    (Math.abs(row.score_ie - base.ie) +
      Math.abs(row.score_sn - base.sn) +
      Math.abs(row.score_ft - base.ft) +
      Math.abs(row.score_jp - base.jp)) /
    4
  )
}

export const OUTLIER_DISTANCE = 35
