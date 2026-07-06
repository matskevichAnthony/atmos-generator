// Ambient visual layer. Reads audio + state, never mutates them.
// - background: full-page halftone LED field driven by the master spectrum
//   (own FFT over the capture tap — works for live stream and corrupted loop)
// - CRT: waveform + dim spectrum columns
// - per-module dot-matrix displays (awake only when the module is on & playing)
// Idle = almost dead. Motion = information. fillRect/transform only.

import { state } from './state.js'
import { fft } from './dsp.js'
import * as engine from './engine.js'
import { vizFor } from './viz-patterns.js'

const CELL = 22
const FFT_N = 1024
const BASS_GLITCH_LEVEL = 0.55
const MOD_GRID = { c: 22, r: 6 }

const $ = (sel) => document.querySelector(sel)

// ── spectrum from the master tap ───────────────────────────
const re = new Float32Array(FFT_N)
const im = new Float32Array(FFT_N)
const mags = new Float32Array(FFT_N / 2)

const computeSpectrum = () => {
  const scope = engine.getScope()
  if (!scope || scope.length < FFT_N) return null
  let alive = false
  for (let i = 0; i < FFT_N; i++) {
    re[i] = scope[i]
    im[i] = 0
    if (!alive && Math.abs(scope[i]) > 0.002) alive = true
  }
  if (!alive) return null
  fft(re, im, false)
  for (let k = 0; k < FFT_N / 2; k++) mags[k] = Math.hypot(re[k], im[k])
  return mags
}

const bandEnergy = (spec, c, total) => {
  const kLo = 2, kHi = FFT_N * 0.35
  const k = Math.floor(kLo * Math.pow(kHi / kLo, c / Math.max(1, total - 1)))
  const span = Math.max(3, Math.floor(k * 0.4)) // wide windows: tonal sources still fill the field
  let m = 0
  for (let i = Math.max(kLo, k - 1); i < Math.min(kHi, k + span); i++) if (mags[i] > m) m = mags[i]
  return Math.min(1, Math.pow(m / 45, 0.5))
}

// ── background field ───────────────────────────────────────
let bg, bgx, cols = new Float32Array(0), bass = 0, frame = 0

const resize = () => {
  bg.width = innerWidth
  bg.height = innerHeight
  const c = Math.ceil(bg.width / CELL)
  if (cols.length !== c) cols = new Float32Array(c)
}

// awake = a session is playing; spec present = audio this frame.
// The dead-flicker is ONLY for a stopped machine. While playing, a momentary
// silence (the hush→capture gap of every bounce, or a hot-swap) just decays the
// field — so switching modes/effects no longer strobes the whole page.
const drawBg = (spec, awake) => {
  const w = bg.width, h = bg.height
  bgx.clearRect(0, 0, w, h)
  const C = cols.length
  const R = Math.ceil(h / CELL)

  if (!awake) { // stopped: almost dead
    for (let c = 0; c < C; c++) cols[c] *= 0.7
    bgx.fillStyle = '#161616'
    for (let i = 0; i < 26; i++) {
      const c = (i * 53 + (frame >> 5) * 17) % C
      const r = (i * 29 + (frame >> 6) * 11) % R
      if ((c + r + (frame >> 4)) % 5 === 0) bgx.fillRect(c * CELL, r * CELL, CELL - 8, CELL - 8)
    }
    return
  }

  if (spec) {
    let b = 0
    for (let k = 2; k < 9; k++) if (mags[k] > b) b = mags[k]
    bass = Math.max(Math.min(1, b / 90), bass * 0.9)
    for (let c = 0; c < C; c++) {
      const target = bandEnergy(spec, c, C)
      cols[c] += (target - cols[c]) * (target > cols[c] ? 0.45 : 0.14) // smoothed attack, no slam
    }
  } else { // playing but silent for a frame or two: fade, don't die
    bass *= 0.9
    for (let c = 0; c < C; c++) cols[c] *= 0.92
  }
  // energy bleeds sideways: glow spreads across the field
  for (let c = 1; c < C - 1; c++) {
    cols[c] = Math.max(cols[c], cols[c - 1] * 0.82, cols[c + 1] * 0.82)
  }

  for (let c = 0; c < C; c++) {
    const lit = cols[c] * R * 0.92
    const drift = Math.sin(c * 0.35 + frame * 0.015) * 0.6 // slow trippy sway
    for (let r = 0; r < lit; r++) {
      if ((c * 7 + r * 13 + (frame >> 2)) % 4 === 0) continue // dither holes
      const y = h - (r + 1) * CELL
      // bass slams knock rows sideways: scan-fragment corruption
      const shift = bass > BASS_GLITCH_LEVEL && (r * 7 + frame) % 11 === 0
        ? CELL * (((r + frame) % 3) - 1) : 0
      const fade = 1 - r / (lit + 1)
      const tip = r >= lit - 1 && cols[c] > 0.5
      bgx.fillStyle = tip ? 'rgba(255,0,0,.5)' : `rgba(255,255,255,${(0.04 + fade * 0.16).toFixed(3)})`
      bgx.fillRect(c * CELL + shift + drift, y, CELL - 6, CELL - 6)
    }
  }

  // roaming red scanline — the machine is awake
  const x = ((frame * 0.6) % C) * CELL
  bgx.fillStyle = 'rgba(255,0,0,.07)'
  bgx.fillRect(x, 0, CELL - 6, h)
}

// ── CRT: spectrum columns under the red waveform ───────────
const drawCrt = (spec) => {
  const canvas = $('[data-js-scope]')
  const ctx = canvas.getContext('2d')
  const w = canvas.width, hh = canvas.height
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fillRect(0, 0, w, hh)

  if (spec) {
    const C = 56, cw = w / C
    for (let c = 0; c < C; c++) {
      const e = bandEnergy(spec, c, C)
      const litRows = Math.round(e * 7)
      for (let r = 0; r < litRows; r++) {
        ctx.fillStyle = r === litRows - 1 && e > 0.55 ? 'rgba(255,0,0,.55)' : 'rgba(255,255,255,.13)'
        ctx.fillRect(c * cw + 1, hh - (r + 1) * (hh / 8), cw - 3, hh / 8 - 3)
      }
    }
  }

  const scope = engine.getScope()
  if (scope) {
    ctx.strokeStyle = '#ff0000'
    ctx.shadowColor = '#ff0000'
    ctx.shadowBlur = 5
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const mid = hh / 2
    for (let x = 0; x < w; x++) {
      const v = scope[Math.floor((x / w) * scope.length)] || 0
      const y = mid - v * mid * 0.85
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

// ── per-module dot-matrix displays ─────────────────────────
const phases = new Map()

const drawMods = () => {
  document.querySelectorAll('[data-mod-viz]').forEach((canvas, idx) => {
    const card = canvas.closest('[data-mod],[data-post]')
    if (!card) return
    const id = card.getAttribute('data-mod') ?? card.getAttribute('data-post')
    const st = (card.hasAttribute('data-mod') ? state.modules : state.post)[id]
    const on = card.classList.contains('is-on')
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)

    const cw = w / MOD_GRID.c, ch = h / MOD_GRID.r
    if (!on) { // dormant: a few dead pixels
      ctx.fillStyle = '#1c1c1c'
      for (let c = 0; c < MOD_GRID.c; c++) for (let r = 0; r < MOD_GRID.r; r++)
        if ((c * 13 + r * 7 + idx) % 41 === 0) ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2)
      return
    }

    let ph = phases.get(id) ?? idx * 3.7
    if (state.playing) ph += 0.06 + (st.amt / 100) * 0.16 // awake only while playing
    phases.set(id, ph)

    const g = {
      C: MOD_GRID.c,
      R: MOD_GRID.r,
      cell: (c, r, color) => {
        if (c < 0 || c >= MOD_GRID.c || r < 0 || r >= MOD_GRID.r) return
        ctx.fillStyle = color
        ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2)
      },
    }
    vizFor(id)(g, ph, st.amt / 100)
  })
}

// ── loop ───────────────────────────────────────────────────
const loop = () => {
  frame++
  const spec = computeSpectrum()
  if (frame % 2 === 0) drawBg(spec, state.playing)
  drawCrt(spec)
  if (frame % 3 === 0) drawMods()
  requestAnimationFrame(loop)
}

export const startViz = () => {
  bg = $('[data-js-bg]')
  bgx = bg.getContext('2d')
  resize()
  addEventListener('resize', resize)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    drawBg(null)
    drawMods()
    return
  }
  requestAnimationFrame(loop)
}
