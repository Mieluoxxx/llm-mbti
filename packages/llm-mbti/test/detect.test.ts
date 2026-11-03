import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detect, splitRoute } from '../src'

const SECRET = 'sk-THIS-MUST-NOT-LEAK'

async function fixture(files: Record<string, string>) {
  const home = await mkdtemp(join(tmpdir(), 'llm-mbti-home-'))
  const cwd = await mkdtemp(join(tmpdir(), 'llm-mbti-cwd-'))
  for (const [rel, text] of Object.entries(files)) {
    const path = join(home, rel)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, text)
  }
  return { home, cwd, env: {}, skipVersion: true }
}

describe('splitRoute', () => {
  it.each([
    [['magpie', 'mayoru-responses', 'deepseek-flash'], { model: 'deepseek-flash', provider: 'mayoru', via: 'magpie' }],
    [['anthropic', 'claude-opus-5-5#high'], { model: 'claude-opus-5-5', provider: 'anthropic' }],
    [['deepseek-flash'], { model: 'deepseek-flash' }],
  ])('%j', (segments, expected) => {
    expect(splitRoute(segments)).toEqual(expected)
  })
})

describe('detect', () => {
  it('reads Codex behind a gateway without exposing anything else', async () => {
    const o = await fixture({
      '.codex/config.toml': [
        'model_provider = "magpie"',
        'model = "mayoru-responses/deepseek-flash"',
        `experimental_bearer_token = "${SECRET}"`,
        '[model_providers.magpie]',
        'base_url = "http://127.0.0.1:8317/v1"',
        `env_http_headers = { "x" = "${SECRET}" }`,
      ].join('\n'),
    })
    const d = await detect('codex', o)
    expect(d).toMatchObject({ harness: 'codex', model: 'deepseek-flash', provider: 'mayoru', via: 'magpie' })
    expect(JSON.stringify(d)).not.toContain(SECRET)
  })

  it('uses base_url to name the provider for a plain Codex model id', async () => {
    const o = await fixture({
      '.codex/config.toml': 'model = "deepseek-chat"\nmodel_provider = "ds"\n[model_providers.ds]\nbase_url = "https://api.deepseek.com/v1"\n',
    })
    expect(await detect('codex', o)).toMatchObject({ model: 'deepseek-chat', provider: 'deepseek' })
  })

  it('reads OpenCode JSONC with comments and trailing commas', async () => {
    const o = await fixture({
      '.config/opencode/opencode.jsonc': `{
        // routed through magpie
        "model": "magpie/mayoru-responses/deepseek-flash",
        "provider": { "magpie": { "options": { "apiKey": "${SECRET}", "baseURL": "http://x//y" } } },
      }`,
    })
    const d = await detect('opencode', o)
    expect(d).toMatchObject({ model: 'deepseek-flash', provider: 'mayoru', via: 'magpie' })
    expect(JSON.stringify(d)).not.toContain(SECRET)
  })

  it('reads Claude Code settings and its base URL', async () => {
    const o = await fixture({
      '.claude/settings.json': JSON.stringify({
        model: 'claude-opus-5-5',
        env: { ANTHROPIC_BASE_URL: 'https://openrouter.ai/api', ANTHROPIC_AUTH_TOKEN: SECRET },
      }),
    })
    const d = await detect('claude-code', o)
    expect(d).toMatchObject({ model: 'claude-opus-5-5', provider: 'openrouter' })
    expect(JSON.stringify(d)).not.toContain(SECRET)
  })

  it('returns only the harness name when nothing is configured', async () => {
    const o = await fixture({})
    expect(await detect('opencode', o)).toEqual({ harness: 'opencode' })
  })
})
