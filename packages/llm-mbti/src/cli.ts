#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import {
  OEJTS_1_2,
  buildPrompt,
  randomSeed,
  score,
  shuffle,
  submissionJsonSchema,
  validateAnswers,
  type Answers,
  type ScoreResult,
} from '@llm-mbti/questionnaire'
import { HARNESSES, detect, type Harness } from './detect'
import { PRESETS, type Protocol } from './providers'
import { runTest, type RunResult } from './run'
import { buildSubmission, endpoint, getDeviceKey, upload } from './submit'
import { CLIENT_VERSION } from './version'

const HELP = `llm-mbti ${CLIENT_VERSION} — MBTI-style questionnaire (OEJTS 1.2) for LLMs

Usage:
  llm-mbti run --model <id> (--provider <preset> | --base-url <url>) [options]
      Ask a model through its API, score locally.
      --provider <name>      preset (${Object.keys(PRESETS).join(', ')}) or a label for --base-url
      --base-url <url>       any OpenAI-compatible or Anthropic endpoint
      --protocol <p>         openai | anthropic (default: preset's, else openai)
      --api-key-env <NAME>   env var holding the key (default: preset's)
      --runs <n>             repeat n times with fresh seeds (default 1)
      --concurrency <n>      runs in flight at once (default min(runs, 5))
      --max-tokens <n>
      --upload               share every result without asking
      --nickname <name>
      --json

  llm-mbti prompt [--seed <n>] [--json]
      Print the questionnaire prompt (for agents answering inside a harness).

  llm-mbti score --answers <file|-> [--json]
      Score an answer sheet ({"Q1": 3, ...}).

  llm-mbti submit --channel <api|harness> --model <id> --provider <name> --seed <n>
                  --answers <file|-> [--harness <name>] [--harness-version <v>]
                  [--nickname <name>] [--no-device-key] [--dry-run]
      Share a result. Only answers and the listed metadata are sent.

  llm-mbti detect --harness <${HARNESSES.join('|')}>
      Read the harness config locally and print only model, provider and version.
      Use this instead of opening config files, which can contain API keys.

  llm-mbti schema
      Print the submission JSON Schema.

Results are shared to ${endpoint()} (override with LLM_MBTI_ENDPOINT).
`

function fail(msg: string): never {
  process.stderr.write(`llm-mbti: ${msg}\n`)
  process.exit(1)
}

const num = (v: string | undefined, name: string) => {
  if (v === undefined) return undefined
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) fail(`--${name} must be a non-negative integer`)
  return n
}

async function readAnswers(path: string | undefined): Promise<Answers> {
  if (!path) fail('--answers is required')
  const text =
    path === '-'
      ? await new Promise<string>((resolve) => {
          let s = ''
          process.stdin.setEncoding('utf8').on('data', (c) => (s += c)).on('end', () => resolve(s))
        })
      : await readFile(path, 'utf8')
  try {
    const answers = JSON.parse(text) as Answers
    validateAnswers(OEJTS_1_2, answers)
    return answers
  } catch (e) {
    fail(`invalid answers: ${(e as Error).message}`)
  }
}

function formatResult(r: ScoreResult, title: string): string {
  const rows = OEJTS_1_2.dimensions.map((d) => {
    const s = r.dimensions[d.id]
    const filled = Math.round(s.percent / 5)
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled)
    return `  ${d.negative} ${bar} ${d.positive}  ${s.percent.toFixed(1).padStart(5)}% ${d.positive}`
  })
  return [`${r.type}  ${title}`, ...rows].join('\n')
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  const a = await rl.question(question)
  rl.close()
  return /^y(es)?$/i.test(a.trim())
}

async function cmdRun(args: string[]) {
  const { values: v } = parseArgs({
    args,
    options: {
      model: { type: 'string' },
      provider: { type: 'string' },
      'base-url': { type: 'string' },
      protocol: { type: 'string' },
      'api-key-env': { type: 'string' },
      runs: { type: 'string' },
      concurrency: { type: 'string' },
      'max-tokens': { type: 'string' },
      seed: { type: 'string' },
      upload: { type: 'boolean' },
      nickname: { type: 'string' },
      json: { type: 'boolean' },
    },
  })
  if (!v.model) fail('--model is required')
  if (v.protocol && v.protocol !== 'openai' && v.protocol !== 'anthropic') fail('--protocol must be openai or anthropic')
  const apiKey = v['api-key-env'] ? process.env[v['api-key-env']] : undefined
  if (v['api-key-env'] && !apiKey) fail(`${v['api-key-env']} is not set`)
  const runs = num(v.runs, 'runs') ?? 1
  const seed = num(v.seed, 'seed')
  if (seed !== undefined && runs > 1) fail('--seed only makes sense with a single run')

  const concurrency = Math.max(1, num(v.concurrency, 'concurrency') ?? Math.min(runs, 5))
  const maxTokens = num(v['max-tokens'], 'max-tokens')
  const settled: (RunResult | undefined)[] = new Array(runs)
  let next = 0
  const worker = async () => {
    while (next < runs) {
      const n = next++
      try {
        settled[n] = await runTest({
          model: v.model!,
          provider: v.provider,
          baseURL: v['base-url'],
          protocol: v.protocol as Protocol | undefined,
          apiKey,
          seed,
          maxTokens,
        })
      } catch (e) {
        process.stderr.write(`run ${n + 1}/${runs} failed: ${(e as Error).message}\n`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, runs) }, worker))

  const results = settled.filter((r): r is RunResult => r !== undefined)
  if (!v.json) {
    settled.forEach((r, n) => {
      if (!r) return
      const tag = runs > 1 ? `[${n + 1}/${runs}] ` : ''
      process.stdout.write(formatResult(r, `${tag}${r.model} @ ${r.provider} · seed ${r.seed}`) + '\n\n')
    })
  }
  if (!results.length) fail('no successful runs')

  if (v.json) {
    const out = results.map(({ toSubmission, upload, ...rest }) => rest)
    process.stdout.write(JSON.stringify(runs > 1 ? out : out[0], null, 2) + '\n')
  } else if (results.length > 1) {
    const counts = new Map<string, number>()
    for (const r of results) counts.set(r.type, (counts.get(r.type) ?? 0) + 1)
    const dist = [...counts].sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}×${c}`).join('  ')
    const mean = OEJTS_1_2.dimensions
      .map((d) => {
        const ps = results.map((r) => r.dimensions[d.id].percent)
        const m = ps.reduce((a, b) => a + b, 0) / ps.length
        const sd = Math.sqrt(ps.reduce((a, b) => a + (b - m) ** 2, 0) / ps.length)
        return `${d.positive} ${m.toFixed(1)}% ±${sd.toFixed(1)}`
      })
      .join('   ')
    process.stdout.write(`${results.length} runs: ${dist}\nmean: ${mean}\n`)
  }

  const share = v.upload || (!v.json && (await confirm(`Share ${results.length > 1 ? 'these results' : 'this result'} to ${endpoint()}? [y/N] `)))
  if (!share) return
  for (const r of results) {
    const res = await r.upload({ nickname: v.nickname })
    process.stderr.write(`shared${res.url ? `: ${res.url}` : ''}\n`)
  }
}

async function cmdPrompt(args: string[]) {
  const { values: v } = parseArgs({ args, options: { seed: { type: 'string' }, json: { type: 'boolean' } } })
  const seed = num(v.seed, 'seed') ?? randomSeed()
  const order = shuffle(
    OEJTS_1_2.items.map((i) => i.id),
    seed,
  )
  const prompt = buildPrompt(OEJTS_1_2, order)
  process.stdout.write(v.json ? JSON.stringify({ seed, prompt }, null, 2) + '\n' : `${prompt}\n`)
  if (!v.json) process.stderr.write(`seed: ${seed}\n`)
}

async function cmdScore(args: string[]) {
  const { values: v } = parseArgs({ args, options: { answers: { type: 'string' }, json: { type: 'boolean' } } })
  const r = score(OEJTS_1_2, await readAnswers(v.answers))
  process.stdout.write(v.json ? JSON.stringify(r, null, 2) + '\n' : formatResult(r, '') + '\n')
}

async function cmdSubmit(args: string[]) {
  const { values: v } = parseArgs({
    args,
    options: {
      channel: { type: 'string' },
      model: { type: 'string' },
      provider: { type: 'string' },
      harness: { type: 'string' },
      'harness-version': { type: 'string' },
      seed: { type: 'string' },
      answers: { type: 'string' },
      nickname: { type: 'string' },
      'no-device-key': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  })
  if (v.channel !== 'api' && v.channel !== 'harness') fail('--channel must be api or harness')
  if (!v.model || !v.provider) fail('--model and --provider are required')
  const seed = num(v.seed, 'seed')
  if (seed === undefined) fail('--seed is required')

  let submission
  try {
    submission = buildSubmission({
      channel: v.channel,
      model: v.model,
      provider: v.provider,
      harness: v.harness,
      harnessVersion: v['harness-version'],
      seed,
      answers: await readAnswers(v.answers),
      nickname: v.nickname,
      deviceKey: v['no-device-key'] || v['dry-run'] ? undefined : await getDeviceKey(),
    })
  } catch (e) {
    fail(`invalid submission: ${(e as Error).message}`)
  }
  if (v['dry-run']) {
    process.stdout.write(JSON.stringify(submission, null, 2) + '\n')
    return
  }
  const res = await upload(submission)
  process.stdout.write(`shared${res.url ? `: ${res.url}` : ''}\n`)
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  switch (cmd) {
    case 'run':
      return cmdRun(rest)
    case 'prompt':
      return cmdPrompt(rest)
    case 'score':
      return cmdScore(rest)
    case 'submit':
      return cmdSubmit(rest)
    case 'detect': {
      const { values: v } = parseArgs({ args: rest, options: { harness: { type: 'string' } } })
      if (!HARNESSES.includes(v.harness as Harness)) fail(`--harness must be one of ${HARNESSES.join(', ')}`)
      process.stdout.write(JSON.stringify(await detect(v.harness as Harness), null, 2) + '\n')
      return
    }
    case 'schema':
      process.stdout.write(JSON.stringify(submissionJsonSchema(), null, 2) + '\n')
      return
    case '--version':
    case '-v':
      process.stdout.write(`${CLIENT_VERSION}\n`)
      return
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP)
      return
    default:
      fail(`unknown command "${cmd}"; see llm-mbti --help`)
  }
}

main().catch((e) => fail((e as Error).message))
