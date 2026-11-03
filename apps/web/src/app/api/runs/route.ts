import { timingSafeEqual } from 'node:crypto'
import { ipAddress } from '@vercel/functions'
import { OUTLIER_DISTANCE, baselineDistance, ingest } from '@/lib/ingest'
import { serverClient } from '@/lib/supabase'

const RATE_LIMIT_PER_HOUR = 30
const MAX_BODY_BYTES = 16_000

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors })
}

function isOfficial(req: Request): boolean {
  const token = process.env.OFFICIAL_SUBMIT_TOKEN
  const header = req.headers.get('authorization')
  if (!token || !header?.startsWith('Bearer ')) return false
  const a = Buffer.from(header.slice(7))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const salt = process.env.HASH_SALT
  if (!salt) return json({ error: 'server misconfigured' }, 500)

  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return json({ error: 'payload too large' }, 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: 'body must be JSON' }, 400)
  }

  const ip = ipAddress(req) ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const official = isOfficial(req)
  const result = ingest(body, { ip, official, salt })
  if (!result.ok) return json({ error: result.error, issues: result.issues }, result.status)
  const row = result.row

  const db = serverClient()

  if (!official) {
    const since = new Date(Date.now() - 3600_000).toISOString()
    for (const [column, value] of [
      ['ip_hash', row.ip_hash],
      ['device_hash', row.device_hash],
    ] as const) {
      if (!value) continue
      const { count, error } = await db
        .from('runs')
        .select('id', { count: 'exact', head: true })
        .eq(column, value)
        .gte('created_at', since)
      if (error) return json({ error: 'database error' }, 500)
      if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
        return json({ error: `rate limit: at most ${RATE_LIMIT_PER_HOUR} submissions per hour` }, 429)
      }
    }

    // A community API run far from the official runs of the same model and provider
    // is more likely mislabelled or fabricated; keep it, but count it for less.
    if (row.channel === 'api' && row.weight > 0) {
      const { data } = await db
        .from('runs')
        .select('score_ie, score_sn, score_ft, score_jp')
        .eq('source', 'official')
        .eq('channel', 'api')
        .eq('model_id', row.model_id.toLowerCase())
        .eq('provider', row.provider.trim().toLowerCase())
        .eq('hidden', false)
        .limit(200)
      if (data && data.length >= 3) {
        const mean = (k: keyof (typeof data)[number]) => data.reduce((s, r) => s + Number(r[k]), 0) / data.length
        const base = { ie: mean('score_ie'), sn: mean('score_sn'), ft: mean('score_ft'), jp: mean('score_jp') }
        if (baselineDistance(row, base) > OUTLIER_DISTANCE) {
          row.flags.push('far_from_official')
          row.weight = 0.5
        }
      }
    }
  }

  const { data, error } = await db.from('runs').insert(row).select('id, model_id, type').single()
  if (error) {
    if (error.code === '23505') return json({ error: 'duplicate submission' }, 409)
    return json({ error: 'database error' }, 500)
  }

  const origin = process.env.SITE_URL || new URL(req.url).origin
  return json(
    {
      id: data.id,
      type: data.type,
      url: `${origin}/model/${encodeURIComponent(data.model_id)}`,
      flags: row.flags,
    },
    201,
  )
}
