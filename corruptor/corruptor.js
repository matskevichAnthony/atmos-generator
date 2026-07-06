// Entry point: DOM wiring only. Sound logic lives in the focused modules —
// rng / source / modules (rack A) / dsp (rack B) / image / state / engine.

import { randomSeedHex } from './rng.js'
import { MODULES, buildPatch } from './modules.js'
import { POST_MODULES } from './dsp.js'
import { loadImage, genImage } from './image.js'
import { state, saveState, restoreState, resetState } from './state.js'
import { PRESETS } from './presets.js'
import * as engine from './engine.js'
import { PREVIEW_CAP } from './engine.js'
import { startViz } from './viz.js'

const AUTOWIRE_MIN = 2
const AUTOWIRE_MAX = 6

const $ = (sel) => document.querySelector(sel)
const setStatus = (text) => { $('[data-js-status]').textContent = text }

// LENGTH means something different per source shape
const LEN_ROLE = {
  shot: { label: 'ДЛИТЕЛЬНОСТЬ УДАРА', hint: 'SHOT: длина = насколько долго тянется сам удар (0.4 — щелчок, 4 — наплыв).' },
  loop: { label: 'ПЕРИОД ПЕТЛИ', hint: 'LOOP: длина = сколько секунд в одном проходе петли, прежде чем она повторится.' },
  drone: { label: 'НАПЛЫВ + ХВОСТ', hint: 'DRONE: длина = как долго нарастает и держится тон, прежде чем перезапустится.' },
}

// ── patch assembly + displays ──────────────────────────────
const postSummary = () => {
  let out = ''
  const on = POST_MODULES.filter((m) => state.post[m.id].on)
  if (on.length) {
    const items = on.map((m) => `${m.name} ${state.post[m.id].amt}`).join(' · ')
    out += `\n// POST ▸ ${items} · CURVE ${state.curve.toUpperCase()}`
  }
  if (state.image.data && state.image.mode !== 'off') {
    out += `\n// IMG ▸ ${state.image.mode.toUpperCase()} ${state.image.amt} · ${state.image.data.name}`
  }
  return out
}

const renderSource = () => {
  const src = state.patch.source
  const parts = [src.voice]
  const notes = src.sequence ? src.sequence.join(' ') : src.names.join(' ')
  if (notes) parts.push(`${src.names.length}N ▸ ${notes}`)
  parts.push(src.sustained ? 'HOLD' : `${src.hits}/CYC`)
  $('[data-js-srcinfo]').textContent = parts.join(' · ')
  $('[data-js-ledstrip]').innerHTML = src.grid
    .map((on) => `<i class="${src.sustained ? 'is-hold' : on ? 'is-lit' : ''}"></i>`)
    .join('')
}

const syncRack = () => {
  MODULES.forEach((m) => {
    const el = $(`[data-mod="${m.id}"]`)
    const st = state.modules[m.id]
    const blocked = m.sampleOnly && !state.patch.isSample
    el.classList.toggle('is-on', st.on && !blocked)
    el.classList.toggle('is-blocked', blocked)
    el.querySelector('[data-mod-note]').textContent =
      blocked ? 'SMPL ONLY' : (st.on ? state.patch.notes[m.id] ?? '—' : 'OFF')
    el.querySelector('[data-mod-amt]').value = st.amt
  })
  POST_MODULES.forEach((m) => {
    const el = $(`[data-post="${m.id}"]`)
    const st = state.post[m.id]
    el.classList.toggle('is-on', st.on)
    el.querySelector('[data-mod-note]').textContent = st.on ? `AMT ${st.amt}` : 'OFF'
    el.querySelector('[data-mod-amt]').value = st.amt
  })
  document.querySelectorAll('[data-curve]').forEach((b) =>
    b.classList.toggle('is-on', b.dataset.curve === state.curve))
}

const syncControls = () => {
  document.querySelectorAll('[data-shape]').forEach((b) => b.classList.toggle('is-on', b.dataset.shape === state.shape))
  document.querySelectorAll('[data-zone]').forEach((b) => b.classList.toggle('is-on', b.dataset.zone === state.zone))
  document.querySelectorAll('[data-notes]').forEach((b) => b.classList.toggle('is-on', b.dataset.notes === state.notes))
  document.querySelectorAll('[data-imgmode]').forEach((b) => b.classList.toggle('is-on', b.dataset.imgmode === state.image.mode))
  $('[data-js-len]').value = state.len
  $('[data-js-imgamt]').value = state.image.amt
  $('[data-js-imgamtout]').textContent = state.image.amt
  $('[data-js-imgdrop]').classList.toggle('has-img', !!state.image.data)
}

const syncLenRole = () => {
  const role = LEN_ROLE[state.shape]
  $('[data-js-lenrole]').textContent = role.label
  const trunc = state.len > PREVIEW_CAP
    ? ` ◉ ПОРЧА-ПРЕВЬЮ — первые ${PREVIEW_CAP}с; REC пишет все ${state.len}с.`
    : ''
  $('[data-js-lenhint]').textContent = role.hint + trunc
}

const regen = () => {
  state.patch = buildPatch(state.seed, state, state.modules)
  $('[data-js-seed]').value = state.seed
  $('[data-js-code]').textContent = state.patch.code + postSummary()
  renderSource()
  syncLenRole()
  syncRack()
  saveState()
  refreshAudio()
}

// ── transport (one preview, auto live-vs-corrupted) ────────
// live  = source + RACK A → hot-swap strudel (instant)
// corrupt = any RACK B / image on → looped offline render, kept fresh
const isCorrupt = () =>
  POST_MODULES.some((m) => state.post[m.id].on) ||
  (state.image.data && state.image.mode !== 'off')

let bouncing = false
let bounceQueued = false
let bounceTimer = 0

const runProcessed = async () => {
  if (bouncing) { bounceQueued = true; return }
  bouncing = true
  try {
    do {
      bounceQueued = false
      // onNeedCapture fires only on a real re-render (source/RACK A change);
      // image/RACK B/curve tweaks reuse the cache and skip this entirely
      const buf = await engine.previewProcessed(state, () => {
        document.body.classList.add('is-rendering')
        setStatus('◉ RE-RENDER…')
      })
      if (!state.playing || !isCorrupt()) return
      engine.playLoop(buf.L, buf.R, buf.sampleRate)
      setStatus('LIVE · CORRUPTED')
    } while (bounceQueued)
  } finally {
    bouncing = false
    document.body.classList.remove('is-rendering')
  }
}

const scheduleProcessed = () => {
  clearTimeout(bounceTimer)
  bounceTimer = setTimeout(runProcessed, 140)
}

let liveTimer = 0
const scheduleLive = () => {
  clearTimeout(liveTimer)
  liveTimer = setTimeout(() => {
    engine.restartLive(state.patch.code) // re-trigger from the top so the change is unmistakable
    setStatus('LIVE · RACK A')
  }, 130)
}

// keep the running preview in sync after any param change (both modes restart
// from the beginning, so every tweak audibly re-triggers the loop/one-shot)
const refreshAudio = () => {
  if (!state.playing) return
  if (isCorrupt()) scheduleProcessed()
  else scheduleLive()
}

const play = () => {
  state.playing = true
  $('[data-js-play]').classList.add('is-on')
  if (isCorrupt()) {
    engine.stopAll()
    setStatus('BOUNCING SOURCE…')
    runProcessed()
  } else {
    engine.playLive(state.patch.code)
    setStatus('LIVE · RACK A')
  }
}

const stop = () => {
  state.playing = false
  clearTimeout(bounceTimer)
  clearTimeout(liveTimer)
  $('[data-js-play]').classList.remove('is-on')
  engine.stopAll()
  setStatus('READY')
}

const withBusy = async (btn, label, fn) => {
  btn.disabled = true
  btn.classList.add('is-rec')
  setStatus(label)
  try { return await fn() } finally {
    btn.disabled = false
    btn.classList.remove('is-rec')
  }
}

const renderWav = async () => {
  const wasPlaying = state.playing
  state.playing = false
  $('[data-js-play]').classList.remove('is-on')
  engine.stopAll()
  const { L, R, sampleRate } = await withBusy($('[data-js-rec]'), `RENDERING ${state.len}s…`, () => engine.renderExact(state))
  const peak = engine.saveWav(L, R, sampleRate, `dc77-${state.seed}-${state.len}s.wav`)
  setStatus(peak > 0.005 ? `SAVED dc77-${state.seed}.wav` : 'RENDERED SILENT — REROLL')
  if (wasPlaying) play()
}

// ── randomizers ────────────────────────────────────────────
const reroll = () => {
  state.seed = randomSeedHex()
  regen()
  flashGlitch()
  setStatus('NEW SOURCE')
}

const reset = () => {
  resetState()
  syncControls()
  regen()
  flashGlitch()
  setStatus('RESET ▸ DEFAULT')
}

const applyPreset = (p) => {
  resetState()
  Object.assign(state, {
    seed: p.seed, shape: p.shape, zone: p.zone ?? 'any', notes: p.notes ?? 'auto',
    noteNonce: 0, len: p.len ?? 2, curve: p.curve ?? 'collapse',
  })
  Object.entries(p.a ?? {}).forEach(([id, amt]) => { if (state.modules[id]) state.modules[id] = { on: true, amt, nonce: 1 } })
  Object.entries(p.b ?? {}).forEach(([id, amt]) => { if (state.post[id]) state.post[id] = { on: true, amt, nonce: 1 } })
  syncControls()
  regen()
  flashGlitch()
  setStatus(`PRESET ▸ ${p.name}`)
}

const autowire = () => {
  const count = AUTOWIRE_MIN + Math.floor(Math.random() * (AUTOWIRE_MAX - AUTOWIRE_MIN + 1))
  const chosen = new Set([...MODULES].sort(() => Math.random() - 0.5).slice(0, count).map((m) => m.id))
  MODULES.forEach((m) => {
    const st = state.modules[m.id]
    st.on = chosen.has(m.id)
    if (st.on) { st.amt = 20 + Math.floor(Math.random() * 81); st.nonce++ }
  })
  regen()
  flashGlitch()
  setStatus(`WIRED ${count} MODULES`)
}

// glitches appear only when reality changes (new seed / rewiring / new notes)
const flashGlitch = () => {
  document.querySelectorAll('[data-js-srcinfo], .plate__brand b').forEach((el) => {
    el.classList.remove('is-glitch')
    void el.offsetWidth // restart the animation
    el.classList.add('is-glitch')
  })
}

// ── racks ──────────────────────────────────────────────────
const modCard = (m, attr) => `
    <section class="mod" ${attr}="${m.id}">
      <button class="mod__power" data-mod-power title="on/off"></button>
      <header class="mod__head">
        <b>${m.name}</b>
        <button class="mod__dice" data-mod-dice title="перебросить внутренности">⌁</button>
      </header>
      <p class="mod__desc">${m.desc}</p>
      <canvas class="mod__viz" data-mod-viz width="176" height="42"></canvas>
      <input type="range" class="fader fader--mini" data-mod-amt min="0" max="100" step="1">
      <output class="mod__note" data-mod-note>OFF</output>
    </section>`

const renderRack = () => {
  $('[data-js-rack]').innerHTML = MODULES.map((m) => modCard(m, 'data-mod')).join('')
  $('[data-js-postrack]').innerHTML = POST_MODULES.map((m) => modCard(m, 'data-post')).join('')
}

const renderPresets = () => {
  $('[data-js-presets]').innerHTML = PRESETS.map((p, i) =>
    `<button class="preset" data-preset="${i}"><b>${p.name}</b><i>${p.tag}</i></button>`).join('')
}

const wireRack = (container, stateMap, attr) => {
  container.addEventListener('click', (e) => {
    const card = e.target.closest(`[${attr}]`)
    if (!card) return
    const st = stateMap[card.getAttribute(attr)]
    if (e.target.closest('[data-mod-power]')) { st.on = !st.on; regen() }
    if (e.target.closest('[data-mod-dice]')) { st.nonce++; if (!st.on) st.on = true; regen() }
  })
  container.addEventListener('input', (e) => {
    const card = e.target.closest(`[${attr}]`)
    if (!card || !e.target.matches('[data-mod-amt]')) return
    const st = stateMap[card.getAttribute(attr)]
    st.amt = +e.target.value
    if (!st.on) st.on = true
    regen()
  })
}

// ── image unit ─────────────────────────────────────────────
const setImageMode = (mode) => {
  state.image.mode = mode
  document.querySelectorAll('[data-imgmode]').forEach((b) =>
    b.classList.toggle('is-on', b.dataset.imgmode === mode))
}

const showThumb = (data) => {
  const thumb = $('[data-js-imgthumb]')
  thumb.getContext('2d').drawImage(data.thumb, 0, 0, thumb.width, thumb.height)
  $('[data-js-imgdrop]').classList.add('has-img')
}

const setImageData = (data, fallbackMode) => {
  state.image.data = data
  showThumb(data)
  if (state.image.mode === 'off') setImageMode(fallbackMode)
  regen()
}

const wireImageUnit = () => {
  const drop = $('[data-js-imgdrop]')
  const fileInput = $('[data-js-imgfile]')
  const takeImage = async (file) => {
    if (!file) return
    try {
      state.image.imgSeed = null
      setImageData(await loadImage(file), 'carve')
      setStatus(`IMG LOADED: ${state.image.data.name.toUpperCase()}`)
    } catch (e) {
      setStatus('NOT AN IMAGE')
    }
  }
  drop.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => takeImage(fileInput.files[0]))
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over') })
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'))
  drop.addEventListener('drop', (e) => {
    e.preventDefault()
    drop.classList.remove('is-over')
    takeImage(e.dataTransfer.files[0])
  })
  $('[data-js-imggen]').addEventListener('click', async () => {
    const imgSeed = randomSeedHex()
    state.image.imgSeed = imgSeed
    setImageData(await genImage(imgSeed), 'spectrum')
    setStatus(`GEN IMG ${imgSeed}`)
  })
  document.querySelectorAll('[data-imgmode]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.imgmode !== 'off' && !state.image.data) { setStatus('DROP AN IMAGE FIRST'); return }
      setImageMode(b.dataset.imgmode)
      regen()
    }))
  $('[data-js-imgamt]').addEventListener('input', (e) => {
    state.image.amt = +e.target.value
    $('[data-js-imgamtout]').textContent = state.image.amt
    regen()
  })
}

// ── sample banks ───────────────────────────────────────────
const loadBanks = async () => {
  const url = $('[data-js-bankurl]').value.trim()
  const names = $('[data-js-banknames]').value.trim()
  if (!url) { setStatus('NO BANK URL'); return }
  setStatus('LOADING BANK…')
  try {
    await engine.loadSampleBank(url)
    state.banks = names ? names.split(',').map((s) => s.trim()).filter(Boolean) : []
    setStatus(state.banks.length ? `BANK OK: ${state.banks.length} NAMES` : 'BANK OK — ADD NAMES')
    regen()
  } catch (e) {
    setStatus('BANK LOAD FAILED')
  }
}

// ── wiring ─────────────────────────────────────────────────
const init = () => {
  restoreState()
  renderRack()
  renderPresets()
  wireRack($('[data-js-rack]'), state.modules, 'data-mod')
  wireRack($('[data-js-postrack]'), state.post, 'data-post')
  wireImageUnit()

  $('[data-js-presets]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]')
    if (btn) applyPreset(PRESETS[+btn.dataset.preset])
  })
  $('[data-js-reset]').addEventListener('click', reset)

  document.querySelectorAll('[data-curve]').forEach((b) =>
    b.addEventListener('click', () => { state.curve = b.dataset.curve; regen() }))

  $('[data-js-rnd]').addEventListener('click', reroll)
  $('[data-js-autowire]').addEventListener('click', autowire)
  $('[data-js-play]').addEventListener('click', () => (state.playing ? stop() : play()))
  $('[data-js-stop]').addEventListener('click', stop)
  $('[data-js-rec]').addEventListener('click', renderWav)
  $('[data-js-copy]').addEventListener('click', () => {
    navigator.clipboard.writeText(state.patch.code)
    setStatus('CODE COPIED')
  })

  $('[data-js-seed]').addEventListener('change', (e) => {
    const v = e.target.value.trim().toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 8)
    if (v.length) { state.seed = v.padStart(8, '0'); regen(); setStatus('SEED RECALLED') }
  })

  document.querySelectorAll('[data-shape]').forEach((b) =>
    b.addEventListener('click', () => {
      state.shape = b.dataset.shape
      document.querySelectorAll('[data-shape]').forEach((x) => x.classList.toggle('is-on', x === b))
      regen()
    }))

  document.querySelectorAll('[data-zone]').forEach((b) =>
    b.addEventListener('click', () => {
      state.zone = b.dataset.zone
      document.querySelectorAll('[data-zone]').forEach((x) => x.classList.toggle('is-on', x === b))
      regen()
    }))

  document.querySelectorAll('[data-notes]').forEach((b) =>
    b.addEventListener('click', () => {
      state.notes = b.dataset.notes
      document.querySelectorAll('[data-notes]').forEach((x) => x.classList.toggle('is-on', x === b))
      regen()
    }))

  $('[data-js-rndnotes]').addEventListener('click', () => {
    if (!state.patch.pitched) { setStatus('SOURCE NOT PITCHED — SET NOTES'); return }
    state.noteNonce++
    regen()
    flashGlitch()
    setStatus(`NOTES ▸ ${state.patch.source.names.join(' ')}`)
  })

  $('[data-js-len]').addEventListener('change', (e) => {
    state.len = Math.min(120, Math.max(0.2, +e.target.value || 2))
    e.target.value = state.len
    regen()
  })
  document.querySelectorAll('[data-len]').forEach((b) =>
    b.addEventListener('click', () => {
      state.len = +b.dataset.len
      $('[data-js-len]').value = state.len
      regen()
    }))

  $('[data-js-loadbank]').addEventListener('click', loadBanks)

  syncControls()
  regen()
  setStatus('READY')
  startViz()

  // a generated image survives refresh via its seed
  if (state.image.imgSeed && state.image.mode !== 'off') {
    genImage(state.image.imgSeed).then((data) => {
      state.image.data = data
      showThumb(data)
      regen()
      setStatus(`RESTORED · IMG ${state.image.imgSeed}`)
    })
  }
}

init()

window.Corruptor = {
  state, regen, reroll, autowire, play, stop,
  renderWav, isCorrupt, buildPatch,
}
