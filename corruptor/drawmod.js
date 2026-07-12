// DRAW UNIT: hand-drawn step automation (LFO-tool style, but offline).
// A 64-step curve, drawn with the pointer or picked from shape presets,
// cycles RATE times over the sample length and drives one target:
// VOL (gain), FILTER (lowpass cutoff), PITCH (read-rate warp), CRUSH (bit depth).
// Pure function of (steps, rate, amt) → fully reproducible in preset configs.

export const DRAW_N = 64

export const DRAW_TARGETS = [
  { id: 'volume', name: 'VOL', desc: 'громкость' },
  { id: 'filter', name: 'FILTER', desc: 'срез фильтра' },
  { id: 'pitch', name: 'PITCH', desc: 'высота' },
  { id: 'crush', name: 'CRUSH', desc: 'битность' },
]

export const DRAW_RATES = [1, 2, 4, 8, 16]

// one full cycle of each shape, x ∈ [0,1)
const gen = (fn) => Float64Array.from({ length: DRAW_N }, (_, i) => {
  const v = fn(i / DRAW_N)
  return Math.min(1, Math.max(0, v))
})

export const DRAW_SHAPES = [
  { id: 'pump', name: 'PUMP', desc: 'сайдчейн-провал', make: () => gen((x) => Math.pow(x, 0.55)) },
  { id: 'trem', name: 'TREM', desc: 'тремоло-волна', make: () => gen((x) => 0.5 - 0.5 * Math.cos(2 * Math.PI * x)) },
  { id: 'saw', name: 'SAW', desc: 'пила вниз', make: () => gen((x) => 1 - x) },
  { id: 'stairs', name: 'STAIRS', desc: 'ступени', make: () => gen((x) => Math.floor(x * 4) / 3) },
  { id: 'ramp', name: 'RAMP', desc: 'подъём', make: () => gen((x) => x) },
  { id: 'rand', name: 'RAND', desc: 'случайные блоки', make: () => {
    const blocks = Float64Array.from({ length: 8 }, () => Math.random())
    return gen((x) => blocks[Math.floor(x * 8)])
  } },
]

export const makeShape = (id) =>
  (DRAW_SHAPES.find((s) => s.id === id) ?? DRAW_SHAPES[0]).make()

export const defaultDraw = () => ({
  on: false, target: 'volume', rate: 4, amt: 80, steps: Array.from(makeShape('pump')),
})

// sanitize an incoming draw config (untrusted preset file)
export const sanitizeDraw = (d) => {
  if (!d || typeof d !== 'object') return null
  const target = DRAW_TARGETS.some((t) => t.id === d.target) ? d.target : 'volume'
  const rate = DRAW_RATES.includes(+d.rate) ? +d.rate : 4
  const amt = Math.min(100, Math.max(0, Math.round(+d.amt) || 0))
  let steps
  if (Array.isArray(d.steps) && d.steps.length) {
    steps = Array.from({ length: DRAW_N }, (_, i) => {
      const v = +d.steps[Math.min(i, d.steps.length - 1)]
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5
    })
  } else {
    steps = Array.from(makeShape(d.shape))
  }
  return { on: true, target, rate, amt, steps }
}

// linear interpolation between steps — no zipper noise on VOL/FILTER
const curveAt = (steps, x) => {
  const f = (x % 1) * DRAW_N
  const i = Math.floor(f)
  const a = steps[i % DRAW_N]
  const b = steps[(i + 1) % DRAW_N]
  return a + (b - a) * (f - i)
}

// mutates L/R in place; runs after RACK B, before the edge fades.
// One-shots skip it entirely: a curve over a single hit is meaningless.
export const applyDraw = (L, R, sr, state) => {
  const d = state.draw
  if (!d?.on || state.shape === 'shot') return
  const depth = d.amt / 100
  if (depth <= 0) return
  const { steps, rate, target } = d
  const n = L.length
  const val = (i) => curveAt(steps, (i / n) * rate)

  if (target === 'volume') {
    for (let i = 0; i < n; i++) {
      const g = 1 - depth * (1 - val(i))
      L[i] *= g
      R[i] *= g
    }
  } else if (target === 'filter') {
    // one-pole lowpass, cutoff swept 80 Hz → 12 kHz by the curve
    for (const ch of [L, R]) {
      let y = 0
      for (let i = 0; i < n; i++) {
        const fc = 80 * Math.pow(150, val(i))
        const a = 1 - Math.exp((-2 * Math.PI * fc) / sr)
        y += a * (ch[i] - y)
        ch[i] += depth * (y - ch[i])
      }
    }
  } else if (target === 'pitch') {
    // variable read-rate warp, ±1 octave at full depth, wraps around the buffer
    for (const ch of [L, R]) {
      const src = Float32Array.from(ch)
      let pos = 0
      for (let i = 0; i < n; i++) {
        const r = Math.pow(2, (val(i) - 0.5) * 2 * depth)
        const i0 = Math.floor(pos)
        const fr = pos - i0
        ch[i] = src[i0 % n] * (1 - fr) + src[(i0 + 1) % n] * fr
        pos += r
      }
    }
  } else if (target === 'crush') {
    // bit depth swept 16 → 3 bits where the curve dips
    for (let i = 0; i < n; i++) {
      const bits = 16 - depth * (1 - val(i)) * 13
      const q = Math.pow(2, bits - 1)
      L[i] = Math.round(L[i] * q) / q
      R[i] = Math.round(R[i] * q) / q
    }
  }
}
