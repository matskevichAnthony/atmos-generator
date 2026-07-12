// Audio engine. Two realities unified behind one preview:
//  · source + RACK A  → live strudel stream (instant, hot-swappable)
//  · IMAGE + RACK B    → offline PCM surgery (can't be live)
// Trick: capture the clean source+RACK-A render ONCE and cache it; then
// IMAGE / RACK B / CURVE tweaks re-run as pure JS on that cache — instant,
// silent, no second flow. Only a source/RACK-A change forces a recapture.

import { initStrudel, evaluate, hush, getAudioContext, getAudioContextCurrentTime } from '/node_modules/@strudel/web/dist/index.mjs'
import { applyImage } from './image.js'
import { runPost } from './dsp.js'
import { applyDraw } from './drawmod.js'

initStrudel()

// the shared context can drift to 'suspended' between actions, which freezes
// the capture tap; keep it awake before anything that needs realtime audio
const resumeAudio = () => {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') ctx.resume()
}

const FADE_IN_SEC = 0.004
const FADE_OUT_SEC = 0.03
const ONSET_THRESHOLD = 0.03
const ONSET_WINDOW_SEC = 0.8
// corrupted preview renders the FULL length up to this cap, so what you hear
// on PLAY is exactly what REC writes; only lengths beyond the cap are truncated
// in preview (and the UI badges that). Bigger cap = truer preview, longer wait.
export const PREVIEW_CAP = 6
const SCOPE_LEN = 1024
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let everPlayed = false
let bufferSource = null
let previewCtx = null
let loopAnalyser = null
let cleanCache = null // { sig, L, R, sampleRate }
const loopScope = new Float32Array(SCOPE_LEN)

// ── live strudel stream (source + RACK A) ──────────────────
export const playLive = (code) => {
  stopLoop()
  resumeAudio()
  everPlayed = true
  evaluate(code)
}
// restart the live stream from cycle 0 (hush resets the transport clock),
// so every change gives a clear "it re-triggered" cue instead of drifting in
export const restartLive = (code) => {
  stopLoop()
  hush()
  resumeAudio()
  everPlayed = true
  evaluate(code)
}
export const stopAll = () => { stopLoop(); hush() }

// ── rendered-buffer loop (the corrupted result) ────────────
export const playLoop = (L, R, sampleRate) => {
  stopLoop()
  previewCtx = previewCtx || new AudioContext()
  if (previewCtx.state === 'suspended') previewCtx.resume()
  const buf = previewCtx.createBuffer(2, L.length, sampleRate)
  buf.getChannelData(0).set(L)
  buf.getChannelData(1).set(R)
  loopAnalyser = previewCtx.createAnalyser()
  loopAnalyser.fftSize = SCOPE_LEN
  bufferSource = previewCtx.createBufferSource()
  bufferSource.buffer = buf
  bufferSource.loop = true
  bufferSource.connect(loopAnalyser)
  loopAnalyser.connect(previewCtx.destination)
  bufferSource.start()
}

export const stopLoop = () => {
  // disconnect, don't just drop refs — orphaned nodes stayed wired to
  // destination and piled up over many loops, degrading audio over time
  if (bufferSource) {
    try { bufferSource.stop() } catch (e) { /* already stopped */ }
    try { bufferSource.disconnect() } catch (e) { /* not connected */ }
    bufferSource = null
  }
  if (loopAnalyser) {
    try { loopAnalyser.disconnect() } catch (e) { /* not connected */ }
    loopAnalyser = null
  }
}

export const isLooping = () => !!bufferSource

export const getScope = () => {
  if (loopAnalyser) { loopAnalyser.getFloatTimeDomainData(loopScope); return loopScope }
  return window.StrudelCapture?.getScope()
}

// ── clean realtime capture (source + RACK A only) ──────────
const applyFades = (arr, sampleRate) => {
  const inN = Math.round(FADE_IN_SEC * sampleRate)
  const outN = Math.round(FADE_OUT_SEC * sampleRate)
  for (let i = 0; i < inN && i < arr.length; i++) arr[i] *= i / inN
  for (let i = 0; i < outN && i < arr.length; i++) arr[arr.length - 1 - i] *= i / outN
}

// synth voices live in AudioWorklets that spin up on first playback;
// warm the engine up once so the very first capture isn't silent
const warmup = async (code) => {
  if (everPlayed) return
  evaluate(code)
  await sleep(900)
  hush()
  everPlayed = true
}

// serialize all captures: only one realtime capture may touch the shared
// strudel transport / recorder at a time (UI bounce, REC, etc. queue)
let captureChain = Promise.resolve()
const captureClean = (code, seconds) => {
  const task = captureChain.then(() => doCapture(code, seconds))
  captureChain = task.catch(() => {})
  return task
}

const doCapture = async (code, seconds) => {
  const cap = window.StrudelCapture
  resumeAudio()
  await warmup(code)
  hush()
  await sleep(350)
  cap.startRaw()
  const t0 = getAudioContextCurrentTime()
  evaluate(code)
  const target = t0 + seconds + ONSET_WINDOW_SEC + 0.2
  const deadline = Date.now() + (seconds + ONSET_WINDOW_SEC + 3) * 1000 * 1.5
  while (cap.getCapturedEnd() < target && Date.now() < deadline) await sleep(120)
  const raw = cap.stopRaw()
  hush()
  const probe = cap.slice(raw, t0, ONSET_WINDOW_SEC)
  let onset = 0.05
  for (let i = 0; i < probe.L.length; i++) {
    if (Math.abs(probe.L[i]) > ONSET_THRESHOLD) { onset = i / probe.sampleRate; break }
  }
  return cap.slice(raw, t0 + onset, seconds)
}

// ── pure-JS DSP layer (image + collapse + fades) on a COPY ──
const processBuffer = (clean, state) => {
  const L = Float32Array.from(clean.L)
  const R = Float32Array.from(clean.R)
  const sampleRate = clean.sampleRate
  applyImage(L, R, sampleRate, state.image, state.seed)
  runPost(L, R, sampleRate, state.seed, state.post, state.curve)
  applyDraw(L, R, sampleRate, state) // hand-drawn automation rides on top of the wreckage
  applyFades(L, sampleRate)
  applyFades(R, sampleRate)
  return { L, R, sampleRate }
}

const peakOf = (a) => { let p = 0; for (let i = 0; i < a.length; i += 7) { const v = Math.abs(a[i]); if (v > p) p = v } return p }

// one clean capture, cached by (code, seconds). Only a source/RACK-A change
// (new code) or a longer window forces a recapture; image/RACK-B/curve reuse it.
// A capture can come back silent if the context wasn't warm yet — retry so a
// bad capture never gets cached (that was the "signal vanishes" bug).
const getClean = async (code, seconds, onNeedCapture) => {
  const sig = `${code}#${seconds}`
  if (cleanCache && cleanCache.sig === sig) return cleanCache
  if (onNeedCapture) onNeedCapture()
  let clean
  for (let attempt = 0; attempt < 3; attempt++) {
    clean = await captureClean(code, seconds)
    if (peakOf(clean.L) > 0.005) break
    resumeAudio()
    await sleep(200)
  }
  cleanCache = { sig, ...clean }
  return cleanCache
}

export const clearCache = () => { cleanCache = null } // drop any stale render (used by RESET)

export const previewProcessed = async (state, onNeedCapture) => {
  const clean = await getClean(state.patch.code, Math.min(state.len, PREVIEW_CAP), onNeedCapture)
  return processBuffer(clean, state)
}

// file export at full length; reuses the preview's capture when len ≤ cap,
// so the saved WAV is bit-for-bit what the preview loop was playing
export const renderExact = async (state) => {
  const clean = await getClean(state.patch.code, state.len)
  return processBuffer(clean, state)
}

export const saveWav = (L, R, sampleRate, filename) => {
  const { blob, peak } = window.StrudelCapture.makeWav(L, R, sampleRate)
  window.StrudelCapture.saveBlob(blob, filename)
  return peak
}
