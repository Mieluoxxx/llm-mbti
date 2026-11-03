export type Protocol = 'openai' | 'anthropic'

export interface ProviderPreset {
  baseURL: string
  protocol: Protocol
  apiKeyEnv: string
}

export const PRESETS: Record<string, ProviderPreset> = {
  anthropic: { baseURL: 'https://api.anthropic.com/v1', protocol: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY' },
  openai: { baseURL: 'https://api.openai.com/v1', protocol: 'openai', apiKeyEnv: 'OPENAI_API_KEY' },
  deepseek: { baseURL: 'https://api.deepseek.com/v1', protocol: 'openai', apiKeyEnv: 'DEEPSEEK_API_KEY' },
  openrouter: { baseURL: 'https://openrouter.ai/api/v1', protocol: 'openai', apiKeyEnv: 'OPENROUTER_API_KEY' },
}

const HOSTS: [RegExp, string][] = [
  [/(^|\.)anthropic\.com$/, 'anthropic'],
  [/(^|\.)openai\.com$/, 'openai'],
  [/(^|\.)deepseek\.com$/, 'deepseek'],
  [/(^|\.)openrouter\.ai$/, 'openrouter'],
  [/(^|\.)moonshot\.(cn|ai)$/, 'moonshot'],
  [/(^|\.)bigmodel\.cn$/, 'zhipu'],
  [/(^|\.)z\.ai$/, 'zhipu'],
  [/(^|\.)dashscope(-intl)?\.aliyuncs\.com$/, 'alibaba'],
  [/(^|\.)googleapis\.com$/, 'google'],
  [/(^|\.)x\.ai$/, 'xai'],
  [/(^|\.)groq\.com$/, 'groq'],
  [/(^|\.)together\.(ai|xyz)$/, 'together'],
  [/(^|\.)siliconflow\.(cn|com)$/, 'siliconflow'],
  [/(^|\.)opencode\.ai$/, 'opencode'],
]

/**
 * Best-effort guess for display/grouping only; unknown hosts fall back to the
 * hostname itself so an aggregator never gets mislabelled as the model vendor.
 */
export function detectProvider(baseURL: string): string {
  const host = new URL(baseURL).hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'local'
  for (const [re, name] of HOSTS) if (re.test(host)) return name
  return host.replace(/^api\./, '')
}
