// Per-module dot-matrix animations. Each archetype paints a 22x6 cell grid and
// visually evokes what the module does to the sound. Pure: (g, ph, amt) → draws
// via g.cell(col, row, color). Deterministic from phase, no Math.random.

const WHITE = 'rgba(255,255,255,.5)'
const DIM = 'rgba(255,255,255,.24)'
const RED = 'rgba(255,0,0,.85)'

const frac = (x) => x - Math.floor(x)
const noise = (a, b, s) => frac(Math.sin(a * 12.9898 + b * 78.233 + s) * 43758.5453)
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x)

export const ARCHETYPES = {
  // CHEW — quantized descending blocks (bit reduction)
  crush: (g, ph, amt) => {
    const step = 1 + Math.floor((1 - amt) * 3)
    for (let c = 0; c < g.C; c++) {
      let h = Math.round((Math.sin(c * 0.6 + ph) * 0.5 + 0.5) * g.R)
      h = Math.max(0, Math.floor(h / step) * step)
      for (let r = g.R - 1; r >= g.R - h; r--) g.cell(c, r, r === g.R - h ? RED : WHITE)
    }
  },
  // RUST — clipping waveform, flat saturated tops
  clip: (g, ph, amt) => {
    const lim = 0.45 + (1 - amt) * 0.5
    for (let c = 0; c < g.C; c++) {
      let v = Math.sin(c * 0.5 + ph * 1.4)
      const clipped = Math.abs(v) >= lim
      v = clamp(v, -lim, lim) / lim
      g.cell(c, Math.round((1 - (v * 0.5 + 0.5)) * (g.R - 1)), clipped ? RED : WHITE)
    }
  },
  // STARVE — bars sinking from the top (filter closing down)
  sink: (g, ph, amt) => {
    const top = Math.floor((1 - amt) * (g.R - 1) + Math.sin(ph * 0.6) * 0.5)
    for (let c = 0; c < g.C; c++) if ((c + Math.floor(ph)) % 2 === 0)
      for (let r = g.R - 1; r >= top; r--) g.cell(c, r, r === top ? RED : DIM)
  },
  // MOUTH — three formant blobs drifting horizontally
  formant: (g, ph) => {
    for (let k = 0; k < 3; k++) {
      const cc = Math.round((Math.sin(ph * 0.4 + k * 2.1) * 0.5 + 0.5) * (g.C - 1))
      const rr = 1 + ((k * 2) % g.R)
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++)
        g.cell(cc + dc, rr + dr, k === 1 ? RED : WHITE)
    }
  },
  // SEASICK — a line wobbling up and down (vibrato)
  wobble: (g, ph) => {
    for (let c = 0; c < g.C; c++) {
      const r = Math.round((Math.sin(c * 0.4 + ph * 1.6) * 0.42 + 0.5) * (g.R - 1))
      g.cell(c, r, (c + Math.floor(ph)) % 6 === 0 ? RED : WHITE)
    }
  },
  // GHOST — a dark notch sweeping across a lit field (phaser)
  sweep: (g, ph) => {
    const notch = (Math.sin(ph * 0.5) * 0.5 + 0.5) * g.C
    for (let c = 0; c < g.C; c++) for (let r = 0; r < g.R; r++) {
      if (Math.abs(c - notch) < 1.5) continue
      if ((c + r) % 2 === 0) g.cell(c, r, Math.abs(c - notch - 2) < 1 ? RED : DIM)
    }
  },
  // DIVE — dots falling top to bottom with a trail (pitch drop)
  fall: (g, ph) => {
    const period = g.R + 2
    for (let c = 0; c < g.C; c++) {
      if (c % 3 !== Math.floor(ph) % 3) continue
      const pos = (ph * 3 + c) % period
      for (let t = 0; t < 3; t++) { const r = Math.floor(pos) - t; if (r >= 0 && r < g.R) g.cell(c, r, t === 0 ? RED : DIM) }
    }
  },
  // STUTTER — a segment repeated N times, blinking (ply)
  stutter: (g, ph, amt) => {
    const n = 2 + Math.floor(amt * 5)
    const seg = Math.floor(g.C / n)
    for (let i = 0; i < n; i++) {
      if ((i + Math.floor(ph)) % 2 !== 0) continue
      for (let c = 0; c < seg - 1; c++) for (let r = 1; r < g.R - 1; r++) g.cell(i * seg + c, r, c === 0 ? RED : WHITE)
    }
  },
  // SCRAMBLE — columns cyclically shifted (iter)
  shift: (g, ph) => {
    const off = Math.floor(ph) % g.C
    for (let c = 0; c < g.C; c++) {
      const src = (c + off) % g.C
      const h = Math.round((Math.sin(src * 0.7) * 0.5 + 0.5) * g.R)
      for (let r = g.R - 1; r >= g.R - h; r--) g.cell(c, r, c === off ? RED : WHITE)
    }
  },
  // DROPOUT — full field with random holes punched out (degrade)
  holes: (g, ph, amt) => {
    const s = Math.floor(ph * 2)
    for (let c = 0; c < g.C; c++) for (let r = 0; r < g.R; r++)
      if (noise(c, r, s) > amt * 0.7) g.cell(c, r, noise(c, r, s) > 0.97 ? RED : DIM)
  },
  // BACKMASK — mirrored halves (reverse)
  mirror: (g, ph) => {
    const half = g.C / 2
    for (let c = 0; c < half; c++) {
      const r = Math.round((Math.sin(c * 0.5 + ph) * 0.5 + 0.5) * (g.R - 1))
      g.cell(c, r, WHITE)
      g.cell(g.C - 1 - c, r, c === Math.floor(ph) % half ? RED : WHITE)
    }
  },
  // HOWL — a pulse with decaying echo taps (feedback delay)
  echo: (g, ph, amt) => {
    const head = Math.floor(ph * 2) % g.C
    for (let t = 0; t < 6; t++) {
      const c = (head - t * 3 + g.C * 2) % g.C
      const lvl = Math.pow(0.55 + amt * 0.4, t)
      const rows = Math.max(1, Math.round(lvl * g.R))
      for (let r = g.R - 1; r >= g.R - rows; r--) g.cell(c, r, t === 0 ? RED : DIM)
    }
  },
  // DROWN — a soft diffuse cloud, always present (reverb wash)
  diffuse: (g, ph) => {
    for (let c = 0; c < g.C; c++) for (let r = 0; r < g.R; r++) {
      const v = (Math.sin(c * 0.3 + ph * 0.5) + Math.sin(r * 0.9 - ph * 0.3) + Math.sin((c + r) * 0.2 + ph)) / 3
      if (v > 0.1) g.cell(c, r, v > 0.6 ? WHITE : DIM)
    }
  },
  // PANIC — a block darting left/right (random pan)
  jump: (g, ph) => {
    const pos = Math.floor(noise(Math.floor(ph * 3), 0, 1) * (g.C - 4))
    for (let c = 0; c < 4; c++) for (let r = 1; r < g.R - 1; r++) g.cell(pos + c, r, c < 2 ? RED : WHITE)
  },
  // BITROT — random single pixels flipping (bit flips)
  bitflip: (g, ph, amt) => {
    const s = Math.floor(ph * 4)
    for (let c = 0; c < g.C; c++) for (let r = 0; r < g.R; r++) {
      const n = noise(c, r, s)
      if (n < 0.06 + amt * 0.12) g.cell(c, r, n < 0.03 ? RED : WHITE)
    }
  },
  // SKIP — a held block that suddenly jumps (stuck buffer)
  stuck: (g, ph) => {
    const jump = Math.floor(ph / 6)
    const pos = Math.floor(noise(jump, 0, 3) * (g.C - 5))
    for (let c = 0; c < 5; c++) for (let r = 0; r < g.R; r++) {
      const h = Math.round((Math.sin(c * 0.9 + jump) * 0.5 + 0.5) * g.R)
      if (r >= g.R - h) g.cell(pos + c, r, c === 0 ? RED : WHITE)
    }
  },
  // HOLES — lit field with big chunks blanked (sector loss)
  blank: (g, ph, amt) => {
    const s = Math.floor(ph)
    for (let c = 0; c < g.C; c++) {
      if (noise(Math.floor(c / 3), s, 5) < amt * 0.6) continue // whole column-group gone
      for (let r = 0; r < g.R; r++) if ((c + r) % 2 === 0) g.cell(c, r, DIM)
    }
  },
  // SHATTER — tiles swapping positions (chunk shuffle)
  shuffle: (g, ph) => {
    const s = Math.floor(ph * 1.5)
    const tile = 3
    for (let c = 0; c < g.C; c++) {
      const t = Math.floor(c / tile)
      const swap = noise(t, s, 7) > 0.5 ? 1 : 0
      for (let r = 0; r < g.R; r++) if ((r + swap) % 2 === 0) g.cell(c, r, c % tile === 0 ? RED : WHITE)
    }
  },
  // FREEZE — a frozen frame that updates in discrete jumps (spectral hold)
  freeze: (g, ph) => {
    const s = Math.floor(ph / 8)
    for (let c = 0; c < g.C; c++) {
      const h = Math.round(noise(c, s, 9) * g.R)
      for (let r = g.R - 1; r >= g.R - h; r--) g.cell(c, r, r === g.R - h ? RED : DIM)
    }
  },
  // DECIMATE — coarse staircase downsample
  steps: (g, ph, amt) => {
    const hold = 2 + Math.floor(amt * 4)
    let last = 0
    for (let c = 0; c < g.C; c++) {
      if (c % hold === 0) last = Math.round((Math.sin(c * 0.5 + ph) * 0.5 + 0.5) * (g.R - 1))
      g.cell(c, last, c % hold === 0 ? RED : WHITE)
    }
  },
  // ROBOT — a scanning line erasing and redrawing (phase erase)
  scan: (g, ph) => {
    const head = Math.floor(ph * 2) % g.C
    for (let c = 0; c < g.C; c++) {
      const dist = (head - c + g.C) % g.C
      if (dist > g.C * 0.5) continue
      const r = Math.round((Math.sin(c * 0.8) * 0.5 + 0.5) * (g.R - 1))
      g.cell(c, r, dist === 0 ? RED : DIM)
    }
    for (let r = 0; r < g.R; r++) g.cell(head, r, RED)
  },
  // SMEAR — a comet head with a fading trail
  trail: (g, ph) => {
    const head = (ph * 2.5) % g.C
    for (let t = 0; t < g.C; t++) {
      const c = Math.floor(head - t + g.C) % g.C
      const r = Math.round((Math.sin(c * 0.4 + ph * 0.3) * 0.4 + 0.5) * (g.R - 1))
      if (t < 8) g.cell(c, r, t === 0 ? RED : DIM)
    }
  },
}

const MOD_VIZ = {
  chew: 'crush', rust: 'clip', starve: 'sink', mouth: 'formant', seasick: 'wobble',
  ghost: 'sweep', dive: 'fall', stutter: 'stutter', scramble: 'shift', dropout: 'holes',
  backmask: 'mirror', howl: 'echo', drown: 'diffuse', panic: 'jump',
  bitrot: 'bitflip', skip: 'stuck', holes: 'blank', shatter: 'shuffle', freeze: 'freeze',
  decimate: 'steps', robot: 'scan', smear: 'trail',
}

export const vizFor = (id) => ARCHETYPES[MOD_VIZ[id]] ?? ARCHETYPES.diffuse
