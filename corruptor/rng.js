// Seeded randomness + math primitives. Everything audible in DC-77
// derives from these streams, so same seed → same sound, always.

export const r2 = (x) => Math.round(x * 100) / 100
export const lerp = (a, b, t) => a + (b - a) * t

export const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const hashStr = (s) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export const seededRng = (key) => mulberry32(hashStr(key))

export const randomSeedHex = () =>
  crypto.getRandomValues(new Uint32Array(1))[0].toString(16).toUpperCase().padStart(8, '0')

export const toolkit = (rng) => ({
  rf: (a, b) => a + rng() * (b - a),
  ri: (a, b) => Math.floor(a + rng() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(rng() * arr.length)],
  chance: (p) => rng() < p,
  shuffle: (arr) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  },
})
