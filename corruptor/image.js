// IMAGE UNIT: an image is just data — three ways to make it sound.
// SPECTRUM: image as a spectrogram (Y = frequency, X = time, brightness = level)
// CARVE:    image luminance burned into the spectrum of the rendered audio
// BEND:     raw file bytes read as PCM (classic databending)

import { fft, stft, FRAME, HOP } from './dsp.js'
import { seededRng } from './rng.js'

const COLS = 256
const ROWS = 256
const F_LO = 55
const GAMMA = 2.2
const BEND_LPF = 0.35

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)

// ── load: file → luminance grid + raw bytes ────────────────
export const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = COLS
    canvas.height = ROWS
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, COLS, ROWS)
    const px = ctx.getImageData(0, 0, COLS, ROWS).data
    const lum = new Float32Array(COLS * ROWS)
    for (let i = 0; i < COLS * ROWS; i++) {
      lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    URL.revokeObjectURL(url)
    resolve({ lum, bytes, name: file.name, thumb: img })
  }
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')) }
  img.src = url
})

// ── procedural image: motifs chosen to SOUND good as a spectrogram ─
// horizontal bands = tones (log freq map → even spacing ≈ harmonics),
// diagonals = sweeps, vertical ticks = percussion, noise clouds = washes
const MOTIFS = [
  function bands(x, rng) {
    const count = 3 + Math.floor(rng() * 9)
    const y0 = rng() * 60, step = 14 + rng() * 26
    for (let i = 0; i < count; i++) {
      x.globalAlpha = 0.35 + rng() * 0.65
      x.fillRect(0, y0 + i * step + rng() * 4, COLS, 1 + rng() * 3)
    }
  },
  function sweeps(x, rng) {
    const count = 1 + Math.floor(rng() * 4)
    for (let i = 0; i < count; i++) {
      x.globalAlpha = 0.4 + rng() * 0.6
      x.lineWidth = 1 + rng() * 4
      x.beginPath()
      x.moveTo(rng() * 40, rng() * ROWS)
      x.quadraticCurveTo(COLS / 2 + (rng() - 0.5) * 80, rng() * ROWS, COLS - rng() * 40, rng() * ROWS)
      x.stroke()
    }
  },
  function ticks(x, rng) {
    const count = 4 + Math.floor(rng() * 20)
    for (let i = 0; i < count; i++) {
      x.globalAlpha = 0.3 + rng() * 0.7
      const h = 30 + rng() * (ROWS - 30)
      x.fillRect(rng() * COLS, rng() * (ROWS - h), 1 + rng() * 2, h)
    }
  },
  function worms(x, rng) {
    const count = 2 + Math.floor(rng() * 5)
    for (let w = 0; w < count; w++) {
      x.globalAlpha = 0.4 + rng() * 0.5
      x.lineWidth = 1 + rng() * 3
      let y = rng() * ROWS
      x.beginPath()
      x.moveTo(0, y)
      for (let px = 8; px <= COLS; px += 8) {
        y += (rng() - 0.5) * 22
        y = Math.max(4, Math.min(ROWS - 4, y))
        x.lineTo(px, y)
      }
      x.stroke()
    }
  },
  function cloud(x, rng) {
    const g = 6 + Math.floor(rng() * 8)
    const grid = Float32Array.from({ length: (g + 1) * (g + 1) }, () => rng())
    const id = x.createImageData(COLS, ROWS)
    const gain = 120 + rng() * 135
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gx = (c / COLS) * g, gy = (r / ROWS) * g
        const x0 = Math.floor(gx), y0 = Math.floor(gy)
        const fx = gx - x0, fy = gy - y0
        const v =
          grid[y0 * (g + 1) + x0] * (1 - fx) * (1 - fy) +
          grid[y0 * (g + 1) + x0 + 1] * fx * (1 - fy) +
          grid[(y0 + 1) * (g + 1) + x0] * (1 - fx) * fy +
          grid[(y0 + 1) * (g + 1) + x0 + 1] * fx * fy
        const val = Math.pow(v, 2.5) * gain
        const i = (r * COLS + c) * 4
        id.data[i] = id.data[i + 1] = id.data[i + 2] = val
        id.data[i + 3] = 255
      }
    }
    const tmp = document.createElement('canvas')
    tmp.width = COLS; tmp.height = ROWS
    tmp.getContext('2d').putImageData(id, 0, 0)
    x.globalAlpha = 0.7 + rng() * 0.3
    x.drawImage(tmp, 0, 0)
  },
  function speckle(x, rng) {
    const count = 40 + Math.floor(rng() * 260)
    for (let i = 0; i < count; i++) {
      x.globalAlpha = 0.3 + rng() * 0.7
      x.fillRect(rng() * COLS, rng() * ROWS, 1, 1)
    }
  },
]

export const genImage = async (seedKey) => {
  const rng = seededRng(`imggen:${seedKey}`)
  const canvas = document.createElement('canvas')
  canvas.width = COLS
  canvas.height = ROWS
  const x = canvas.getContext('2d')
  x.fillStyle = '#000'
  x.fillRect(0, 0, COLS, ROWS)
  x.fillStyle = '#fff'
  x.strokeStyle = '#fff'
  x.globalCompositeOperation = 'lighter'

  const order = [...MOTIFS]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]
  }
  const layers = 2 + Math.floor(rng() * 3)
  for (let i = 0; i < layers; i++) order[i](x, rng)

  const px = x.getImageData(0, 0, COLS, ROWS).data
  const lum = new Float32Array(COLS * ROWS)
  for (let i = 0; i < COLS * ROWS; i++) {
    lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255
  }
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { lum, bytes, name: `gen-${seedKey}.png`, thumb: canvas }
}

// col 0..COLS-1 from time, row from frequency (top of image = high freq)
const lumAt = (img, tNorm, freq, fHi) => {
  const col = Math.min(COLS - 1, Math.floor(clamp01(tNorm) * COLS))
  const rowNorm = clamp01((Math.log(Math.max(freq, F_LO)) - Math.log(F_LO)) / (Math.log(fHi) - Math.log(F_LO)))
  const row = Math.min(ROWS - 1, Math.floor((1 - rowNorm) * ROWS))
  return img.lum[row * COLS + col]
}

// ── SPECTRUM: additive resynthesis of the image ────────────
export const synthSpectrum = (img, nSamples, sampleRate, seedKey) => {
  const fHi = sampleRate * 0.42
  const out = [new Float32Array(nSamples), new Float32Array(nSamples)]
  const win = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME)
  const kLo = Math.max(1, Math.round((F_LO * FRAME) / sampleRate))
  const kHi = Math.min(FRAME / 2 - 1, Math.round((fHi * FRAME) / sampleRate))

  for (let c = 0; c < 2; c++) {
    const rng = seededRng(`${seedKey}:img:${c}`)
    const phase = new Float32Array(FRAME / 2)
    for (let k = 0; k < FRAME / 2; k++) phase[k] = rng() * 2 * Math.PI
    const re = new Float32Array(FRAME)
    const im = new Float32Array(FRAME)

    for (let pos = 0; pos + FRAME <= nSamples; pos += HOP) {
      re.fill(0); im.fill(0)
      const tNorm = pos / nSamples
      for (let k = kLo; k <= kHi; k++) {
        const freq = (k * sampleRate) / FRAME
        const amp = Math.pow(lumAt(img, tNorm, freq, fHi), GAMMA) / 48
        if (amp < 1e-6) { phase[k] += (2 * Math.PI * freq * HOP) / sampleRate; continue }
        re[k] = amp * Math.cos(phase[k])
        im[k] = amp * Math.sin(phase[k])
        re[FRAME - k] = re[k]
        im[FRAME - k] = -im[k]
        phase[k] += (2 * Math.PI * freq * HOP) / sampleRate
      }
      fft(re, im, true)
      for (let i = 0; i < FRAME; i++) out[c][pos + i] += re[i] * win[i]
    }
    let peak = 0
    for (let i = 0; i < nSamples; i++) { const a = Math.abs(out[c][i]); if (a > peak) peak = a }
    if (peak > 0) for (let i = 0; i < nSamples; i++) out[c][i] *= 0.8 / peak
  }
  return out
}

// ── CARVE: multiply the audio spectrum by the image ────────
export const carve = (chs, sampleRate, img, amt) => {
  const fHi = sampleRate * 0.42
  for (const ch of chs) {
    stft(ch, (re, im, tNorm) => {
      for (let k = 1; k < FRAME / 2; k++) {
        const freq = (k * sampleRate) / FRAME
        const g = lerp(1, lumAt(img, tNorm, freq, fHi), amt)
        re[k] *= g; im[k] *= g
        re[FRAME - k] *= g; im[FRAME - k] *= g
      }
    })
  }
}

// ── BEND: file bytes as PCM ────────────────────────────────
export const bend = (img, nSamples, sampleRate) => {
  const bytes = img.bytes
  const start = Math.floor(bytes.length * 0.02)
  const usable = Math.max(1, bytes.length - start)
  const out = new Float32Array(nSamples)
  let lp = 0, dc = 0
  for (let i = 0; i < nSamples; i++) {
    const raw = (bytes[start + (i % usable)] - 128) / 128
    dc = dc * 0.999 + raw * 0.001
    lp += BEND_LPF * (raw - dc - lp)
    out[i] = lp * 0.9
  }
  return [out, Float32Array.from(out)]
}

// ── stage in the render pipeline ───────────────────────────
export const applyImage = (L, R, sampleRate, imgState, seedKey) => {
  if (!imgState.data || imgState.mode === 'off') return
  const amt = imgState.amt / 100
  if (imgState.mode === 'carve') {
    carve([L, R], sampleRate, imgState.data, amt)
    return
  }
  const gen = imgState.mode === 'spectrum'
    ? synthSpectrum(imgState.data, L.length, sampleRate, seedKey)
    : bend(imgState.data, L.length, sampleRate)
  for (let i = 0; i < L.length; i++) {
    L[i] = lerp(L[i], gen[0][i], amt)
    R[i] = lerp(R[i], gen[1][i], amt)
  }
}
