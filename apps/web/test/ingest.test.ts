import { describe, expect, it } from 'vitest'
import { OEJTS_1_2, PROMPT_VERSION, PROTOCOL_VERSION, score, shuffle } from '@llm-mbti/questionnaire'
import { baselineDistance, ingest, qualityFlags, submissionHash } from '../src/lib/ingest'

const ids = OEJTS_1_2.items.map((i) => i.id)
const answers = Object.fromEntries(ids.map((id, n) => [id, (n % 5) + 1]))
const ctx = { ip: '203.0.113.7', official: false, salt: 'test-salt' }

const body = (o: Record<string, unknown> = {}) => ({
  protocol_version: PROTOCOL_VERSION,
  questionnaire_version: 'oejts-1.2',
  prompt_version: PROMPT_VERSION,
  channel: 'harness',
  model_id: 'magpie/mayoru-responses/deepseek-flash',
  provider: 'mayoru',
  harness: 'opencode',
  harness_version: '2.2.5',
  seed: 42,
  item_order: shuffle(ids, 42),
  answers,
  client: { name: 'llm-mbti', version: '0.1.0' },
  device_key: 'd'.repeat(43),
  ...o,
})

describe('ingest', () => {
  it('scores on the server and ignores anything the client claims about the result', () => {
    const r = ingest({ ...body(), type: 'ENFP' }, ctx)
    // strictObject rejects unknown fields such as a client-supplied type.
    expect(r.ok).toBe(false)

    const ok = ingest(body(), ctx)
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    const expected = score(OEJTS_1_2, answers)
    expect(ok.row.type).toBe(expected.type)
    expect(ok.row.score_ie).toBe(expected.dimensions.IE.percent)
    expect(ok.row.model_id).toBe('deepseek-flash')
    expect(ok.row.source).toBe('community')
  })

  it('never stores raw IP or device key', () => {
    const r = ingest(body(), ctx)
    if (!r.ok) throw new Error('expected ok')
    const json = JSON.stringify(r.row)
    expect(json).not.toContain('203.0.113.7')
    expect(json).not.toContain('d'.repeat(43))
    expect(r.row.ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(r.row.device_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('salts hashes so the same IP hashes differently under another salt', () => {
    const a = ingest(body(), ctx)
    const b = ingest(body(), { ...ctx, salt: 'other' })
    if (!a.ok || !b.ok) throw new Error('expected ok')
    expect(a.row.ip_hash).not.toBe(b.row.ip_hash)
  })

  it('marks official submissions', () => {
    const r = ingest(body(), { ...ctx, official: true })
    expect(r.ok && r.row.source).toBe('official')
  })

  it('rejects malformed submissions with issues', () => {
    const r = ingest(body({ answers: { Q1: 3 } }), ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })
})

describe('submissionHash', () => {
  it('treats routed and bare model ids, and answer key order, as the same run', () => {
    const a = ingest(body(), ctx)
    const reordered = Object.fromEntries(Object.entries(answers).reverse())
    const b = ingest(body({ model_id: 'deepseek-flash', answers: reordered, nickname: 'x' }), ctx)
    if (!a.ok || !b.ok) throw new Error('expected ok')
    expect(a.row.submission_hash).toBe(b.row.submission_hash)
  })

  it('differs when the seed or an answer changes', () => {
    const a = ingest(body(), ctx)
    const b = ingest(body({ seed: 43, item_order: shuffle(ids, 43) }), ctx)
    const c = ingest(body({ answers: { ...answers, Q1: answers.Q1 === 5 ? 4 : 5 } }), ctx)
    if (!a.ok || !b.ok || !c.ok) throw new Error('expected ok')
    expect(new Set([a.row.submission_hash, b.row.submission_hash, c.row.submission_hash]).size).toBe(3)
  })

  it('is exported for reuse', () => {
    expect(typeof submissionHash).toBe('function')
  })
})

describe('quality', () => {
  it('zeroes the weight of a sheet with the same answer everywhere', () => {
    expect(qualityFlags(Object.fromEntries(ids.map((id) => [id, 3])))).toEqual({ flags: ['uniform_answers'], weight: 0 })
    expect(qualityFlags(answers)).toEqual({ flags: [], weight: 1 })
  })

  it('measures distance from the official baseline in percentage points', () => {
    expect(baselineDistance({ score_ie: 10, score_sn: 70, score_ft: 80, score_jp: 20 }, { ie: 10, sn: 70, ft: 80, jp: 20 })).toBe(0)
    expect(baselineDistance({ score_ie: 90, score_sn: 30, score_ft: 20, score_jp: 80 }, { ie: 10, sn: 70, ft: 80, jp: 20 })).toBe(60)
  })
})
