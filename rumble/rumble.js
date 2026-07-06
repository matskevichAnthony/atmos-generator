import { initStrudel, evaluate, hush } from '/node_modules/@strudel/web/dist/index.mjs'

initStrudel()

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1} (${m})`

const num = (v) => Number(v)
const r2 = (x) => Math.round(x * 100) / 100
const r3 = (x) => Math.round(x * 1000) / 1000
const indent = (s, pad) => pad + s.replace(/\n/g, '\n' + pad)

const PRESETS = {
  berlin:    { rtype: 'reverb', rnote: 26, rlen: 0.68, rspace: 0.6, rlpf: 220, rdist: 1.4, rgain: 0.85,
               kpitch: 33, kpunch: 22, kpdec: 0.13, kbody: 0.12, kdrive: 1.3, klpf: 3000, kclick: false, tempo: 138 },
  rotterdam: { rtype: 'delay', rnote: 30, rlen: 0.72, rspace: 0.5, rlpf: 520, rdist: 2.6, rgain: 0.8,
               kpitch: 31, kpunch: 18, kpdec: 0.1, kbody: 0.16, kdrive: 3, klpf: 5000, kclick: true, tempo: 165 },
  warehouse: { rtype: 'reverb', rnote: 24, rlen: 0.94, rspace: 0.88, rlpf: 180, rdist: 1.2, rgain: 0.9,
               kpitch: 33, kpunch: 26, kpdec: 0.16, kbody: 0.14, kdrive: 1.1, klpf: 2600, kclick: false, tempo: 132 },
  darksub:   { rtype: 'sub', rnote: 26, rlen: 0.4, rspace: 0.1, rlpf: 150, rdist: 1.5, rgain: 0.9,
               kpitch: 33, kpunch: 27, kpdec: 0.12, kbody: 0.13, kdrive: 1.4, klpf: 3200, kclick: false, tempo: 140 },
}

const TYPE_TAIL = {
  reverb: (p, len, space) =>
    `.decay(0.14).sustain(0)\n    .room(${r2(space * 3)}).roomsize(${r2(1 + len * 9)}).roomlp(${p.rlpf})`,
  decay: (p, len) =>
    `.attack(0).decay(${r2(0.12 + len * 1.4)}).sustain(0).release(${r2(0.1 + len * 0.7)})`,
  delay: (p, len, space) =>
    `.decay(0.12).sustain(0)\n    .delay(${r2(0.2 + space * 0.8)}).delaytime(0.09).delayfeedback(${r2(len * 0.9)})`,
  sub: () =>
    `.attack(0.01).decay(0.1).sustain(0.7).release(0.06)`,
}

const buildKick = (p) => {
  let s = `note("${p.kpitch}*4").s("sine")`
    + `\n    .penv(${p.kpunch}).pdec(${p.kpdec}).pcurve(1)`
    + `\n    .attack(0.001).decay(${p.kbody}).sustain(0)`
  if (num(p.kdrive) > 0) s += `\n    .distort(${p.kdrive})`
  return s + `\n    .lpf(${p.klpf}).gain(1)`
}

const buildRumble = (p) => {
  const tail = TYPE_TAIL[p.rtype](p, num(p.rlen), num(p.rspace))
  let s = `note("${p.rnote}*4").s("sine")\n    ${tail}`
  if (num(p.rdist) > 0) s += `\n    .distort(${p.rdist})`
  return s + `\n    .lpf(${p.rlpf}).gain(${p.rgain})`
}

const buildCode = (p) => {
  const layers = [
    `// KICK — транзиент\n${buildKick(p)}`,
    `// RUMBLE — ${p.rtype}\n${buildRumble(p)}`,
  ]
  if (p.kclick) layers.push(`// CLICK\ns("white*4").decay(0.006).sustain(0).hpf(1600).gain(0.4)`)
  const body = layers.map((l) => indent(l, '  ')).join(',\n')
  return `setcpm(${p.tempo}/4)\nstack(\n${body}\n)`
}

const readParams = (root) => {
  const p = {}
  root.querySelectorAll('[data-param]').forEach((el) => {
    p[el.dataset.param] = el.type === 'checkbox' ? el.checked : el.value
  })
  return p
}

const applyPreset = (root, preset) => {
  root.querySelectorAll('[data-param]').forEach((el) => {
    const key = el.dataset.param
    if (!(key in preset)) return
    if (el.type === 'checkbox') el.checked = preset[key]
    else el.value = preset[key]
  })
}

const randomizeKnobs = (root) => {
  root.querySelectorAll('input[type="range"]').forEach((el) => {
    const min = +el.min, max = +el.max, step = +el.step || 1
    const steps = Math.floor((max - min) / step)
    el.value = min + step * Math.floor(Math.random() * (steps + 1))
  })
}

const setType = (root, type) => {
  root.querySelector('[data-param="rtype"]').value = type
  root.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('is-active', b.dataset.type === type))
  root.querySelectorAll('.ctl[data-for]').forEach((c) => c.classList.toggle('is-dim', !c.dataset.for.split(' ').includes(type)))
}

const updateReadouts = (root, p) => {
  root.querySelectorAll('[data-out]').forEach((out) => {
    const key = out.dataset.out
    out.textContent = key === 'kpitch' || key === 'rnote' ? noteName(+p[key]) : p[key]
  })
}

const initRumble = (root) => {
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
  root.querySelectorAll('[data-type]').forEach((b) =>
    b.addEventListener('click', () => { setType(root, b.dataset.type); render() }))
  root.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => { applyPreset(root, PRESETS[b.dataset.preset]); setType(root, PRESETS[b.dataset.preset].rtype); render() }))

  if (window.StrudelCapture) {
    window.StrudelCapture.attach(root.querySelector('[data-js-rec]'), {
      name: 'rumble-kick',
      ensurePlaying: () => { if (!playing) start() },
      timeEl: root.querySelector('[data-js-rectime]'),
    })
  }

  setType(root, 'reverb')
  render()
}

document.querySelectorAll('[data-js-rumble]').forEach(initRumble)
