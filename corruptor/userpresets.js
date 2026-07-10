// User & artist presets: localStorage persistence + .json config export/import.
// A config is fully self-contained (seeds + module amounts + dice nonces),
// so a producer can save a patch, export the file, send it over — and it
// reproduces bit-for-bit on any machine. Signed configs (artist field) get
// the ARTIST frame in the preset bar.

import { MODULES } from './modules.js'
import { POST_MODULES } from './dsp.js'

const KEY = 'dc77-user-presets'

export const loadUserPresets = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(v) ? v : []
  } catch (e) { return [] }
}

const persist = (list) => localStorage.setItem(KEY, JSON.stringify(list))

export const addUserPreset = (p) => {
  const list = loadUserPresets()
  list.push(p)
  persist(list)
  return list
}

export const removeUserPreset = (index) => {
  const list = loadUserPresets()
  list.splice(index, 1)
  persist(list)
  return list
}

// snapshot the current state → self-contained preset config.
// [amt, nonce] pins each module's internal dice roll, so the exact sound comes back.
export const snapshotPreset = (state, name) => {
  const pack = (defs, map) => {
    const out = {}
    defs.forEach((m) => {
      const st = map[m.id]
      if (st.on) out[m.id] = [st.amt, st.nonce]
    })
    return out
  }
  const p = {
    v: 1, name, tag: 'USER',
    seed: state.seed, shape: state.shape, zone: state.zone, notes: state.notes,
    noteNonce: state.noteNonce, len: state.len, bpm: state.bpm, bars: state.bars,
    curve: state.curve,
    a: pack(MODULES, state.modules),
    b: pack(POST_MODULES, state.post),
  }
  // a generated image reproduces from its seed; an uploaded file can't travel in a config
  if (state.image.imgSeed && state.image.mode !== 'off') {
    p.img = { imgSeed: state.image.imgSeed, mode: state.image.mode, amt: state.image.amt }
  }
  return p
}

export const exportPresetFile = (p) => {
  const safe = (p.name || 'preset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `dc77-preset-${safe || 'config'}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

// parse + sanitize an incoming config file (untrusted input)
export const parsePresetFile = async (file) => {
  const p = JSON.parse(await file.text())
  if (!p || typeof p !== 'object' || typeof p.seed !== 'string' || !['shot', 'loop', 'drone'].includes(p.shape)) {
    throw new Error('bad config')
  }
  p.seed = p.seed.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 8).padStart(8, '0')
  p.name = String(p.name || 'IMPORT').slice(0, 24).toUpperCase()
  if (p.artist && typeof p.artist === 'object') {
    const url = typeof p.artist.url === 'string' && /^https:\/\//.test(p.artist.url) ? p.artist.url : null
    p.artist = { nick: String(p.artist.nick || '???').slice(0, 32), url }
    p.tag = 'ARTIST'
  } else {
    delete p.artist
    p.tag = 'USER'
  }
  return p
}
