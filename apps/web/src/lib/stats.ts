import { publicClient } from './supabase'

export type Dim = 'IE' | 'SN' | 'FT' | 'JP'
export const DIMS: { id: Dim; neg: string; pos: string }[] = [
  { id: 'IE', neg: 'I', pos: 'E' },
  { id: 'SN', neg: 'S', pos: 'N' },
  { id: 'FT', neg: 'F', pos: 'T' },
  { id: 'JP', neg: 'J', pos: 'P' },
]

export interface Group {
  key: string
  channel: 'api' | 'harness'
  model: string
  provider: string
  harness: string
  runs: number
  officialRuns: number
  mean: Record<Dim, number>
  sd: Record<Dim, number>
  types: { type: string; runs: number }[]
  lastRunAt: string
}

export interface ModelSummary {
  model: string
  runs: number
  groups: Group[]
}

export interface Totals {
  runs: number
  models: number
  providers: number
  harnesses: number
}

const groupKey = (r: { channel: string; model_id: string; provider: string; harness: string }) =>
  [r.channel, r.model_id, r.provider, r.harness].join('|')

export async function getGroups(): Promise<Group[]> {
  const db = publicClient()
  const [stats, types] = await Promise.all([
    db.from('public_group_stats').select('*'),
    db.from('public_type_counts').select('*'),
  ])
  if (stats.error) throw stats.error
  if (types.error) throw types.error

  const typeMap = new Map<string, { type: string; runs: number }[]>()
  for (const t of types.data) {
    const k = groupKey(t)
    typeMap.set(k, [...(typeMap.get(k) ?? []), { type: t.type, runs: t.runs }])
  }

  return stats.data.map((s) => {
    const key = groupKey(s)
    return {
      key,
      channel: s.channel,
      model: s.model_id,
      provider: s.provider,
      harness: s.harness,
      runs: s.runs,
      officialRuns: s.official_runs,
      mean: { IE: s.ie_mean, SN: s.sn_mean, FT: s.ft_mean, JP: s.jp_mean },
      sd: { IE: s.ie_sd, SN: s.sn_sd, FT: s.ft_sd, JP: s.jp_sd },
      types: (typeMap.get(key) ?? []).sort((a, b) => b.runs - a.runs || a.type.localeCompare(b.type)),
      lastRunAt: s.last_run_at,
    }
  })
}

/** API groups first (they are the baseline), then harnesses alphabetically. */
export function sortGroups(groups: Group[]): Group[] {
  return [...groups].sort(
    (a, b) =>
      (a.channel === 'api' ? 0 : 1) - (b.channel === 'api' ? 0 : 1) ||
      a.harness.localeCompare(b.harness) ||
      a.provider.localeCompare(b.provider),
  )
}

export function summarize(groups: Group[]): { models: ModelSummary[]; totals: Totals } {
  const byModel = new Map<string, Group[]>()
  for (const g of groups) byModel.set(g.model, [...(byModel.get(g.model) ?? []), g])
  const models = [...byModel]
    .map(([model, gs]) => ({ model, runs: gs.reduce((s, g) => s + g.runs, 0), groups: sortGroups(gs) }))
    .sort((a, b) => b.runs - a.runs || a.model.localeCompare(b.model))
  return {
    models,
    totals: {
      runs: groups.reduce((s, g) => s + g.runs, 0),
      models: models.length,
      providers: new Set(groups.map((g) => g.provider)).size,
      harnesses: new Set(groups.filter((g) => g.harness).map((g) => g.harness)).size,
    },
  }
}

/** The API group for the same model and provider, used as the reference line on harness cards. */
export function baselineFor(g: Group, all: Group[]): Group | undefined {
  if (g.channel === 'api') return undefined
  return all.find((b) => b.channel === 'api' && b.model === g.model && b.provider === g.provider)
}

export function topType(g: Group): string {
  return g.types[0]?.type ?? '????'
}

export interface RecentRun {
  id: string
  created_at: string
  source: string
  channel: string
  model_id: string
  provider: string
  harness: string | null
  type: string
  nickname: string | null
  flags: string[]
}

export async function getRecentRuns(limit = 50): Promise<RecentRun[]> {
  const { data, error } = await publicClient()
    .from('public_runs')
    .select('id, created_at, source, channel, model_id, provider, harness, type, nickname, flags')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as RecentRun[]
}
