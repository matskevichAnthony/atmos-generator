import { initStrudel, evaluate, hush } from '/node_modules/@strudel/web/dist/index.mjs'

initStrudel()

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const PRESETS = {
  techno: { pitch: 33, penv: 24, pdec: 0.18, pcurve: 1, attack: 0.001, decay: 0.16, release: 0.08,
            wave: 'sine', distort: 1.2, crush: 16, coarse: 1, click: false, hpf: 25, lpf: 4000, gain: 1, tempo: 150 },
  gabber: { pitch: 31, penv: 20, pdec: 0.12, pcurve: 1, attack: 0.001, decay: 0.3, release: 0.16,
            wave: 'sine', distort: 3.4, crush: 16, coarse: 1, click: true, hpf: 45, lpf: 9000, gain: 1.1, tempo: 170 },
  rumble: { pitch: 28, penv: 30, pdec: 0.4, pcurve: 1, attack: 0.001, decay: 0.5, release: 0.6,
            wave: 'sine', distort: 1.6, crush: 16, coarse: 1, click: false, hpf: 20, lpf: 120, gain: 0.95, tempo: 145 },
}

const noteName = (midi) => NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)

const readParams = (root) => {
  const params = {}
  root.querySelectorAll('[data-param]').forEach((el) => {
    params[el.dataset.param] = el.type === 'checkbox' ? el.checked : el.value
  })
  return params
}

const buildKick = (p) => {
  let kick = `note("${p.pitch}*4").s("${p.wave}")`
    + `\n  .penv(${p.penv}).pdec(${p.pdec}).pcurve(${p.pcurve})`
    + `\n  .attack(${p.attack}).decay(${p.decay}).sustain(0).release(${p.release})`

  const fx = []
  if (+p.distort > 0) fx.push(`distort(${p.distort})`)
  if (+p.crush < 16) fx.push(`crush(${p.crush})`)
  if (+p.coarse > 1) fx.push(`coarse(${p.coarse})`)
  if (fx.length) kick += `\n  .${fx.join('.')}`

  const filt = []
  if (+p.hpf > 20) filt.push(`hpf(${p.hpf})`)
  if (+p.lpf < 18000) filt.push(`lpf(${p.lpf})`)
  if (filt.length) kick += `\n  .${filt.join('.')}`

  kick += `\n  .gain(${p.gain})`
  return kick
}

const buildCode = (p) => {
  const head = `setcpm(${p.tempo}/4)`
  const kick = buildKick(p)
  if (!p.click) return `${head}\n${kick}`
  const click = `s("white*4").decay(0.008).sustain(0).hpf(1400).gain(0.5)`
  return `${head}\nstack(\n  ${kick.replace(/\n/g, '\n  ')},\n  ${click}\n)`
}

const applyPreset = (root, preset) => {
  root.querySelectorAll('[data-param]').forEach((el) => {
    const key = el.dataset.param
    if (!(key in preset)) return
    if (el.type === 'checkbox') el.checked = preset[key]
    else el.value = preset[key]
  })
}

const randomize = (root) => {
  root.querySelectorAll('input[type="range"]').forEach((el) => {
    const min = +el.min, max = +el.max, step = +el.step || 1
    const steps = Math.floor((max - min) / step)
    el.value = min + step * Math.floor(Math.random() * (steps + 1))
  })
}

const updateReadouts = (root, p) => {
  root.querySelectorAll('[data-out]').forEach((out) => {
    const key = out.dataset.out
    out.textContent = key === 'pitch' ? `${noteName(+p.pitch)} (${p.pitch})` : p[key]
  })
}

const initKick = (root) => {
  const codeEl = root.querySelector('[data-js-code]')
  const playBtn = root.querySelector('[data-js-play]')
  let playing = false

  const render = () => {
    const p = readParams(root)
    const code = buildCode(p)
    updateReadouts(root, p)
    codeEl.textContent = code
    if (playing) evaluate(code)
  }

  const start = () => {
    playing = true
    playBtn.classList.add('is-on')
    evaluate(buildCode(readParams(root)))
  }
  const stop = () => {
    playing = false
    playBtn.classList.remove('is-on')
    hush()
  }

  root.addEventListener('input', (e) => { if (e.target.matches('[data-param]')) render() })
  playBtn.addEventListener('click', start)
  root.querySelector('[data-js-stop]').addEventListener('click', stop)
  root.querySelector('[data-js-random]').addEventListener('click', () => { randomize(root); render() })
  root.querySelector('[data-js-copy]').addEventListener('click', () => navigator.clipboard.writeText(codeEl.textContent))
  root.querySelectorAll('[data-js-preset]').forEach((btn) =>
    btn.addEventListener('click', () => { applyPreset(root, PRESETS[btn.dataset.jsPreset]); render() }))

  if (window.StrudelCapture) {
    window.StrudelCapture.attach(root.querySelector('[data-js-rec]'), {
      name: 'kick',
      ensurePlaying: () => { if (!playing) start() },
      timeEl: root.querySelector('[data-js-rectime]'),
    })
  }

  render()
}

document.querySelectorAll('[data-js-kick]').forEach(initKick)
