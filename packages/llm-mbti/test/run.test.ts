import { describe, expect, it } from 'vitest'
import { OEJTS_1_2, submissionSchema } from '@llm-mbti/questionnaire'
import { detectProvider, runTest } from '../src'

const sheet = Object.fromEntries(OEJTS_1_2.items.map((i, n) => [i.id, (n % 5) + 1]))

function fakeFetch(replies: string[], protocol: 'openai' | 'anthropic' = 'openai') {
  const calls: { url: string; init: RequestInit }[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const text = replies[Math.min(calls.length - 1, replies.length - 1)]!
    const body =
      protocol === 'anthropic'
        ? { content: [{ type: 'text', text }] }
        : { choices: [{ message: { role: 'assistant', content: text } }] }
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('runTest', () => {
  it('sends a bare user message to an OpenAI-compatible endpoint and scores the reply', async () => {
    const { f, calls } = fakeFetch([JSON.stringify(sheet)])
    const r = await runTest({
      model: 'deepseek-flash',
      baseURL: 'https://api.mayoru.com/v1/',
      apiKey: 'sk-test',
      seed: 7,
      fetch: f,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://api.mayoru.com/v1/chat/completions')
    const body = JSON.parse(calls[0]!.init.body as string)
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].role).toBe('user')
    expect(body).not.toHaveProperty('temperature')
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')

    expect(r.provider).toBe('mayoru.com')
    expect(r.type).toMatch(/^[EI][SN][FT][JP]$/)
    expect(r.attempts).toBe(1)
  })

  it('uses the Anthropic Messages API for the anthropic preset', async () => {
    const { f, calls } = fakeFetch([JSON.stringify(sheet)], 'anthropic')
    await runTest({ model: 'claude-opus-5-5', provider: 'anthropic', apiKey: 'k', fetch: f })
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages')
    const body = JSON.parse(calls[0]!.init.body as string)
    expect(body.max_tokens).toBeGreaterThan(0)
    expect(body).not.toHaveProperty('system')
  })

  it('retries once when the reply is not a complete answer sheet', async () => {
    const { f, calls } = fakeFetch(['As an AI I have no personality.', JSON.stringify(sheet)])
    const r = await runTest({ model: 'm', baseURL: 'https://x.test/v1', apiKey: 'k', fetch: f })
    expect(calls).toHaveLength(2)
    expect(r.attempts).toBe(2)
  })

  it('gives up after the configured attempts', async () => {
    const { f } = fakeFetch(['{"Q1": 3}'])
    await expect(runTest({ model: 'm', baseURL: 'https://x.test/v1', apiKey: 'k', fetch: f, attempts: 3 })).rejects.toThrow(
      /missing answers/,
    )
  })

  it('builds a submission the server schema accepts', async () => {
    const { f } = fakeFetch([JSON.stringify(sheet)])
    const r = await runTest({ model: 'deepseek-flash', provider: 'mayoru', baseURL: 'https://api.mayoru.com/v1', apiKey: 'k', fetch: f })
    const s = await r.toSubmission({ nickname: 'tester', deviceKey: false })
    expect(submissionSchema.safeParse(s).success).toBe(true)
    expect(s).toMatchObject({ channel: 'api', provider: 'mayoru', model_id: 'deepseek-flash', seed: r.seed })
    expect(s).not.toHaveProperty('device_key')
  })

  it('refuses to run without a key', async () => {
    const prev = process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    await expect(runTest({ model: 'm', provider: 'deepseek' })).rejects.toThrow(/DEEPSEEK_API_KEY/)
    if (prev !== undefined) process.env.DEEPSEEK_API_KEY = prev
  })
})

describe('detectProvider', () => {
  it.each([
    ['https://api.deepseek.com/v1', 'deepseek'],
    ['https://api.anthropic.com/v1', 'anthropic'],
    ['https://openrouter.ai/api/v1', 'openrouter'],
    ['https://open.bigmodel.cn/api/paas/v4', 'zhipu'],
    ['http://localhost:11434/v1', 'local'],
    ['https://api.mayoru.com/v1', 'mayoru.com'],
  ])('%s -> %s', (url, name) => {
    expect(detectProvider(url)).toBe(name)
  })
})
