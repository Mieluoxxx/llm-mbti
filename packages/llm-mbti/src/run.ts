import {
  AnswerError,
  DEFAULT_QUESTIONNAIRE,
  buildPrompt,
  getQuestionnaire,
  parseAnswers,
  randomSeed,
  score,
  shuffle,
  type Answers,
  type QuestionnaireVersion,
  type ScoreResult,
  type Submission,
} from '@llm-mbti/questionnaire'
import { complete } from './client'
import { PRESETS, detectProvider, type Protocol } from './providers'
import { buildSubmission, getDeviceKey, upload, type UploadResult } from './submit'

export interface RunOptions {
  model: string
  /** A preset name (anthropic, openai, deepseek, openrouter) or any label for a custom baseURL. */
  provider?: string
  baseURL?: string
  protocol?: Protocol
  apiKey?: string
  seed?: number
  maxTokens?: number
  /** Extra tries when the reply can't be parsed into a full answer sheet. */
  attempts?: number
  questionnaire?: QuestionnaireVersion
  fetch?: typeof fetch
  signal?: AbortSignal
}

export interface ShareOptions {
  nickname?: string
  /** Defaults to a random key stored in ~/.config/llm-mbti/device.json. */
  deviceKey?: string | false
  endpoint?: string
}

export interface RunResult extends ScoreResult {
  model: string
  provider: string
  seed: number
  itemOrder: string[]
  answers: Answers
  raw: string
  attempts: number
  toSubmission(o?: Omit<ShareOptions, 'endpoint'>): Promise<Submission>
  upload(o?: ShareOptions): Promise<UploadResult>
}

export function resolveTarget(o: Pick<RunOptions, 'provider' | 'baseURL' | 'protocol' | 'apiKey'>) {
  const preset = o.provider && !o.baseURL ? PRESETS[o.provider] : undefined
  if (!o.baseURL && !preset) {
    throw new Error(
      `unknown provider "${o.provider ?? ''}": use one of ${Object.keys(PRESETS).join(', ')}, or pass baseURL`,
    )
  }
  const baseURL = o.baseURL ?? preset!.baseURL
  const provider = o.provider ?? detectProvider(baseURL)
  const protocol = o.protocol ?? preset?.protocol ?? 'openai'
  const apiKey = o.apiKey ?? (preset ? process.env[preset.apiKeyEnv] : undefined)
  if (!apiKey) {
    throw new Error(preset ? `missing API key: set ${preset.apiKeyEnv} or pass apiKey` : 'missing API key')
  }
  return { baseURL, provider, protocol, apiKey }
}

export async function runTest(o: RunOptions): Promise<RunResult> {
  const target = resolveTarget(o)
  const version = o.questionnaire ?? DEFAULT_QUESTIONNAIRE
  const q = getQuestionnaire(version)
  const seed = o.seed ?? randomSeed()
  const itemOrder = shuffle(
    q.items.map((i) => i.id),
    seed,
  )
  const prompt = buildPrompt(q, itemOrder)

  const maxAttempts = Math.max(1, o.attempts ?? 2)
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await complete({
      ...target,
      model: o.model,
      prompt,
      maxTokens: o.maxTokens,
      fetch: o.fetch,
      signal: o.signal,
    })
    let answers: Answers
    try {
      answers = parseAnswers(q, raw)
    } catch (e) {
      if (!(e instanceof AnswerError)) throw e
      lastError = e
      continue
    }

    const result = score(q, answers)
    const toSubmission = async (s: Omit<ShareOptions, 'endpoint'> = {}) =>
      buildSubmission({
        channel: 'api',
        model: o.model,
        provider: target.provider,
        seed,
        answers,
        questionnaire: version,
        nickname: s.nickname,
        deviceKey: s.deviceKey === false ? undefined : (s.deviceKey ?? (await getDeviceKey())),
      })
    return {
      ...result,
      model: o.model,
      provider: target.provider,
      seed,
      itemOrder,
      answers,
      raw,
      attempts: attempt,
      toSubmission,
      upload: async (s: ShareOptions = {}) => upload(await toSubmission(s), s.endpoint),
    }
  }
  throw lastError
}
