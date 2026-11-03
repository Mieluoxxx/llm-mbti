import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeModelId } from '@llm-mbti/questionnaire'
import { detectProvider } from './providers'

/**
 * Agents used to `cat` harness config files to find their model, which pulled
 * API keys into the conversation. This reads the files locally and returns only
 * the fields below, so nothing else ever reaches the model.
 */
export interface Detected {
  harness: string
  harness_version?: string
  model?: string
  provider?: string
  /** Local router in front of the upstream (e.g. magpie); shown to the user, never uploaded. */
  via?: string
  source?: string
}

export const HARNESSES = ['codex', 'opencode', 'claude-code'] as const
export type Harness = (typeof HARNESSES)[number]

// Gateways name routes after the upstream plus the API flavour ("mayoru-responses").
const routeToProvider = (route: string) => route.replace(/-(responses|completions|chat|messages)$/, '')

/** Splits a route like ["magpie", "mayoru-responses", "deepseek-flash"] into its parts. */
export function splitRoute(segments: string[]): Pick<Detected, 'model' | 'provider' | 'via'> {
  const parts = segments.map((s) => s.trim()).filter(Boolean)
  const last = parts.pop()
  if (!last) return {}
  const model = normalizeModelId(last)
  if (!parts.length) return { model }
  const provider = routeToProvider(parts[parts.length - 1]!)
  const via = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined
  return { model, provider, ...(via ? { via } : {}) }
}

function stripJsonComments(text: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (inString) {
      out += c
      if (c === '\\') out += text[++i] ?? ''
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
      out += c
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2)
      if (i === -1) break
      i++
    } else out += c
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

/** Reads only top-level `key = "value"` pairs plus `[table]` names; enough for the fields we need. */
export function readTomlStrings(text: string): Map<string, string> {
  const out = new Map<string, string>()
  let table = ''
  for (const line of text.split('\n')) {
    const t = line.trim()
    const header = t.match(/^\[([^\]]+)\]/)
    if (header) {
      table = header[1]!.trim()
      continue
    }
    const kv = t.match(/^([A-Za-z0-9_.-]+)\s*=\s*"((?:[^"\\]|\\.)*)"/)
    if (kv) out.set(table ? `${table}.${kv[1]}` : kv[1]!, kv[2]!)
  }
  return out
}

async function readFirst(paths: string[]): Promise<{ path: string; text: string } | undefined> {
  for (const path of paths) {
    try {
      return { path, text: await readFile(path, 'utf8') }
    } catch {}
  }
  return undefined
}

function version(bin: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 5000 }, (err, stdout) => {
      const m = !err && stdout.match(/\d+\.\d+\.\d+[\w.+-]*/)
      resolve(m ? m[0] : undefined)
    })
  })
}

export interface DetectOptions {
  home?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** Skip running `<harness> --version` (tests). */
  skipVersion?: boolean
}

export async function detect(harness: Harness, o: DetectOptions = {}): Promise<Detected> {
  const home = o.home ?? homedir()
  const cwd = o.cwd ?? process.cwd()
  const env = o.env ?? process.env
  const result: Detected = { harness }

  if (harness === 'codex') {
    const dir = env.CODEX_HOME || join(home, '.codex')
    const file = await readFirst([join(dir, 'config.toml')])
    if (file) {
      const toml = readTomlStrings(file.text)
      const model = toml.get('model')
      const providerKey = toml.get('model_provider')
      if (model) {
        Object.assign(result, splitRoute([...(providerKey ? [providerKey] : []), ...model.split('/')]), {
          source: file.path,
        })
        // A plain provider key (e.g. "openai") with a known base_url is more precise than the key name.
        const baseURL = providerKey && toml.get(`model_providers.${providerKey}.base_url`)
        if (baseURL && !model.includes('/')) {
          try {
            const host = detectProvider(baseURL)
            if (host !== 'local') result.provider = host
          } catch {}
        }
      }
    }
  } else if (harness === 'opencode') {
    const xdg = env.XDG_CONFIG_HOME || join(home, '.config')
    const file = await readFirst([
      join(cwd, 'opencode.jsonc'),
      join(cwd, 'opencode.json'),
      join(xdg, 'opencode', 'opencode.jsonc'),
      join(xdg, 'opencode', 'opencode.json'),
    ])
    if (file) {
      try {
        const model = JSON.parse(stripJsonComments(file.text)).model
        if (typeof model === 'string') Object.assign(result, splitRoute(model.split('/')), { source: file.path })
      } catch {}
    }
  } else {
    const file = await readFirst([
      join(cwd, '.claude', 'settings.local.json'),
      join(cwd, '.claude', 'settings.json'),
      join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'settings.json'),
    ])
    let baseURL = env.ANTHROPIC_BASE_URL
    let model = env.ANTHROPIC_MODEL
    if (file) {
      try {
        const s = JSON.parse(file.text)
        model ??= typeof s.model === 'string' ? s.model : undefined
        baseURL ??= typeof s.env?.ANTHROPIC_BASE_URL === 'string' ? s.env.ANTHROPIC_BASE_URL : undefined
        result.source = file.path
      } catch {}
    }
    if (model) result.model = normalizeModelId(model)
    let provider = 'anthropic'
    if (baseURL) {
      try {
        provider = detectProvider(baseURL)
      } catch {}
    }
    // A localhost base URL means a router whose upstream we can't see from here.
    if (provider === 'local') result.via = 'local gateway'
    else result.provider = provider
  }

  if (!o.skipVersion) {
    const v = await version(harness === 'claude-code' ? 'claude' : harness)
    if (v) result.harness_version = v
  }
  return result
}
