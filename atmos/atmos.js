import { initStrudel, evaluate, hush } from '/node_modules/@strudel/web/dist/index.mjs'

initStrudel()

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1} (${m})`

const num = (v) => Number(v)

const CHORDS = {
  drone: [0],
  fifth: [0, 7],
  minor: [0, 3, 7],
  minor7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  dim: [0, 3, 6],
}

const PRESETS = {
  deepspace: { root: 38, chord: 'minor7', wave: 'supersaw', det: 0.15, fcenter: 620, fdepth: 420, fspeed: 16, res: 8,
               vibdep: 0.08, vibrate: 0.25, phz: 0.4, phzrate: 0.1, panspeed: 12, room: 2, rsize: 8, dly: 0.6, dtime: 0.42, dfb: 0.6,
               att: 3, rel: 7, tempo: 50, gain: 0.7 },
  cathedral: { root: 36, chord: 'fifth', wave: 'sawtooth', det: 0.08, fcenter: 900, fdepth: 300, fspeed: 12, res: 4,
               vibdep: 0, vibrate: 0.2, phz: 0, phzrate: 0.1, panspeed: 16, room: 3.2, rsize: 12, dly: 0.3, dtime: 0.5, dfb: 0.5,
               att: 4, rel: 9, tempo: 44, gain: 0.7 },
  acidfog:   { root: 40, chord: 'minor', wave: 'sawtooth', det: 0.1, fcenter: 500, fdepth: 900, fspeed: 6, res: 18,
               vibdep: 0.12, vibrate: 0.4, phz: 0.6, phzrate: 0.2, panspeed: 8, room: 1.6, rsize: 7, dly: 0.7, dtime: 0.33, dfb: 0.7,
               att: 1.5, rel: 5, tempo: 70, gain: 0.68 },
  voiddrone: { root: 33, chord: 'drone', wave: 'supersaw', det: 0.25, fcenter: 300, fdepth: 160, fspeed: 24, res: 6,
               vibdep: 0.2, vibrate: 0.12, phz: 0.3, phzrate: 0.06, panspeed: 20, room: 3, rsize: 13, dly: 0.4, dtime: 0.6, dfb: 0.6,
               att: 5, rel: 10, tempo: 38, gain: 0.72 },
  shimmer:   { root: 45, chord: 'sus2', wave: 'triangle', det: 0.2, fcenter: 2000, fdepth: 1400, fspeed: 8, res: 5,
               vibdep: 0.06, vibrate: 0.5, phz: 0.5, phzrate: 0.3, panspeed: 10, room: 2.6, rsize: 9, dly: 0.8, dtime: 0.28, dfb: 0.75,
               att: 2.5, rel: 7, tempo: 60, gain: 0.66 },
}

const chordNotes = (root, chord) => CHORDS[chord].map((i) => root + i).join(',')

const buildCode = (p) => {
  let s = `note("${chordNotes(+p.root, p.chord)}").s("${p.wave}")`
  if (num(p.det) > 0) s += `\n  .add(note("0,${p.det},-${p.det}"))`
  s += `\n  .attack(${p.att}).release(${p.rel}).sustain(1)`

  if (num(p.fdepth) > 0) {
    const lo = Math.max(40, Math.round(+p.fcenter - +p.fdepth))
    const hi = Math.round(+p.fcenter + +p.fdepth)
    s += `\n  .lpf(sine.range(${lo},${hi}).slow(${p.fspeed}))`
  } else {
    s += `\n  .lpf(${p.fcenter})`
  }
  if (num(p.res) > 0) s += `.resonance(${p.res})`

  if (num(p.vibdep) > 0) s += `\n  .vib(${p.vibrate}).vibmod(${p.vibdep})`
  if (num(p.phz) > 0) s += `\n  .phaser(${p.phz}).phaserrate(${p.phzrate})`
  s += `\n  .pan(sine.range(0.1,0.9).slow(${p.panspeed}))`
  s += `\n  .room(${p.room}).roomsize(${p.rsize})`
  if (num(p.dly) > 0) s += `\n  .delay(${p.dly}).delaytime(${p.dtime}).delayfeedback(${p.dfb})`
  s += `\n  .gain(${p.gain})`

  return `setcpm(${p.tempo}/4)\n${s}`
}

const readParams = (root) => {
  const p = {}
  root.querySelectorAll('[data-param]').forEach((el) => { p[el.dataset.param] = el.value })
  return p
}

const applyPreset = (root, preset) => {
  root.querySelectorAll('[data-param]').forEach((el) => {
    if (el.dataset.param in preset) el.value = preset[el.dataset.param]
  })
}

const randomizeKnobs = (root) => {
  root.querySelectorAll('input[type="range"]').forEach((el) => {
    const min = +el.min, max = +el.max, step = +el.step || 1
    const steps = Math.floor((max - min) / step)
    el.value = min + step * Math.floor(Math.random() * (steps + 1))
  })
}

const updateReadouts = (root, p) => {
  root.querySelectorAll('[data-out]').forEach((out) => {
    const key = out.dataset.out
    out.textContent = key === 'root' ? noteName(+p.root) : p[key]
  })
}

const initAtmos = (root) => {
  const codeEl = root.querySelector('[data-js-code]')
  const playBtn = root.querySelector('[data-js-play]')
  const led = root.querySelector('[data-js-led]')
  let playing = false

  const render = () => {
    const p = readParams(root)
    updateReadouts(root, p)
    codeEl.textContent = buildCode(p)
    if (playing) evaluate(codeEl.textContent)
  }

  const start = () => {
    playing = true
    playBtn.classList.add('is-on')
    led.classList.add('is-on')
    evaluate(buildCode(readParams(root)))
  }
  const stop = () => {
    playing = false
    playBtn.classList.remove('is-on')
    led.classList.remove('is-on')
    hush()
  }

  root.addEventListener('input', (e) => { if (e.target.matches('[data-param]')) render() })
  playBtn.addEventListener('click', start)
  root.querySelector('[data-js-stop]').addEventListener('click', stop)
  root.querySelector('[data-js-random]').addEventListener('click', () => { randomizeKnobs(root); render() })
  root.querySelector('[data-js-copy]').addEventListener('click', () => navigator.clipboard.writeText(codeEl.textContent))
  root.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => { applyPreset(root, PRESETS[b.dataset.preset]); render() }))

  if (window.StrudelCapture) {
    window.StrudelCapture.attach(root.querySelector('[data-js-rec]'), {
      name: 'atmos',
      ensurePlaying: () => { if (!playing) start() },
      timeEl: root.querySelector('[data-js-rectime]'),
    })
  }

  render()
}

document.querySelectorAll('[data-js-atmos]').forEach(initAtmos)
