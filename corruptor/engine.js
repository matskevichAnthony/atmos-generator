// Audio engine. Two realities unified behind one preview:
//  · source + RACK A  → live strudel stream (instant, hot-swappable)
//  · IMAGE + RACK B    → offline PCM surgery (can't be live)
// Trick: capture the clean source+RACK-A render ONCE and cache it; then
// IMAGE / RACK B / CURVE tweaks re-run as pure JS on that cache — instant,
// silent, no second flow. Only a source/RACK-A change forces a recapture.

import { initStrudel, evaluate, hush, samples, getAudioContext, getAudioContextCurrentTime } from '/node_modules/@strudel/web/dist/index.mjs'
import { applyImage } from './image.js'
import { runPost } from './dsp.js'

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
const PREVIEW_MAX_SEC = 3
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
export const evaluateLive = evaluate
export const stopAll = () => { stopLoop(); hush() }
export const loadSampleBank = (url) => samples(url)

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
  if (bufferSource) { try { bufferSource.stop() } catch (e) { /* already stopped */ } bufferSource = null }
  loopAnalyser = null
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
  applyFades(L, sampleRate)
  applyFades(R, sampleRate)
  return { L, R, sampleRate }
}

// preview: reuse the clean capture whenever only image/rackB/curve changed
export const previewProcessed = async (state, onNeedCapture) => {
  const seconds = Math.min(state.len, PREVIEW_MAX_SEC)
  const sig = `${state.patch.code}#${seconds}`
  if (!cleanCache || cleanCache.sig !== sig) {
    if (onNeedCapture) onNeedCapture()
    const clean = await captureClean(state.patch.code, seconds)
    cleanCache = { sig, ...clean }
  }
  return processBuffer(cleanCache, state)
}

// full-length render for file export (always a fresh full capture)
export const renderExact = async (state) => {
  const clean = await captureClean(state.patch.code, state.len)
  return processBuffer(clean, state)
}

export const saveWav = (L, R, sampleRate, filename) => {
  const { blob, peak } = window.StrudelCapture.makeWav(L, R, sampleRate)
  window.StrudelCapture.saveBlob(blob, filename)
  return peak
}
