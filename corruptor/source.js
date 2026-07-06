// SOURCE generation: what plays before any corruption.
// Returns strudel code + readable meta (voice, note names, hit grid)
// so the UI can show exactly what was rolled.

import { r2, mulberry32, seededRng, toolkit } from './rng.js'

export const ZONES = {
  any: [24, 92],
  low: [20, 42],
  mid: [40, 66],
  high: [62, 92],
}

const DARK_INTERVALS = [1, 3, 6, 7, 10, 11, 13]
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const midiName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1)

const genNotes = (t, zone, count, distinct) => {
  const [lo, hi] = ZONES[zone]
  const root = t.ri(lo, hi - 14)
  if (distinct) return [root, ...t.shuffle(DARK_INTERVALS).slice(0, count - 1).map((i) => root + i)]
  return Array.from({ length: count }, (_, i) =>
    i === 0 || t.chance(0.4) ? root : root + t.pick(DARK_INTERVALS))
}

// evenly distributes k hits over n grid slots (bresenham euclid)
const euclidGrid = (k, n) =>
  Array.from({ length: n }, (_, i) => Math.floor(((i + 1) * k) / n) - Math.floor((i * k) / n) > 0)

export const genSource = (seedHex, opts) => {
  const t = toolkit(mulberry32(parseInt(seedHex, 16) | 0))
  // pitches draw from their own stream: bumping noteNonce rerolls ONLY the notes,
  // leaving rhythm shell / voice / envelope untouched
  const tn = toolkit(seededRng(`${seedHex}:notes:${opts.noteNonce ?? 0}`))
  const { shape, zone, len, banks } = opts
  const wantNotes = opts.notes !== 'auto' ? +opts.notes : null

  // explicit note count guarantees a pitched source
  const pool = wantNotes
    ? ['osc', 'osc', 'fm']
    : ['osc', 'osc', 'fm', 'noise', ...(banks.length ? ['sample', 'sample'] : [])]
  const kind = t.pick(pool)
  const pitched = kind === 'osc' || kind === 'fm'
  const isSample = kind === 'sample'

  let ev = null
  if (kind === 'noise') ev = t.pick(['white', 'pink', 'brown'])
  if (isSample) ev = `${t.pick(banks)}:${t.ri(0, 15)}`

  let cycles = 1
  let code, env, midis = [], grid, hits, sequence = null

  if (shape === 'shot') {
    const count = wantNotes ?? (t.chance(0.3) ? t.ri(2, 4) : 1)
    if (pitched) midis = genNotes(tn, zone, count, wantNotes !== null)
    const pat = pitched ? (count === 1 ? `${midis[0]}` : `[${midis.join(' ')}]`) : ev
    code = pitched ? `note("${pat}")` : `s("${pat}")`
    env = `.attack(${r2(t.rf(0, 0.03))}).decay(${r2(t.rf(0.15, len * 0.8))})`
      + `.sustain(${r2(t.rf(0, 0.25))}).release(${r2(t.rf(0.05, len * 0.4))})`
    hits = pitched ? count : 1
    grid = euclidGrid(hits, 16)
  } else if (shape === 'drone') {
    const count = wantNotes ?? t.ri(2, 4)
    if (pitched) midis = genNotes(tn, zone, count, wantNotes !== null)
    const pat = pitched ? midis.join(',') : ev
    code = pitched ? `note("${pat}")` : `s("${pat}")`
    env = `.attack(${r2(t.rf(0.3, len * 0.3))}).sustain(1).release(${r2(t.rf(0.8, len * 0.4))})`
    hits = 1
    grid = Array(16).fill(true)
  } else { // loop
    cycles = Math.max(1, Math.round(len / t.rf(1, 2)))
    const shell = t.pick([
      () => { const n = t.ri(4, 16); return { wrap: (e) => `${e}*${n}`, hits: n, grid: euclidGrid(Math.min(n, 16), 16) } },
      () => {
        const k = t.ri(3, 7), n = t.pick([8, 16])
        return { wrap: (e) => `${e}(${k},${n})`, hits: k, grid: euclidGrid(k, 16) }
      },
      () => {
        const n = t.ri(1, 4), base = [1, 0, 1, 1]
        const grid = Array.from({ length: 16 }, (_, i) => !!base[Math.floor((i / 16) * 4 * n) % 4])
        return { wrap: (e) => `[${e} ~ ${e} ${e}]*${n}`, hits: 3 * n, grid }
      },
    ])()
    const count = wantNotes ?? t.ri(2, 5)
    let inner
    if (!pitched) {
      inner = ev
    } else {
      midis = genNotes(tn, zone, count, wantNotes !== null)
      if (count === 1) {
        inner = `${midis[0]}`
      } else {
        // a melodic sequence drawn from the pitch pool: the note dice (tn)
        // rerolls this order + pitches, while the rhythm shell stays put
        const steps = tn.ri(Math.max(2, count), 8)
        const seq = Array.from({ length: steps }, () => (tn.chance(0.12) ? '~' : `${tn.pick(midis)}`))
        sequence = seq.map((x) => (x === '~' ? '·' : midiName(+x)))
        inner = `<${seq.join(' ')}>`
      }
    }
    code = pitched ? `note("${shell.wrap(inner)}")` : `s("${shell.wrap(inner)}")`
    env = `.decay(${r2(t.rf(0.03, 0.25))}).sustain(0)`
    hits = shell.hits
    grid = shell.grid
  }

  let voice = kind
  if (pitched) {
    const useFm = kind === 'fm' || t.chance(0.33)
    const osc = t.pick(['sine', 'triangle', 'sawtooth', 'square', 'supersaw'])
    if (useFm) {
      code += `.s("sine").fm(${r2(t.rf(2, 30))}).fmh(${r2(t.rf(0.3, 8))})`
      voice = 'fm'
    } else {
      code += `.s("${osc}")`
      voice = osc
    }
    if (t.chance(0.25)) code += `.add(note("0,${r2(t.rf(0.05, 0.4))}"))`
  } else {
    voice = isSample ? ev : ev.toUpperCase() + ' NOISE'
  }

  const meta = {
    voice: voice.toUpperCase(),
    names: [...new Set(midis)].map(midiName),
    sequence,
    hits,
    grid,
    sustained: shape === 'drone',
  }
  return { code: code + env, pitched, isSample, cycles, meta }
}
