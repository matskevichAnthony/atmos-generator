import { initStrudel, evaluate, hush, getAnalyzerData, getTime, getAudioContextCurrentTime } from '/node_modules/@strudel/web/dist/index.mjs'
import { LAYERS, STYLES, ROOTS } from './layers.js'

initStrudel()

const RECORD_PRE_SEC = 0.3
const ONSET_THRESHOLD = 0.05
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const firstOnset = (samples, sampleRate) => {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > ONSET_THRESHOLD) return i / sampleRate
  }
  return null
}

const state = {
  bpm: 136,
  root: 31,
  bars: 8,
  playing: false,
  everPlayed: false,
  solo: null,
  layers: Object.fromEntries(LAYERS.map((l) => [l.id, {
    preset: Object.keys(l.presets)[0],
    macros: Object.fromEntries(l.macros.map((m) => [m.key, m.def])),
    vol: l.vol,
    mute: false,
  }])),
}

const applyPresetToLayer = (layer, presetName) => {
  const ls = state.layers[layer.id]
  const preset = layer.presets[presetName]
  ls.preset = presetName
  layer.macros.forEach((m) => { ls.macros[m.key] = preset[m.key] ?? m.def })
}

const activeLayers = () => LAYERS.filter((l) =>
  state.solo ? l.id === state.solo : !state.layers[l.id].mute)

const layerCode = (layer) => {
  const ls = state.layers[layer.id]
  const preset = layer.presets[ls.preset]
  const merged = { ...ls.macros }
  return layer.build(merged, preset, { root: state.root })
    + `.gain(${ls.vol}).orbit(${layer.orbit}).analyze('${layer.id}')`
}

const assemble = (layers) => {
  const body = layers.map((l) => `  // ${l.label}\n  ${layerCode(l)}`).join(',\n')
  return `setcpm(${state.bpm}/4)\nstack(\n${body}\n)`
}

const cycleSec = () => 240 / state.bpm

// ── transport ──────────────────────────────────────────────
const refresh = () => {
  const code = assemble(activeLayers())
  document.querySelector('[data-js-fullcode]').textContent = code
  if (state.playing) evaluate(code)
}

const play = () => { state.playing = true; state.everPlayed = true; syncTransportUi(); refresh() }
const stop = () => { state.playing = false; syncTransportUi(); hush() }

const syncTransportUi = () => {
  document.querySelector('[data-js-play]').classList.toggle('is-on', state.playing)
  document.querySelector('[data-js-led]').classList.toggle('is-on', state.playing)
}

// ── quantized recording ────────────────────────────────────
// hush() resets the transport clock; getTime() then ticks in cycles from 0.
// We map cycle time to audio-clock time, take the boundary of cycle 1
// (cycle 0 is warm-up: fills reverb/delay tails so the loop starts "in flow"),
// then slice exactly N bars from the timestamped capture — sample-accurate.
// synth voices live in AudioWorklets that spin up on first playback;
// warm the engine up once so the very first capture isn't silent
const warmup = async () => {
  if (state.everPlayed) return
  evaluate(assemble(activeLayers()))
  await sleep(900)
  hush()
  state.everPlayed = true
}

const captureQuantized = async (code, seconds) => {
  const cap = window.StrudelCapture
  hush()
  await sleep(400)
  cap.startRaw()
  evaluate(code)
  await sleep(RECORD_PRE_SEC * 1000)
  const cyc = cycleSec()
  const phase = getTime()
  const tStart = getAudioContextCurrentTime() + (Math.max(1, Math.ceil(phase + 0.1 / cyc)) - phase) * cyc
  while (cap.getCapturedEnd() < tStart + seconds + 0.05) await sleep(120)
  const raw = cap.stopRaw()
  hush()
  return cap.slice(raw, tStart, seconds)
}

const setBusy = (btn, text) => {
  btn.disabled = true
  btn.dataset.label = btn.dataset.label || btn.textContent
  btn.textContent = text
}
const clearBusy = (btn) => {
  btn.disabled = false
  btn.textContent = btn.dataset.label
}

const exportStems = async ({ download = true } = {}) => {
  const layers = activeLayers()
  const seconds = state.bars * cycleSec()
  const wasPlaying = state.playing
  await warmup()
  state.playing = false
  syncTransportUi()

  const btn = document.querySelector('[data-js-stems]')
  const results = []
  for (let i = 0; i < layers.length; i++) {
    setBusy(btn, `⏺ ${i + 1}/${layers.length} ${layers[i].id}…`)
    const code = `setcpm(${state.bpm}/4)\n${layerCode(layers[i])}`
    const { L, R, sampleRate } = await captureQuantized(code, seconds)
    const { blob, peak, normalized } = window.StrudelCapture.makeWav(L, R, sampleRate)
    if (download) window.StrudelCapture.saveBlob(blob, `${layers[i].id}-${state.bpm}bpm-${state.bars}bars.wav`)
    results.push({ id: layers[i].id, seconds: L.length / sampleRate, peak, normalized, onset: firstOnset(L, sampleRate) })
  }

  clearBusy(btn)
  if (wasPlaying) play()
  return results
}

const recordMix = async ({ download = true } = {}) => {
  const seconds = state.bars * cycleSec()
  const wasPlaying = state.playing
  await warmup()
  state.playing = false
  syncTransportUi()

  const btn = document.querySelector('[data-js-recmix]')
  setBusy(btn, `⏺ ${state.bars} тактов…`)
  const { L, R, sampleRate } = await captureQuantized(assemble(activeLayers()), seconds)
  const { blob, peak, normalized } = window.StrudelCapture.makeWav(L, R, sampleRate)
  if (download) window.StrudelCapture.saveBlob(blob, `mix-${state.bpm}bpm-${state.bars}bars.wav`)
  clearBusy(btn)
  if (wasPlaying) play()
  return { seconds: L.length / sampleRate, peak, normalized }
}

// ── layer cards ────────────────────────────────────────────
const renderCards = () => {
  const wrap = document.querySelector('[data-js-layers]')
  wrap.innerHTML = LAYERS.map((l) => `
    <section class="card" data-layer="${l.id}">
      <header class="card__head">
        <b>${l.label}</b>
        <span class="vu"><i data-vu="${l.id}"></i></span>
        <span class="card__btns">
          <button class="chip" data-act="rnd" title="случайные настройки слоя">🎲</button>
          <button class="chip" data-act="mute" title="mute">M</button>
          <button class="chip" data-act="solo" title="solo">S</button>
        </span>
      </header>
      <label class="row">
        <span>пресет</span>
        <select data-act="preset">
          ${Object.keys(l.presets).map((p) => `<option value="${p}">${p}</option>`).join('')}
        </select>
      </label>
      ${l.macros.map((m) => `
        <label class="row">
          <span>${m.label} <output data-macro-out="${m.key}"></output></span>
          <input type="range" data-act="macro" data-key="${m.key}" min="${m.min}" max="${m.max}" step="${m.step}">
        </label>`).join('')}
      <label class="row">
        <span>громкость <output data-macro-out="__vol"></output></span>
        <input type="range" data-act="vol" min="0" max="1.4" step="0.05">
      </label>
    </section>`).join('')
}

const syncCards = () => {
  LAYERS.forEach((l) => {
    const ls = state.layers[l.id]
    const card = document.querySelector(`[data-layer="${l.id}"]`)
    card.querySelector('[data-act="preset"]').value = ls.preset
    l.macros.forEach((m) => {
      card.querySelector(`[data-key="${m.key}"]`).value = ls.macros[m.key]
      card.querySelector(`[data-macro-out="${m.key}"]`).textContent = ls.macros[m.key]
    })
    card.querySelector('[data-act="vol"]').value = ls.vol
    card.querySelector('[data-macro-out="__vol"]').textContent = ls.vol
    card.classList.toggle('is-muted', state.solo ? l.id !== state.solo : ls.mute)
    card.querySelector('[data-act="mute"]').classList.toggle('is-on', ls.mute)
    card.querySelector('[data-act="solo"]').classList.toggle('is-on', state.solo === l.id)
  })
  document.querySelector('[data-js-bpm-out]').textContent = state.bpm
  document.querySelector('[data-js-bpm]').value = state.bpm
  document.querySelector('[data-js-root]').value = state.root
  document.querySelector('[data-js-bars]').value = state.bars
}

const randomizeLayer = (layer) => {
  const ls = state.layers[layer.id]
  const names = Object.keys(layer.presets)
  applyPresetToLayer(layer, names[Math.floor(Math.random() * names.length)])
  layer.macros.forEach((m) => {
    const steps = Math.floor((m.max - m.min) / m.step)
    ls.macros[m.key] = Math.round((m.min + m.step * Math.floor(Math.random() * (steps + 1))) * 100) / 100
  })
}

const applyStyle = (name) => {
  const style = STYLES[name]
  state.bpm = style.bpm
  state.root = style.root
  state.solo = null
  LAYERS.forEach((l) => {
    const cfg = style.layers[l.id] ?? {}
    const ls = state.layers[l.id]
    ls.mute = !!cfg.mute
    if (cfg.preset) applyPresetToLayer(l, cfg.preset)
    if (cfg.vol !== undefined) ls.vol = cfg.vol
    if (cfg.macros) Object.assign(ls.macros, cfg.macros)
  })
}

// ── meters ─────────────────────────────────────────────────
const drawLoop = () => {
  LAYERS.forEach((l) => {
    const el = document.querySelector(`[data-vu="${l.id}"]`)
    if (!el) return
    let peak = 0
    try {
      const data = getAnalyzerData('time', l.id)
      for (let i = 0; i < data.length; i += 4) { const a = Math.abs(data[i]); if (a > peak) peak = a }
    } catch (e) { /* analyser not created yet */ }
    el.style.width = `${Math.min(100, peak * 130)}%`
  })

  const level = window.StrudelCapture?.getLevel() ?? 0
  document.querySelector('[data-js-master]').style.width = `${Math.min(100, level * 90)}%`

  const canvas = document.querySelector('[data-js-scope]')
  const ctx = canvas.getContext('2d')
  const scope = window.StrudelCapture?.getScope()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (scope) {
    ctx.strokeStyle = '#e2372a'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const mid = canvas.height / 2
    for (let x = 0; x < canvas.width; x++) {
      const v = scope[Math.floor((x / canvas.width) * scope.length)] || 0
      const y = mid - v * mid * 0.9
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  requestAnimationFrame(drawLoop)
}

// ── wiring ─────────────────────────────────────────────────
const init = () => {
  renderCards()

  const rootSel = document.querySelector('[data-js-root]')
  rootSel.innerHTML = ROOTS.map((r) => `<option value="${r.midi}">${r.label}</option>`).join('')

  document.querySelector('[data-js-layers]').addEventListener('input', (e) => {
    const card = e.target.closest('[data-layer]')
    if (!card) return
    const layer = LAYERS.find((l) => l.id === card.dataset.layer)
    const ls = state.layers[layer.id]
    const act = e.target.dataset.act
    if (act === 'macro') ls.macros[e.target.dataset.key] = +e.target.value
    if (act === 'vol') ls.vol = +e.target.value
    if (act === 'preset') applyPresetToLayer(layer, e.target.value)
    syncCards(); refresh()
  })

  document.querySelector('[data-js-layers]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]')
    const card = e.target.closest('[data-layer]')
    if (!btn || !card) return
    const layer = LAYERS.find((l) => l.id === card.dataset.layer)
    const ls = state.layers[layer.id]
    if (btn.dataset.act === 'mute') ls.mute = !ls.mute
    if (btn.dataset.act === 'solo') state.solo = state.solo === layer.id ? null : layer.id
    if (btn.dataset.act === 'rnd') randomizeLayer(layer)
    syncCards(); refresh()
  })

  document.querySelector('[data-js-play]').addEventListener('click', play)
  document.querySelector('[data-js-stop]').addEventListener('click', stop)
  document.querySelector('[data-js-bpm]').addEventListener('input', (e) => { state.bpm = +e.target.value; syncCards(); refresh() })
  rootSel.addEventListener('input', (e) => { state.root = +e.target.value; refresh() })
  document.querySelector('[data-js-bars]').addEventListener('input', (e) => { state.bars = +e.target.value })
  document.querySelector('[data-js-rndall]').addEventListener('click', () => {
    LAYERS.forEach(randomizeLayer)
    state.layers.kick.mute = false
    state.layers.rumble.mute = false
    syncCards(); refresh()
  })
  document.querySelectorAll('[data-style]').forEach((b) =>
    b.addEventListener('click', () => { applyStyle(b.dataset.style); syncCards(); refresh() }))
  document.querySelector('[data-js-stems]').addEventListener('click', () => exportStems())
  document.querySelector('[data-js-recmix]').addEventListener('click', () => recordMix())
  document.querySelector('[data-js-copy]').addEventListener('click', () =>
    navigator.clipboard.writeText(document.querySelector('[data-js-fullcode]').textContent))

  applyStyle('berlin')
  syncCards()
  refresh()
  requestAnimationFrame(drawLoop)
}

init()

window.Studio = { state, exportStems, recordMix, play, stop, applyStyle, assemble: () => assemble(activeLayers()) }
