// RACK A: live corruption modules chained onto the source pattern.
// Each module = one audible idea, one AMOUNT knob, its own dice (nonce);
// exact values surface via `note` so cause → effect stays visible.

import { r2, lerp, seededRng, toolkit } from './rng.js'
import { genSource } from './source.js'

export const MODULES = [
  {
    id: 'chew', name: 'CHEW', desc: 'жуёт биты', stage: 1,
    gen: (t, a) => {
      const bits = r2(lerp(6, 1.6, a)), down = Math.round(lerp(2, 28, a))
      return { frag: `.crush(${bits}).coarse(${down})`, note: `${bits}bit ÷${down}` }
    },
  },
  {
    id: 'rust', name: 'RUST', desc: 'ржавый перегруз', stage: 1,
    gen: (t, a) => {
      const d = r2(lerp(0.6, 3.2, a)), s = r2(lerp(0.15, 0.7, a))
      return { frag: `.distort(${d}).shape(${s})`, note: `dist ${d}` }
    },
  },
  {
    id: 'starve', name: 'STARVE', desc: 'душит фильтром', stage: 2,
    gen: (t, a) => {
      const hz = Math.round(lerp(2400, 160, a)), q = Math.round(lerp(4, 24, a))
      return { frag: `.lpf(${hz}).resonance(${q})`, note: `${hz}Hz Q${q}` }
    },
  },
  {
    id: 'mouth', name: 'MOUTH', desc: 'гласные форманты', stage: 2,
    gen: (t, a) => {
      const vowels = t.shuffle(['a', 'e', 'i', 'o', 'u']).slice(0, 2 + Math.round(a * 3))
      const rate = Math.max(1, Math.round(a * 8))
      return { frag: `.vowel("<${vowels.join(' ')}>*${rate}")`, note: `${vowels.join('')} ×${rate}` }
    },
  },
  {
    id: 'seasick', name: 'SEASICK', desc: 'укачивает питч', stage: 3,
    gen: (t, a) => {
      const hz = r2(lerp(0.2, 6.5, a)), depth = r2(lerp(0.15, 1.8, a))
      return { frag: `.vib(${hz}).vibmod(${depth})`, note: `${hz}Hz ±${depth}` }
    },
  },
  {
    id: 'ghost', name: 'GHOST', desc: 'фазовый призрак', stage: 3,
    gen: (t, a) => {
      const rate = r2(t.rf(0.05, 0.3) * lerp(1, 10, a))
      return { frag: `.phaser(${r2(lerp(0.35, 1, a))}).phaserrate(${rate})`, note: `rate ${rate}` }
    },
  },
  {
    id: 'dive', name: 'DIVE', desc: 'пикирует вниз', stage: 3,
    gen: (t, a, ctx) => {
      if (!ctx.pitched) {
        const from = Math.round(lerp(3000, 9000, a))
        return { frag: `.lpf(isaw.range(120,${from}).slow(1))`, note: `${from}→120Hz` }
      }
      const sign = t.chance(0.7) ? 1 : -1
      const depth = sign * Math.round(lerp(10, 50, a)), dur = r2(lerp(0.15, 0.6, a))
      return { frag: `.penv(${depth}).pdec(${dur}).pcurve(1)`, note: `${depth > 0 ? '+' : ''}${depth}st` }
    },
  },
  {
    id: 'stutter', name: 'STUTTER', desc: 'заикание · дробь', stage: 0,
    gen: (t, a) => {
      const n = 2 + Math.round(a * 6)
      return a < 0.5
        ? { frag: `.sometimes(ply(${n}))`, note: `~ply ${n}` }
        : { frag: `.ply(${n})`, note: `ply ${n}` }
    },
  },
  {
    id: 'scramble', name: 'SCRAMBLE', desc: 'перемешивает такт', stage: 0,
    gen: (t, a) => {
      const n = t.ri(2, 3 + Math.round(a * 13))
      return { frag: `.iter(${n})`, note: `iter ${n}` }
    },
  },
  {
    id: 'dropout', name: 'DROPOUT', desc: 'теряет данные', stage: 0,
    gen: (t, a) => {
      const p = r2(lerp(0.15, 0.8, a))
      let frag = `.degradeBy(${p})`, note = `−${Math.round(p * 100)}%`
      if (a > 0.6) {
        const bits = Array.from({ length: 8 }, () => (t.chance(0.6) ? 1 : 0)).join(' ')
        frag += `.mask("${bits}")`
        note += ' +mask'
      }
      return { frag, note }
    },
  },
  {
    id: 'backmask', name: 'BACKMASK', desc: 'задом наперёд', stage: 0,
    gen: (t, a) => (a < 0.5
      ? { frag: `.jux(rev)`, note: 'stereo rev' }
      : { frag: `.rev().jux(rev)`, note: 'full rev' }),
  },
  {
    id: 'howl', name: 'HOWL', desc: 'воет фидбэком', stage: 4,
    gen: (t, a) => {
      const comb = t.chance(0.5)
      const time = r2(comb ? t.rf(0.02, 0.06) : t.rf(0.1, 0.4))
      const fb = r2(lerp(0.5, 0.96, a))
      return {
        frag: `.delay(${r2(lerp(0.35, 0.95, a))}).delaytime(${time}).delayfeedback(${fb})`,
        note: `${Math.round(time * 1000)}ms fb.${Math.round(fb * 100)}`,
      }
    },
  },
  {
    id: 'drown', name: 'DROWN', desc: 'топит в реверб', stage: 4,
    gen: (t, a) => {
      const size = r2(lerp(3, 14, a))
      return { frag: `.room(${r2(lerp(0.7, 3.8, a))}).roomsize(${size}).roomlp(${Math.round(lerp(6000, 900, a))})`, note: `size ${size}` }
    },
  },
  {
    id: 'panic', name: 'PANIC', desc: 'мечется в стерео', stage: 4,
    gen: (t, a) => {
      const rate = Math.max(1, Math.round(lerp(2, 24, a)))
      return { frag: `.pan(rand.range(0,1).fast(${rate}))`, note: `×${rate}/цикл` }
    },
  },
  {
    id: 'warp', name: 'WARP', desc: 'гнёт скорость', stage: 0, sampleOnly: true,
    gen: (t, a) => {
      const pat = a < 0.4 ? t.pick(['.5', '2', '1 2']) : t.pick(['1 -1', '<1 2 .5 -1>', '<-1 .5>*2', '<.25 4 -2>'])
      let frag = `.speed("${pat}")`, note = pat
      if (a > 0.5) { frag += `.chop(${t.ri(8, 48)})`; note += ' +chop' }
      return { frag, note }
    },
  },
]

// ── assembly: source + enabled modules → strudel code ──────
export const buildPatch = (seedHex, opts, modState) => {
  // a sample-only module (WARP) is usable whenever a bank is loaded; force the
  // source to a sample so it actually has something to work on
  const bankLoaded = opts.banks.length > 0
  const forceSample = bankLoaded && MODULES.some((m) => m.sampleOnly && modState[m.id]?.on)
  const source = genSource(seedHex, { ...opts, forceSample })
  const cpm = r2((60 * source.cycles) / opts.len)
  const ctx = { pitched: source.pitched, isSample: source.isSample, len: opts.len }

  const notes = {}
  let chain = ''
  const active = MODULES
    .filter((m) => modState[m.id]?.on && (!m.sampleOnly || bankLoaded))
    .sort((a, b) => a.stage - b.stage)

  for (const m of active) {
    const st = modState[m.id]
    const t = toolkit(seededRng(`${seedHex}:${m.id}:${st.nonce}`))
    const { frag, note } = m.gen(t, st.amt / 100, ctx)
    notes[m.id] = note
    chain += `\n  ${frag} // ${m.name}`
  }

  const code = `setcpm(${cpm})\n${source.code} // SOURCE${chain}\n  .gain(.8)`
  return { code, notes, pitched: source.pitched, isSample: source.isSample, source: source.meta }
}
