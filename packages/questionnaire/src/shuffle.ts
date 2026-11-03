function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const MAX_SEED = 0xffffffff

export function randomSeed(): number {
  return Math.floor(Math.random() * (MAX_SEED + 1))
}

/**
 * Deterministic so the server can recompute the order from the seed; any
 * client that ships a different PRNG would produce orders the server rejects.
 */
export function shuffle<T>(values: readonly T[], seed: number): T[] {
  const out = [...values]
  const rand = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
