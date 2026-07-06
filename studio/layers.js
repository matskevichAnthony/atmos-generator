const r2 = (x) => Math.round(x * 100) / 100

export const LAYERS = [
  {
    id: 'kick', label: 'KICK', orbit: 1, vol: 1,
    macros: [
      { key: 'punch', label: 'панч', min: 8, max: 40, step: 1, def: 24 },
      { key: 'drive', label: 'драйв', min: 0, max: 3.5, step: 0.1, def: 1.3 },
      { key: 'body', label: 'тело', min: 0.06, max: 0.3, step: 0.01, def: 0.15 },
    ],
    presets: {
      hard: { pdec: 0.12, lpf: 3500, click: 0 },
      punchy: { pdec: 0.16, lpf: 2800, click: 0, punch: 30 },
      gabber: { pdec: 0.09, lpf: 6000, click: 1, drive: 3, body: 0.26 },
      boxy: { pdec: 0.07, lpf: 1800, click: 0, body: 0.09 },
    },
    build(m, p, g) {
      const kick = `note("${g.root}*4").s("sine").penv(${m.punch}).pdec(${p.pdec}).pcurve(1)`
        + `.attack(.001).decay(${m.body}).sustain(0).distort(${m.drive}).lpf(${p.lpf})`
      return p.click ? `stack(${kick}, s("white*4").decay(.006).sustain(0).hpf(2000).gain(.5))` : kick
    },
  },
  {
    id: 'rumble', label: 'RUMBLE', orbit: 2, vol: 0.85,
    macros: [
      { key: 'tone', label: 'тон', min: 100, max: 600, step: 10, def: 240 },
      { key: 'tail', label: 'хвост', min: 0, max: 1, step: 0.05, def: 0.6 },
      { key: 'drive', label: 'драйв', min: 0, max: 4, step: 0.1, def: 1.5 },
    ],
    presets: {
      reverb: { type: 'reverb' },
      decay: { type: 'decay' },
      delay: { type: 'delay', tone: 520, drive: 2.4 },
      sub: { type: 'sub', tail: 0.3 },
    },
    build(m, p, g) {
      const tails = {
        reverb: `.decay(.14).sustain(0).room(${r2(0.8 + 2.2 * m.tail)}).roomsize(${r2(3 + 9 * m.tail)}).roomlp(500)`,
        decay: `.attack(0).decay(${r2(0.15 + 1.3 * m.tail)}).sustain(0).release(${r2(0.1 + 0.6 * m.tail)})`,
        delay: `.decay(.12).sustain(0).delay(${r2(0.3 + 0.6 * m.tail)}).delaytime(.09).delayfeedback(${r2(0.35 + 0.55 * m.tail)})`,
        sub: `.attack(.01).decay(.1).sustain(.7).release(.06)`,
      }
      return `note("${g.root - 12}*4").s("sine")${tails[p.type]}.distort(${m.drive}).lpf(${m.tone})`
    },
  },
  {
    id: 'hats', label: 'HATS', orbit: 3, vol: 0.3,
    macros: [
      { key: 'len', label: 'длина', min: 0.015, max: 0.09, step: 0.005, def: 0.04 },
      { key: 'bright', label: 'яркость', min: 2000, max: 9000, step: 100, def: 5000 },
      { key: 'space', label: 'эхо', min: 0, max: 0.6, step: 0.05, def: 0.15 },
    ],
    presets: {
      offbeat: { pat: '[~ white]*4' },
      sixteen: { pat: 'white*16', accents: '[.4 1]*8' },
      ratchet: { pat: 'white*8', ratchet: 1 },
      euclid: { pat: 'white(9,16,2)' },
    },
    build(m, p) {
      let s = `s("${p.pat}").decay(${m.len}).sustain(0).hpf(${m.bright})`
      if (p.accents) s += `.velocity("${p.accents}")`
      if (p.ratchet) s += `.sometimes(ply(2))`
      if (m.space > 0) s += `.delay(${m.space}).delaytime(.11).delayfeedback(.3)`
      return s
    },
  },
  {
    id: 'perc', label: 'PERC', orbit: 4, vol: 0.35,
    macros: [
      { key: 'pitch', label: 'высота', min: 12, max: 36, step: 1, def: 24 },
      { key: 'metal', label: 'металл', min: 4, max: 40, step: 1, def: 14 },
      { key: 'grit', label: 'грязь', min: 3, max: 10, step: 1, def: 6 },
    ],
    presets: {
      clank: { pat: '~ ~ X ~ ~ ~ X ~', fmh: 2.39 },
      rattle: { pat: 'X(5,8)', fmh: 1.83 },
      zap: { pat: '~ X ~ <~ X>', fmh: 3.17 },
    },
    build(m, p, g) {
      const pat = p.pat.replaceAll('X', g.root + m.pitch)
      return `note("${pat}").s("square").fm(${m.metal}).fmh(${p.fmh})`
        + `.decay(.07).sustain(0).crush(${m.grit}).hpf(300).room(.25)`
    },
  },
  {
    id: 'acid', label: 'ACID', orbit: 5, vol: 0.4,
    macros: [
      { key: 'cutoff', label: 'фильтр', min: 200, max: 2200, step: 20, def: 550 },
      { key: 'reso', label: 'резонанс', min: 4, max: 22, step: 1, def: 12 },
      { key: 'drive', label: 'драйв', min: 0, max: 3, step: 0.1, def: 1 },
    ],
    presets: {
      rolling: { off: '0 0 0 12 0 0 3 0 0 0 12 0 7 0 3 0' },
      stab: { off: '0 ~ ~ 0 ~ ~ 0 ~' },
      hypno: { off: '<0 0 3 7>*8' },
    },
    build(m, p, g) {
      return `note("${p.off}").add(note(${g.root})).s("sawtooth")`
        + `.decay(.1).sustain(0).release(.04).lpf(${m.cutoff}).resonance(${m.reso}).distort(${m.drive})`
    },
  },
  {
    id: 'atmos', label: 'ATMOS', orbit: 6, vol: 0.35,
    macros: [
      { key: 'color', label: 'цвет', min: 300, max: 2500, step: 50, def: 800 },
      { key: 'move', label: 'движение', min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: 'space', label: 'простор', min: 0, max: 1, step: 0.05, def: 0.6 },
    ],
    presets: {
      deep: { chord: [0, 3, 7, 10], wave: 'supersaw', att: 3, rel: 7, reso: 6 },
      choir: { chord: [0, 7, 12], wave: 'sawtooth', att: 4, rel: 8, reso: 4 },
      fog: { chord: [0, 3, 7], wave: 'sawtooth', att: 2, rel: 5, reso: 16 },
      void: { chord: [0], wave: 'supersaw', att: 5, rel: 9, reso: 6, det: 0.3 },
    },
    build(m, p, g) {
      const notes = p.chord.map((i) => g.root + 12 + i).join(',')
      let s = `note("${notes}").s("${p.wave}")`
      if (p.det) s += `.add(note("0,${p.det},-${p.det}"))`
      s += `.attack(${p.att}).release(${p.rel}).sustain(1)`
        + `.lpf(sine.range(${Math.round(m.color * 0.4)},${Math.round(m.color * 1.6)}).slow(${Math.round(4 + 12 * (1 - m.move))}))`
        + `.resonance(${p.reso})`
        + `.vib(${r2(0.1 + 0.5 * m.move)}).vibmod(.08)`
        + `.phaser(${r2(0.3 + 0.5 * m.move)}).phaserrate(.15)`
        + `.pan(sine.range(.2,.8).slow(9))`
        + `.room(${r2(0.8 + 2.4 * m.space)}).roomsize(${r2(4 + 8 * m.space)})`
      return s
    },
  },
  {
    id: 'air', label: 'AIR', orbit: 7, vol: 0.2,
    macros: [
      { key: 'speed', label: 'период', min: 2, max: 16, step: 1, def: 8 },
      { key: 'top', label: 'верх', min: 1500, max: 8000, step: 100, def: 4000 },
    ],
    presets: {
      wind: { mode: 'sweep' },
      riser: { mode: 'rise' },
      pulse: { mode: 'pulse' },
    },
    build(m, p) {
      if (p.mode === 'rise') return `s("white").attack(.5).release(.5).lpf(saw.range(200,${m.top}).slow(${m.speed})).hpf(150)`
      if (p.mode === 'pulse') return `s("white*8").decay(.05).sustain(0).lpf(${m.top}).velocity("[.2 .5]*4").hpf(150)`
      return `s("white*2").attack(.3).release(.5).lpf(sine.range(250,${m.top}).slow(${m.speed})).hpf(150)`
    },
  },
]

export const STYLES = {
  berlin: {
    bpm: 136, root: 31,
    layers: {
      kick: { preset: 'hard', vol: 1 },
      rumble: { preset: 'reverb', vol: 0.85 },
      hats: { preset: 'offbeat', vol: 0.3 },
      perc: { preset: 'clank', vol: 0.25 },
      acid: { mute: true },
      atmos: { preset: 'deep', vol: 0.3 },
      air: { preset: 'wind', vol: 0.15 },
    },
  },
  warehouse: {
    bpm: 130, root: 29,
    layers: {
      kick: { preset: 'punchy', vol: 1 },
      rumble: { preset: 'reverb', vol: 0.9, macros: { tail: 0.9 } },
      hats: { preset: 'euclid', vol: 0.25 },
      perc: { mute: true },
      acid: { preset: 'hypno', vol: 0.3, macros: { cutoff: 380 } },
      atmos: { preset: 'choir', vol: 0.35 },
      air: { preset: 'wind', vol: 0.2 },
    },
  },
  rotterdam: {
    bpm: 160, root: 31,
    layers: {
      kick: { preset: 'gabber', vol: 1 },
      rumble: { preset: 'delay', vol: 0.8 },
      hats: { preset: 'sixteen', vol: 0.35 },
      perc: { preset: 'rattle', vol: 0.3 },
      acid: { preset: 'stab', vol: 0.45 },
      atmos: { mute: true },
      air: { mute: true },
    },
  },
  hypno: {
    bpm: 142, root: 28,
    layers: {
      kick: { preset: 'boxy', vol: 1 },
      rumble: { preset: 'sub', vol: 0.9 },
      hats: { preset: 'ratchet', vol: 0.28 },
      perc: { preset: 'clank', vol: 0.3 },
      acid: { preset: 'rolling', vol: 0.42 },
      atmos: { preset: 'fog', vol: 0.3 },
      air: { preset: 'pulse', vol: 0.18 },
    },
  },
}

export const ROOTS = [
  { midi: 26, label: 'D1' },
  { midi: 28, label: 'E1' },
  { midi: 29, label: 'F1' },
  { midi: 31, label: 'G1' },
  { midi: 33, label: 'A1' },
  { midi: 35, label: 'B1' },
  { midi: 36, label: 'C2' },
]
