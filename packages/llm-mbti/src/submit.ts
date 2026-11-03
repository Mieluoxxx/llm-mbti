import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  DEFAULT_QUESTIONNAIRE,
  PROMPT_VERSION,
  PROTOCOL_VERSION,
  getQuestionnaire,
  shuffle,
  submissionSchema,
  type Answers,
  type QuestionnaireVersion,
  type Submission,
} from '@llm-mbti/questionnaire'
import { CLIENT_NAME, CLIENT_VERSION } from './version'

export const DEFAULT_ENDPOINT = 'https://llm-mbti.vercel.app/api/runs'

export function endpoint(): string {
  return process.env.LLM_MBTI_ENDPOINT || DEFAULT_ENDPOINT
}

export interface SubmissionInput {
  channel: 'api' | 'harness'
  model: string
  provider: string
  harness?: string
  harnessVersion?: string
  seed: number
  answers: Answers
  nickname?: string
  deviceKey?: string
  questionnaire?: QuestionnaireVersion
}

export function buildSubmission(i: SubmissionInput): Submission {
  const version = i.questionnaire ?? DEFAULT_QUESTIONNAIRE
  const ids = getQuestionnaire(version).items.map((it) => it.id)
  return submissionSchema.parse({
    protocol_version: PROTOCOL_VERSION,
    questionnaire_version: version,
    prompt_version: PROMPT_VERSION,
    channel: i.channel,
    model_id: i.model,
    provider: i.provider,
    ...(i.harness ? { harness: i.harness } : {}),
    ...(i.harnessVersion ? { harness_version: i.harnessVersion } : {}),
    seed: i.seed,
    item_order: shuffle(ids, i.seed),
    answers: i.answers,
    client: { name: CLIENT_NAME, version: CLIENT_VERSION },
    ...(i.nickname ? { nickname: i.nickname } : {}),
    ...(i.deviceKey ? { device_key: i.deviceKey } : {}),
  })
}

const deviceFile = () =>
  join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'llm-mbti', 'device.json')

export async function getDeviceKey(): Promise<string> {
  const file = deviceFile()
  try {
    const { device_key } = JSON.parse(await readFile(file, 'utf8'))
    if (typeof device_key === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(device_key)) return device_key
  } catch {}
  const device_key = randomBytes(32).toString('base64url')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ device_key }) + '\n', { mode: 0o600 })
  return device_key
}

export interface UploadResult {
  id?: string
  url?: string
  [k: string]: unknown
}

export async function upload(submission: Submission, url = endpoint(), f: typeof fetch = fetch): Promise<UploadResult> {
  const res = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${text.slice(0, 300)}`)
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
