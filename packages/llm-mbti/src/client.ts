import type { Protocol } from './providers'

export interface CompleteOptions {
  protocol: Protocol
  baseURL: string
  apiKey: string
  model: string
  prompt: string
  maxTokens?: number
  signal?: AbortSignal
  fetch?: typeof fetch
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const join = (base: string, path: string) => base.replace(/\/+$/, '') + path

// No system prompt and no sampling parameters on purpose: the "api" channel is
// meant to measure the model as the provider serves it by default.
export async function complete(o: CompleteOptions): Promise<string> {
  const f = o.fetch ?? fetch
  const req =
    o.protocol === 'anthropic'
      ? {
          url: join(o.baseURL, '/messages'),
          headers: { 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01' },
          body: {
            model: o.model,
            // Anthropic requires max_tokens; 32 short answers need far less, the rest is headroom.
            max_tokens: o.maxTokens ?? 4096,
            messages: [{ role: 'user', content: o.prompt }],
          },
        }
      : {
          url: join(o.baseURL, '/chat/completions'),
          headers: { authorization: `Bearer ${o.apiKey}` },
          body: {
            model: o.model,
            messages: [{ role: 'user', content: o.prompt }],
            ...(o.maxTokens ? { max_tokens: o.maxTokens } : {}),
          },
        }

  const res = await f(req.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...req.headers },
    body: JSON.stringify(req.body),
    signal: o.signal,
  })
  const text = await res.text()
  if (!res.ok) throw new ApiError(`${res.status} ${res.statusText}: ${text.slice(0, 500)}`, res.status)

  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new ApiError(`response is not JSON: ${text.slice(0, 200)}`)
  }

  const content =
    o.protocol === 'anthropic'
      ? (data.content ?? [])
          .filter((b: any) => b?.type === 'text')
          .map((b: any) => b.text)
          .join('')
      : data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content) {
    throw new ApiError(`no text content in response: ${text.slice(0, 300)}`)
  }
  return content
}
