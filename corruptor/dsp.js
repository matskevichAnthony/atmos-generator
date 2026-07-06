// COLLAPSE ENGINE: offline corruption of rendered PCM.
// Works on raw Float32Arrays after render — no realtime budget, so it can do
// what live fx can't: literal data damage (bit flips, stuck buffers, sector
// loss) and STFT-domain wreckage. Fully deterministic from seed+nonce.

import { lerp, seededRng } from './rng.js'

export const CURVES = {
  flat: () => 1,
  collapse: (t) => Math.pow(t, 1.4),
  heal: (t) => Math.pow(1 - t, 1.4),
}

// ── FFT (radix-2, in-place) ────────────────────────────────
export const fft = (re, im, inv) => {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k]
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k] = ar + br; im[i + k] = ai + bi
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr; cr = ncr
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n }
}

export const FRAME = 1024
export const HOP = FRAME / 4
const COLA_GAIN = 1.5

// STFT with hann analysis+synthesis windows; fn mutates (re, im, tNorm) per frame
export const stft = (ch, fn) => {
  const n = ch.length
  const win = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME)
  const out = new Float32Array(n)
  const re = new Float32Array(FRAME), im = new Float32Array(FRAME)
  for (let pos = 0; pos + FRAME <= n; pos += HOP) {
    for (let i = 0; i < FRAME; i++) { re[i] = ch[pos + i] * win[i]; im[i] = 0 }
    fft(re, im, false)
    fn(re, im, pos / n)
    fft(re, im, true)
    for (let i = 0; i < FRAME; i++) out[pos + i] += (re[i] * win[i]) / COLA_GAIN
  }
  ch.set(out)
}

// ── post modules ───────────────────────────────────────────
// each: process(chs [L,R], sr, amt 0..1, rng, curve) mutating in place
export const POST_MODULES = [
  {
    id: 'bitrot', name: 'BITROT', desc: 'флипы битов · треск',
    process: (chs, sr, amt, rng, curve) => {
      const p = lerp(0.0001, 0.008, amt)
      const n = chs[0].length
      for (let i = 0; i < n; i++) {
        if (rng() < p * curve(i / n)) {
          const ch = chs[rng() < 0.5 ? 0 : 1] ?? chs[0]
          const bit = 4 + Math.floor(rng() * (5 + Math.round(7 * amt)))
          let v = Math.max(-32768, Math.min(32767, Math.round(ch[i] * 32767)))
          v ^= 1 << bit
          ch[i] = Math.max(-1, Math.min(1, v / 32767))
        }
      }
    },
  },
  {
    id: 'skip', name: 'SKIP', desc: 'застрявший буфер',
    process: (chs, sr, amt, rng, curve) => {
      const n = chs[0].length
      const events = Math.max(1, Math.round(lerp(1, 5, amt) * (n / sr / 2)))
      for (let e = 0; e < events; e++) {
        const pos = Math.floor(rng() * n * 0.8)
        if (rng() > curve(pos / n)) continue
        const win = Math.floor(lerp(0.02, 0.12, rng()) * sr)
        const reps = 2 + Math.floor(rng() * (2 + Math.round(6 * amt)))
        for (const ch of chs) {
          for (let r = 1; r <= reps; r++) {
            const dst = pos + r * win
            if (dst + win > n) break
            ch.copyWithin(dst, pos, pos + win)
          }
        }
      }
    },
  },
  {
    id: 'holes', name: 'HOLES', desc: 'потеря секторов',
    process: (chs, sr, amt, rng, curve) => {
      const n = chs[0].length
      const events = Math.round(lerp(2, 16, amt) * (n / sr))
      const fade = amt < 0.5 ? Math.round(0.001 * sr) : 0
      for (let e = 0; e < events; e++) {
        const pos = Math.floor(rng() * n)
        if (rng() > curve(pos / n)) continue
        const dur = Math.floor(lerp(0.004, 0.09, rng() * amt + rng() * 0.2) * sr)
        const end = Math.min(n, pos + dur)
        for (const ch of chs) {
          for (let i = pos; i < end; i++) {
            let g = 0
            if (fade && i - pos < fade) g = 1 - (i - pos) / fade
            if (fade && end - i < fade) g = 1 - (end - i) / fade
            ch[i] *= g
          }
        }
      }
    },
  },
  {
    id: 'shatter', name: 'SHATTER', desc: 'дробит и мешает',
    process: (chs, sr, amt, rng, curve) => {
      const n = chs[0].length
      const chunk = Math.floor(lerp(0.03, 0.15, rng()) * sr)
      const total = Math.floor(n / chunk)
      const marked = []
      for (let c = 0; c < total; c++) {
        if (rng() < lerp(0.15, 0.85, amt) * curve((c * chunk) / n)) marked.push(c)
      }
      if (marked.length < 2) return
      const order = [...marked]
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]
      }
      const flips = marked.map(() => rng() < 0.4)
      for (const ch of chs) {
        const src = marked.map((c) => ch.slice(c * chunk, (c + 1) * chunk))
        marked.forEach((c, k) => {
          const data = src[marked.indexOf(order[k])]
          if (flips[k]) data.reverse()
          ch.set(data, c * chunk)
        })
      }
    },
  },
  {
    id: 'freeze', name: 'FREEZE', desc: 'зависание кадра',
    process: (chs, sr, amt, rng, curve) => {
      const n = chs[0].length
      const events = Math.max(1, Math.round(lerp(1, 4, amt) * (n / sr / 2)))
      for (let e = 0; e < events; e++) {
        const pos = Math.floor(rng() * n * 0.85)
        if (rng() > curve(pos / n)) continue
        const frame = Math.floor(lerp(0.002, 0.02, rng()) * sr)
        const hold = Math.floor(lerp(0.1, 0.7, rng() * amt + 0.2) * sr)
        for (const ch of chs) {
          for (let i = 0; i < hold && pos + frame + i < n; i++) {
            ch[pos + frame + i] = ch[pos + (i % frame)]
          }
        }
      }
    },
  },
  {
    id: 'decimate', name: 'DECIMATE', desc: 'деградация частоты',
    process: (chs, sr, amt, rng, curve) => {
      const n = chs[0].length
      const maxHold = Math.round(lerp(2, 64, amt))
      let i = 0
      while (i < n) {
        const factor = 1 + Math.floor(maxHold * curve(i / n))
        if (factor > 1) {
          for (const ch of chs) {
            const v = ch[i]
            for (let k = 1; k < factor && i + k < n; k++) ch[i + k] = v
          }
        }
        i += factor
      }
    },
  },
  {
    id: 'robot', name: 'ROBOT', desc: 'стирает фазы',
    process: (chs, sr, amt, rng, curve) => {
      const whisper = rng() < 0.35
      for (const ch of chs) {
        stft(ch, (re, im, t) => {
          const mix = amt * curve(t)
          if (mix <= 0.01) return
          for (let k = 0; k < FRAME; k++) {
            const mag = Math.hypot(re[k], im[k])
            const phase = whisper ? rng() * 2 * Math.PI : 0
            re[k] = lerp(re[k], mag * Math.cos(phase), mix)
            im[k] = lerp(im[k], mag * Math.sin(phase), mix)
          }
        })
      }
    },
  },
  {
    id: 'smear', name: 'SMEAR', desc: 'спектральная заморозка',
    process: (chs, sr, amt, rng, curve) => {
      const decay = lerp(0.88, 0.995, amt)
      for (const ch of chs) {
        const heldR = new Float32Array(FRAME), heldI = new Float32Array(FRAME)
        stft(ch, (re, im, t) => {
          const mix = amt * curve(t)
          for (let k = 0; k < FRAME; k++) {
            const mag = Math.hypot(re[k], im[k])
            const heldMag = Math.hypot(heldR[k], heldI[k]) * decay
            if (mag > heldMag) { heldR[k] = re[k]; heldI[k] = im[k] }
            else { heldR[k] *= decay; heldI[k] *= decay }
            re[k] = lerp(re[k], heldR[k], mix)
            im[k] = lerp(im[k], heldI[k], mix)
          }
        })
      }
    },
  },
]

export const runPost = (L, R, sr, seedHex, postState, curveName) => {
  const curve = CURVES[curveName] ?? CURVES.flat
  const chs = [L, R]
  for (const m of POST_MODULES) {
    const st = postState[m.id]
    if (!st?.on) continue
    const rng = seededRng(`${seedHex}:post:${m.id}:${st.nonce}`)
    m.process(chs, sr, st.amt / 100, rng, curve)
  }
  for (const ch of chs) {
    for (let i = 0; i < ch.length; i++) {
      if (ch[i] > 1) ch[i] = 1
      else if (ch[i] < -1) ch[i] = -1
    }
  }
}
