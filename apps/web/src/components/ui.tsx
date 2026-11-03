import { getTranslations } from 'next-intl/server'
import type { Group } from '@/lib/stats'

const HARNESS_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  'gemini-cli': 'Gemini CLI',
  pi: 'Pi',
  omp: 'omp',
  zcode: 'ZCode',
  kimi: 'Kimi Code',
}

export const harnessName = (h: string) => HARNESS_NAMES[h] ?? h

export async function SettingLabel({ group }: { group: Group }) {
  const t = await getTranslations('group')
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-medium text-ink">{group.channel === 'api' ? t('api') : harnessName(group.harness)}</span>
      <span className="text-muted">·</span>
      <span className="text-ink-2">{group.provider}</span>
    </span>
  )
}

export function TypeChips({ group, max = 4 }: { group: Group; max?: number }) {
  const shown = group.types.slice(0, max)
  const rest = group.types.slice(max).reduce((s, t) => s + t.runs, 0)
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {shown.map((t, i) => (
        <span
          key={t.type}
          className={`tabular rounded border border-line px-1.5 py-0.5 font-mono text-xs ${i === 0 ? 'bg-surface font-semibold text-ink' : 'text-ink-2'}`}
        >
          {t.type}
          <span className="ml-1 text-muted">×{t.runs}</span>
        </span>
      ))}
      {rest > 0 && <span className="px-1 py-0.5 text-xs text-muted">+{rest}</span>}
    </span>
  )
}

export function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-line bg-code px-4 py-3 font-mono text-[13px] leading-relaxed text-ink">
      <code>{children}</code>
    </pre>
  )
}
