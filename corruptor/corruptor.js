// Entry point: DOM wiring only. Sound logic lives in the focused modules —
// rng / source / modules (rack A) / dsp (rack B) / image / state / engine.

import { randomSeedHex } from './rng.js'
import { MODULES, buildPatch } from './modules.js'
import { POST_MODULES } from './dsp.js'
import { loadImage, genImage } from './image.js'
import { state, saveState, restoreState, resetState } from './state.js'
import { PRESETS } from './presets.js'
import {
  loadUserPresets, addUserPreset, removeUserPreset,
  snapshotPreset, exportPresetFile, parsePresetFile,
} from './userpresets.js'
import * as engine from './engine.js'
import { PREVIEW_CAP } from './engine.js'
import { startViz } from './viz.js'

const AUTOWIRE_MIN = 2
const AUTOWIRE_MAX = 6

const $ = (sel) => document.querySelector(sel)
const setStatus = (text) => { $('[data-js-status]').textContent = text }

// bars → seconds at a tempo (4/4, 4 beats per bar) — loops land on the grid
const barsToSec = (bars, bpm) => Math.round((bars * 240 / bpm) * 100) / 100

// LENGTH means something different per source shape
const LEN_ROLE = { shot: 'ДЛИТЕЛЬНОСТЬ УДАРА', loop: 'ПЕРИОД ПЕТЛИ', drone: 'НАПЛЫВ + ХВОСТ' }

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
    el.classList.toggle('is-on', st.on)
    el.querySelector('[data-mod-note]').textContent = st.on ? state.patch.notes[m.id] ?? '—' : 'OFF'
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
  $('[data-js-bpm]').value = state.bpm
  document.querySelectorAll('[data-bars]').forEach((b) => b.classList.toggle('is-on', state.bars !== null && +b.dataset.bars === state.bars))
  $('[data-js-barsout]').textContent = state.bars !== null ? `= ${state.len}с @ ${state.bpm}bpm` : ''
  $('[data-js-imgamt]').value = state.image.amt
  $('[data-js-imgamtout]').textContent = state.image.amt
  $('[data-js-imgdrop]').classList.toggle('has-img', !!state.image.data)
}

const syncLenRole = () => {
  // one-shots aren't a loop → BPM / bar quantization is meaningless, hide it
  const isShot = state.shape === 'shot'
  $('[data-js-tempo]').style.display = isShot ? 'none' : ''
  if (isShot && state.bars !== null) state.bars = null
  const trunc = state.len > PREVIEW_CAP ? ` · ПРЕВЬЮ ${PREVIEW_CAP}с` : ''
  $('[data-js-lenrole]').textContent = LEN_ROLE[state.shape] + trunc
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
  engine.stopLoop() // cut the old corrupted loop NOW → clean silence during the re-render, no overlap
  clearTimeout(bounceTimer)
  bounceTimer = setTimeout(runProcessed, 140)
}

// discrete switches (preset / reroll / shape / notes / module toggle) must fully
// kill the current sound before the new one — no lingering loop or ringing tail
const hardSwitch = () => {
  engine.stopAll()
  regen()
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

// ── randomizers ─────────────��──────────────────────────────
const reroll = () => {
  state.seed = randomSeedHex()
  hardSwitch()
  flashGlitch()
  setStatus('NEW SOURCE')
}

const reset = () => {
  engine.clearCache()
  resetState()
  state.seed = randomSeedHex()
  state.bpm = 138
  state.bars = null
  state.image = { mode: 'off', amt: 70, data: null, imgSeed: null }
  Object.values(state.modules).forEach((m) => { m.on = false })
  $('[data-js-imgdrop]').classList.remove('has-img')
  syncControls()
  hardSwitch()
  flashGlitch()
  setStatus('RESET ▸ CLEAN SLATE')
}

// module value in a preset: amt (number) or [amt, nonce] to pin the dice roll
const unpackMod = (v) => (Array.isArray(v)
  ? { on: true, amt: +v[0] || 0, nonce: +v[1] || 1 }
  : { on: true, amt: +v || 0, nonce: 1 })

const applyPreset = (p) => {
  resetState()
  state.modules.rust.on = false // presets define their own rack — no default leftovers
  Object.assign(state, {
    seed: p.seed, shape: p.shape, zone: p.zone ?? 'any', notes: p.notes ?? 'auto',
    noteNonce: p.noteNonce ?? 0, len: p.len ?? 2, curve: p.curve ?? 'collapse',
    bpm: p.bpm ?? state.bpm, bars: p.bars ?? null,
  })
  Object.entries(p.a ?? {}).forEach(([id, v]) => { if (state.modules[id]) state.modules[id] = unpackMod(v) })
  Object.entries(p.b ?? {}).forEach(([id, v]) => { if (state.post[id]) state.post[id] = unpackMod(v) })
  if (p.img?.imgSeed) {
    state.image = { mode: p.img.mode ?? 'spectrum', amt: p.img.amt ?? 70, data: null, imgSeed: p.img.imgSeed }
  }
  syncControls()
  hardSwitch()
  flashGlitch()
  setStatus(`PRESET ▸ ${p.name}`)
  // the IMAGE UNIT joins once the seeded image is regenerated
  if (p.img?.imgSeed) {
    genImage(p.img.imgSeed).then((data) => {
      if (state.image.imgSeed !== p.img.imgSeed) return // another preset won the race
      state.image.data = data
      showThumb(data)
      regen()
    })
  }
}

const autowire = () => {
  const count = AUTOWIRE_MIN + Math.floor(Math.random() * (AUTOWIRE_MAX - AUTOWIRE_MIN + 1))
  const chosen = new Set([...MODULES].sort(() => Math.random() - 0.5).slice(0, count).map((m) => m.id))
  MODULES.forEach((m) => {
    const st = state.modules[m.id]
    st.on = chosen.has(m.id)
    if (st.on) { st.amt = 20 + Math.floor(Math.random() * 81); st.nonce++ }
  })
  hardSwitch()
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

let userPresets = []

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

let activePresetRef = null

// what's inside the patch — the "spec line" on big browser cards
// (shape is NOT repeated here: the tag badge next to the name already shows it)
const specLine = (p) => {
  const a = Object.keys(p.a ?? {}).length
  const b = Object.keys(p.b ?? {}).length
  const parts = [(p.zone ?? 'any').toUpperCase(), `A×${a}`, `B×${b}`]
  if (p.img) parts.push('IMG')
  if (p.bpm) parts.push(`${p.bpm}BPM`)
  return parts.join(' · ')
}

const presetCard = (p, ref, isUser, big = false) => {
  const cls = ['preset']
  if (p.artist) cls.push('preset--artist')
  if (isUser) cls.push('preset--user')
  if (big) cls.push('preset--big')
  if (ref === activePresetRef) cls.push('is-active')
  const artistSig = p.artist
    ? `<em class="preset__artist">◆ ${esc(p.artist.nick)}${p.artist.url
        ? ` <a href="${esc(p.artist.url)}" target="_blank" rel="noopener noreferrer" data-artist-link title="страница артиста">IG ↗</a>`
        : ''}</em>`
    : ''
  const spec = big ? `<em class="preset__spec">${esc(specLine(p))}</em>` : ''
  const tools = isUser
    ? `<span class="preset__tools">
        <button data-preset-exp title="экспорт конфига .json">⇪</button>
        <button data-preset-del title="удалить пресет">×</button>
      </span>`
    : ''
  // compact bar cards stay exactly two lines tall: the artist signature
  // shares the tag line; the big modal cards give it its own row
  const tagLine = big
    ? `<i>${esc(p.tag || 'USER')}</i>${spec}${artistSig}`
    : `<span class="preset__meta"><i>${esc(p.tag || 'USER')}</i>${artistSig}</span>`
  return `<div class="${cls.join(' ')}" data-preset="${ref}" role="button" tabindex="0"
    aria-label="пресет ${esc(p.name)}"><b>${esc(p.name)}</b>${tagLine}${tools}</div>`
}

// compact bar: artist signatures lead the row for hype, then factory quick-access
const PREVIEW_COUNT = 8

const renderPresets = () => {
  const signed = []
  const plain = []
  PRESETS.forEach((p, i) => (p.artist ? signed : plain).push([p, i]))
  const preview = [...signed, ...plain].slice(0, PREVIEW_COUNT)
  const total = PRESETS.length + userPresets.length
  $('[data-js-presets]').innerHTML =
    preview.map(([p, i]) => presetCard(p, `f:${i}`, false)).join('') +
    `<button class="preset preset--browse" data-js-openbrowser>
      <b>◈ BROWSER</b><i>ВСЕ ${total} · ARTISTS</i>
    </button>`
}

// ── serum-style browser modal ──────────────────────────────
const renderBrowser = () => {
  const plain = []
  const signed = []
  PRESETS.forEach((p, i) => (p.artist ? signed : plain).push([p, i]))

  const section = (title, cards) => (cards.length
    ? `<h3 class="pbrowser__sect">${title}</h3><div class="pbrowser__grid">${cards.join('')}</div>`
    : '')

  $('[data-js-pbgrid]').innerHTML =
    section('◆ ARTIST SIGNATURE · ПОДПИСАННЫЕ ПРОДЮСЕРАМИ',
      signed.map(([p, i]) => presetCard(p, `f:${i}`, false, true))) +
    section('FACTORY · ЗАВОДСКИЕ',
      plain.map(([p, i]) => presetCard(p, `f:${i}`, false, true))) +
    section('USER · ТВОИ ЛОКАЛЬНЫЕ',
      userPresets.map((p, i) => presetCard(p, `u:${i}`, true, true)))
  $('[data-js-pbcount]').textContent =
    `${signed.length} ARTIST · ${plain.length} FACTORY · ${userPresets.length} USER`
}

const browserEl = () => $('[data-js-pbrowser]')
const isBrowserOpen = () => !browserEl().hidden

const openBrowser = () => {
  renderBrowser()
  browserEl().hidden = false
  document.body.classList.add('is-modal')
  $('[data-js-pbclose]').focus()
}

const closeBrowser = () => {
  browserEl().hidden = true
  document.body.classList.remove('is-modal')
}

// after any library change: refresh both the bar and (if open) the modal
const refreshPresetViews = () => {
  renderPresets()
  if (isBrowserOpen()) renderBrowser()
}

const presetByRef = (ref) => {
  const [src, idx] = ref.split(':')
  return { list: src === 'f' ? PRESETS : userPresets, i: +idx, isUser: src === 'u' }
}

// export flow: producer signs the config with a nick (+ optional instagram) —
// that's what shows up in the ARTIST frame when we ship their preset
const exportUserPreset = (p) => {
  const nick = (prompt('Твой ник артиста (подпись пресета, пусто = без подписи):', p.artist?.nick ?? '') || '').trim()
  const out = { ...p }
  if (nick) {
    let url = (prompt('Ссылка на инстаграм (не обязательно):', p.artist?.url ?? 'https://instagram.com/') || '').trim()
    if (!/^https:\/\/.+\..+/.test(url) || url === 'https://instagram.com/') url = null
    out.artist = { nick: nick.slice(0, 32), url }
    out.tag = 'ARTIST'
  } else {
    delete out.artist
    out.tag = 'USER'
  }
  exportPresetFile(out)
  setStatus(`EXPORTED ▸ ${out.name}`)
}

const wireRack = (container, stateMap, attr) => {
  container.addEventListener('click', (e) => {
    const card = e.target.closest(`[${attr}]`)
    if (!card) return
    const st = stateMap[card.getAttribute(attr)]
    if (e.target.closest('[data-mod-power]')) { st.on = !st.on; hardSwitch() } // toggling a module = a switch → clean cut
    if (e.target.closest('[data-mod-dice]')) { st.nonce++; if (!st.on) st.on = true; hardSwitch() }
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

// ── wiring ─────────────────────────────────────────────────
const init = () => {
  restoreState()
  userPresets = loadUserPresets()
  renderRack()
  renderPresets()
  wireRack($('[data-js-rack]'), state.modules, 'data-mod')
  wireRack($('[data-js-postrack]'), state.post, 'data-post')
  wireImageUnit()

  const handlePresetAction = (e) => {
    if (e.target.closest('[data-artist-link]')) return // let the artist link navigate
    if (e.target.closest('[data-js-openbrowser]')) { openBrowser(); return }
    const card = e.target.closest('[data-preset]')
    if (!card) return
    const { list, i, isUser } = presetByRef(card.dataset.preset)
    if (isUser && e.target.closest('[data-preset-del]')) {
      userPresets = removeUserPreset(i)
      if (activePresetRef === `u:${i}`) activePresetRef = null
      refreshPresetViews()
      setStatus('PRESET DELETED')
      return
    }
    if (isUser && e.target.closest('[data-preset-exp]')) {
      exportUserPreset(list[i])
      return
    }
    if (list[i]) {
      applyPreset(list[i])
      activePresetRef = card.dataset.preset
      refreshPresetViews() // browser stays open — click through and audition patches
    }
  }
  const wirePresetContainer = (el) => {
    el.addEventListener('click', handlePresetAction)
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-preset]')) {
        e.preventDefault()
        handlePresetAction(e)
      }
    })
  }
  wirePresetContainer($('[data-js-presets]'))
  wirePresetContainer($('[data-js-pbgrid]'))

  // modal chrome: close button, backdrop click, escape
  $('[data-js-pbclose]').addEventListener('click', closeBrowser)
  browserEl().addEventListener('click', (e) => { if (e.target === browserEl()) closeBrowser() })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isBrowserOpen()) closeBrowser()
  })

  $('[data-js-savepreset]').addEventListener('click', () => {
    const name = (prompt('Имя пресета:', `MY ${state.shape.toUpperCase()} ${state.seed}`) || '').trim()
    if (!name) return
    userPresets = addUserPreset(snapshotPreset(state, name.slice(0, 24).toUpperCase()))
    refreshPresetViews()
    setStatus(`SAVED ▸ ${name.toUpperCase()}`)
  })

  const presetFile = $('[data-js-presetfile]')
  $('[data-js-importpreset]').addEventListener('click', () => presetFile.click())
  presetFile.addEventListener('change', async () => {
    const file = presetFile.files[0]
    presetFile.value = ''
    if (!file) return
    try {
      const p = await parsePresetFile(file)
      userPresets = addUserPreset(p)
      applyPreset(p)
      activePresetRef = `u:${userPresets.length - 1}`
      refreshPresetViews()
      setStatus(`IMPORTED ▸ ${p.name}${p.artist ? ` · BY ${p.artist.nick}` : ''}`)
    } catch (err) {
      setStatus('BAD CONFIG FILE')
    }
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
      hardSwitch()
    }))

  document.querySelectorAll('[data-zone]').forEach((b) =>
    b.addEventListener('click', () => {
      state.zone = b.dataset.zone
      document.querySelectorAll('[data-zone]').forEach((x) => x.classList.toggle('is-on', x === b))
      hardSwitch()
    }))

  document.querySelectorAll('[data-notes]').forEach((b) =>
    b.addEventListener('click', () => {
      state.notes = b.dataset.notes
      document.querySelectorAll('[data-notes]').forEach((x) => x.classList.toggle('is-on', x === b))
      hardSwitch()
    }))

  $('[data-js-rndnotes]').addEventListener('click', () => {
    if (!state.patch.pitched) { setStatus('SOURCE NOT PITCHED — SET NOTES'); return }
    state.noteNonce++
    hardSwitch()
    flashGlitch()
    setStatus(`NOTES ▸ ${state.patch.source.names.join(' ')}`)
  })

  // manual seconds = free-form → drop the bar quantization
  const setLenSeconds = (sec) => {
    state.len = Math.min(120, Math.max(0.2, sec || 2))
    state.bars = null
    syncControls()
    regen()
  }
  $('[data-js-len]').addEventListener('change', (e) => setLenSeconds(+e.target.value))
  document.querySelectorAll('[data-len]').forEach((b) =>
    b.addEventListener('click', () => setLenSeconds(+b.dataset.len)))

  $('[data-js-bpm]').addEventListener('change', (e) => {
    state.bpm = Math.min(200, Math.max(60, Math.round(+e.target.value) || 138))
    e.target.value = state.bpm
    if (state.bars) state.len = barsToSec(state.bars, state.bpm) // keep the quantized length in sync
    syncControls()
    regen()
  })
  document.querySelectorAll('[data-bars]').forEach((b) =>
    b.addEventListener('click', () => {
      state.bars = +b.dataset.bars
      state.len = barsToSec(state.bars, state.bpm)
      syncControls()
      regen()
    }))

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
