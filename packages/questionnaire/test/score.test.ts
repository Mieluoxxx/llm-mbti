import { describe, expect, it } from 'vitest'
import { AnswerError, OEJTS_1_2, score, shuffle, type Answers } from '../src'

// Transcribed verbatim from page 3 of OEJTS1.2.pdf, kept independent of the
// per-item signs in the JSON so the two can catch each other's typos.
function officialKey(a: (n: number) => number) {
  const IE = 30 - a(3) - a(7) - a(11) + a(15) - a(19) + a(23) + a(27) - a(31)
  const SN = 12 + a(4) + a(8) + a(12) + a(16) + a(20) - a(24) - a(28) + a(32)
  const FT = 30 - a(2) + a(6) + a(10) - a(14) - a(18) + a(22) - a(26) - a(30)
  const JP = 18 + a(1) + a(5) - a(9) + a(13) - a(17) + a(21) - a(25) + a(29)
  const type =
    (IE > 24 ? 'E' : 'I') + (SN > 24 ? 'N' : 'S') + (FT > 24 ? 'T' : 'F') + (JP > 24 ? 'P' : 'J')
  return { IE, SN, FT, JP, type }
}

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const fill = (v: number): Answers => Object.fromEntries(OEJTS_1_2.items.map((i) => [i.id, v]))

describe('score (OEJTS 1.2)', () => {
  it('has 32 items, 8 per dimension', () => {
    expect(OEJTS_1_2.items).toHaveLength(32)
    for (const d of ['IE', 'SN', 'FT', 'JP']) {
      expect(OEJTS_1_2.items.filter((i) => i.dimension === d)).toHaveLength(8)
    }
  })

  it('matches the official formulas on 2000 random answer sheets', () => {
    const rand = rng(42)
    for (let n = 0; n < 2000; n++) {
      const answers: Answers = {}
      for (const i of OEJTS_1_2.items) answers[i.id] = 1 + Math.floor(rand() * 5)
      const ours = score(OEJTS_1_2, answers)
      const ref = officialKey((k) => answers[`Q${k}`]!)
      expect(ours.type).toBe(ref.type)
      expect(ours.dimensions.IE.raw).toBe(ref.IE)
      expect(ours.dimensions.SN.raw).toBe(ref.SN)
      expect(ours.dimensions.FT.raw).toBe(ref.FT)
      expect(ours.dimensions.JP.raw).toBe(ref.JP)
    }
  })

  it('puts all-3 answers exactly at the midpoint and resolves ties to I/S/F/J', () => {
    const r = score(OEJTS_1_2, fill(3))
    expect(r.type).toBe('ISFJ')
    for (const d of Object.values(r.dimensions)) {
      expect(d.raw).toBe(24)
      expect(d.percent).toBe(50)
    }
  })

  it('maps raw 8..40 onto 0..100 percent', () => {
    const extremeE: Answers = fill(3)
    for (const i of OEJTS_1_2.items.filter((i) => i.dimension === 'IE')) {
      extremeE[i.id] = i.sign === 1 ? 5 : 1
    }
    const r = score(OEJTS_1_2, extremeE)
    expect(r.dimensions.IE).toMatchObject({ raw: 40, min: 8, max: 40, percent: 100, letter: 'E' })
    expect(r.type[0]).toBe('E')
  })

  it('is independent of the order answers were given in', () => {
    const rand = rng(7)
    const answers: Answers = {}
    for (const i of OEJTS_1_2.items) answers[i.id] = 1 + Math.floor(rand() * 5)
    const reordered = Object.fromEntries(shuffle(Object.entries(answers), 99))
    expect(score(OEJTS_1_2, reordered)).toEqual(score(OEJTS_1_2, answers))
  })

  it('rejects missing, unknown and out-of-range answers', () => {
    const { Q1: _, ...missing } = fill(3)
    expect(() => score(OEJTS_1_2, missing)).toThrow(AnswerError)
    expect(() => score(OEJTS_1_2, { ...fill(3), Q99: 3 })).toThrow(/unknown items: Q99/)
    expect(() => score(OEJTS_1_2, { ...fill(3), Q5: 6 })).toThrow(/Q5/)
    expect(() => score(OEJTS_1_2, { ...fill(3), Q5: 2.5 })).toThrow(/Q5/)
  })
})
