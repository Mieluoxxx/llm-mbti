import { publicClient } from '@/lib/supabase'

const COLUMNS = [
  'id', 'created_at', 'source', 'channel', 'model_id', 'provider', 'harness', 'harness_version',
  'questionnaire_version', 'prompt_version', 'seed', 'type',
  'score_ie', 'score_sn', 'score_ft', 'score_jp', 'answers', 'nickname', 'flags', 'weight',
] as const

const LICENSE = 'CC BY-NC-SA 4.0 - llm-mbti dataset; questionnaire: OEJTS 1.2 by Eric Jorgenson'
const PAGE = 1000
const MAX_ROWS = 50_000

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get('format') === 'csv' ? 'csv' : 'json'
  const db = publicClient()

  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await db
      .from('public_runs')
      .select(COLUMNS.join(','))
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return Response.json({ error: 'database error' }, { status: 500 })
    rows.push(...(data as unknown as Record<string, unknown>[]))
    if (data.length < PAGE) break
  }

  const headers = {
    'cache-control': 'public, s-maxage=300, stale-while-revalidate=600',
    'x-license': LICENSE,
    'access-control-allow-origin': '*',
  }

  if (format === 'json') {
    return Response.json({ license: LICENSE, count: rows.length, runs: rows }, { headers })
  }
  const lines = [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))]
  return new Response(lines.join('\n') + '\n', {
    headers: {
      ...headers,
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="llm-mbti-runs.csv"',
    },
  })
}
