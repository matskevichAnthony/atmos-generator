// App state + persistence. The saved subset fully reproduces a session:
// seeds + settings, никаких аудиоданных (звук пересобирается из сидов).

import { randomSeedHex } from './rng.js'
import { MODULES } from './modules.js'
import { POST_MODULES } from './dsp.js'
import { defaultDraw, sanitizeDraw } from './drawmod.js'

const STORAGE_KEY = 'dc77-state'

export const state = {
  seed: randomSeedHex(),
  shape: 'loop',
  zone: 'any',
  notes: 'auto',
  noteNonce: 0,
  len: 2,
  bpm: 138,
  bars: null, // when set, len is quantized to this many bars at bpm
  playing: false,
  patch: null,
  curve: 'collapse',
  image: { mode: 'off', amt: 70, data: null, imgSeed: null },
  draw: defaultDraw(),
  modules: Object.fromEntries(MODULES.map((m) => [m.id, { on: false, amt: 60, nonce: 0 }])),
  post: Object.fromEntries(POST_MODULES.map((m) => [m.id, { on: false, amt: 60, nonce: 0 }])),
}
state.modules.rust.on = true

// factory defaults for generative settings (keeps seed, banks, playing)
export const resetState = () => {
  Object.assign(state, { shape: 'loop', zone: 'any', notes: 'auto', noteNonce: 0, len: 2, bars: null, curve: 'collapse' })
  state.image = { mode: 'off', amt: 70, data: null, imgSeed: null }
  state.draw = defaultDraw()
  MODULES.forEach((m) => { state.modules[m.id] = { on: false, amt: 60, nonce: 0 } })
  POST_MODULES.forEach((m) => { state.post[m.id] = { on: false, amt: 60, nonce: 0 } })
  state.modules.rust.on = true
}

export const saveState = () => {
  const { seed, shape, zone, notes, noteNonce, len, bpm, bars, curve, modules, post, draw } = state
  const image = { mode: state.image.mode, amt: state.image.amt, imgSeed: state.image.imgSeed }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ seed, shape, zone, notes, noteNonce, len, bpm, bars, curve, modules, post, image, draw }))
}

export const restoreState = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!saved?.seed) return
    Object.assign(state, {
      seed: saved.seed, shape: saved.shape, zone: saved.zone,
      notes: saved.notes ?? 'auto', noteNonce: saved.noteNonce ?? 0,
      len: saved.len, bpm: saved.bpm ?? 138, bars: saved.bars ?? null, curve: saved.curve,
    })
    for (const [id, st] of Object.entries(saved.modules ?? {})) if (state.modules[id]) Object.assign(state.modules[id], st)
    for (const [id, st] of Object.entries(saved.post ?? {})) if (state.post[id]) Object.assign(state.post[id], st)
    // a generated image is reproducible from its seed; an uploaded file is not
    if (saved.image?.imgSeed) Object.assign(state.image, saved.image)
    else state.image.mode = 'off'
    if (saved.draw) {
      const d = sanitizeDraw(saved.draw)
      if (d) state.draw = { ...d, on: !!saved.draw.on }
    }
  } catch (e) { /* corrupt storage — start fresh */ }
}
