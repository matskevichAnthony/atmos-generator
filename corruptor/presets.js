// Factory recipes — the demo reel. Each fixes seed + source shape + which
// RACK A / RACK B modules are on; the seed pins the specifics.
// `a` = RACK A (live fx), `b` = RACK B (offline corruption).
// Module value: amt (number) or [amt, nonce] to pin the internal dice roll.
// Optional: bpm, bars, img { imgSeed, mode, amt } — the IMAGE UNIT joins the patch,
// draw { target, rate, amt, shape|steps } — the DRAW UNIT automation curve,
// artist { nick, url } — signed preset from a producer (gets the ARTIST frame).

export const PRESETS = [
  // ── signed / artist ──
  { name: 'ANTON+MATZKAIM', tag: 'ARTIST', seed: 'A7770077', shape: 'loop', zone: 'mid', notes: '5', len: 3.48, bpm: 138, bars: 2,
    a: { rust: 68, stutter: 55, seasick: 34, howl: 46, drown: 32 }, b: { bitrot: 24, skip: 38 }, curve: 'collapse',
    artist: { nick: 'ANTON+MATZKAIM', url: 'https://instagram.com/matzkaim' } },

  // ── one-shots ──
  { name: 'GLASS SNAP', tag: 'SHOT', seed: 'C0FFEE01', shape: 'shot', zone: 'high', notes: '1', len: 0.6,
    a: { chew: 55, starve: 40 }, b: { bitrot: 35 } },
  { name: 'VOID HIT', tag: 'SHOT', seed: 'B14CE500', shape: 'shot', zone: 'low', notes: '1', len: 1.5,
    a: { dive: 72, drown: 55 } },
  { name: 'NEUROTOXIN', tag: 'SHOT', seed: 'BAD70041', shape: 'shot', zone: 'mid', notes: '2', len: 1.1,
    a: { dive: 85, stutter: 62, rust: 55 }, b: { shatter: 60, bitrot: 28 }, curve: 'collapse' },
  { name: 'HELL PORTAL', tag: 'SHOT', seed: '666D00E5', shape: 'shot', zone: 'low', notes: '1', len: 2.8,
    a: { dive: 90, rust: 62, drown: 72 }, b: { decimate: 45, smear: 40 }, curve: 'collapse' },
  { name: 'REVERSE BLOOM', tag: 'SHOT', seed: 'FEEDBABE', shape: 'shot', zone: 'mid', notes: '3', len: 2.2,
    a: { backmask: 80, drown: 62 }, curve: 'heal' },
  { name: 'SIGNAL LOSS', tag: 'SHOT', seed: 'DEADBEEF', shape: 'shot', zone: 'mid', notes: '2', len: 1.3,
    a: { dropout: 70 }, b: { skip: 70, holes: 50 } },

  // ── loops ──
  { name: 'ACID WORM', tag: 'LOOP', seed: '303AC1D0', shape: 'loop', zone: 'mid', notes: '5', len: 4,
    a: { seasick: 50, ghost: 56 } },
  { name: 'CYBER SWARM', tag: 'LOOP', seed: 'C1BE55AA', shape: 'loop', zone: 'mid', notes: '3', len: 3, bpm: 160, bars: 2,
    a: { stutter: 72, scramble: 58, seasick: 44, ghost: 50 }, b: { skip: 42 }, curve: 'flat' },
  { name: 'BROKEN TRANSMISSION', tag: 'LOOP', seed: 'B20CEA57', shape: 'loop', zone: 'mid', notes: '3', len: 4,
    a: { dropout: 66, mouth: 55, howl: 52 }, b: { holes: 46, bitrot: 34 }, curve: 'flat' },
  { name: 'PANIC ROOM', tag: 'LOOP', seed: 'DEAD1000', shape: 'loop', zone: 'mid', notes: '3', len: 2,
    a: { panic: 75, howl: 64, chew: 38 } },
  { name: 'IRON CHOIR', tag: 'LOOP', seed: '1204C012', shape: 'loop', zone: 'low', notes: '2', len: 4,
    a: { mouth: 66, rust: 70, drown: 40 }, b: { robot: 52 }, curve: 'collapse' },

  // ── industrial / machinery ──
  { name: 'PISTON CULT', tag: 'LOOP', seed: 'D1E5E777', shape: 'loop', zone: 'low', notes: '2', len: 2, bpm: 132, bars: 1,
    a: { chew: [78, 3], rust: 82, stutter: [58, 2], starve: 45 }, b: { decimate: 52, robot: 38 }, curve: 'flat' },
  { name: 'CONVEYOR HELL', tag: 'LOOP', seed: 'FAB21C0F', shape: 'loop', zone: 'mid', notes: '2', len: 4, bpm: 120, bars: 2,
    a: { scramble: [70, 4], chew: 60, dropout: 44, howl: 38 }, b: { skip: [64, 2], bitrot: 46 }, curve: 'collapse' },
  { name: 'STEEL LUNG', tag: 'LOOP', seed: '57EE1AA6', shape: 'loop', zone: 'low', notes: '1', len: 4,
    a: { mouth: [88, 3], rust: 58, seasick: 26, drown: 35 }, b: { decimate: 40, holes: 28 }, curve: 'flat' },
  { name: 'DRILL SERMON', tag: 'SHOT', seed: 'D211BEAD', shape: 'shot', zone: 'mid', notes: '2', len: 1.8,
    a: { stutter: [92, 5], rust: 74, dive: 48, panic: 40 }, b: { shatter: [58, 3] }, curve: 'collapse' },
  { name: 'GAS LEAK', tag: 'SHOT', seed: '6A51EAC0', shape: 'shot', zone: 'high', notes: '1', len: 2.4,
    a: { starve: [82, 2], howl: 66, ghost: 44 }, b: { decimate: 68, holes: 52 }, curve: 'heal' },
  { name: 'MORGUE FREEZER', tag: 'DRONE', seed: 'C01DBED5', shape: 'drone', zone: 'low', notes: '1', len: 9,
    a: { rust: 44, drown: 60, ghost: 38 }, b: { freeze: [82, 2], robot: 66, bitrot: 22 }, curve: 'flat' },
  { name: 'SIREN GRAVEYARD', tag: 'DRONE', seed: 'A1A2FDEA', shape: 'drone', zone: 'mid', notes: '3', len: 8,
    a: { seasick: [76, 3], howl: 80, drown: 55, panic: 35 }, b: { smear: 48, skip: 30 }, curve: 'collapse' },
  { name: 'WELDING ANGEL', tag: 'SHOT', seed: 'AE1D0666', shape: 'shot', zone: 'high', notes: '3', len: 1.6,
    a: { rust: [90, 4], chew: 65, backmask: 42, panic: 55 }, b: { bitrot: [56, 2], shatter: 38 }, curve: 'collapse' },

  // ── draw unit / automation ──
  { name: 'PUMP RITUAL', tag: 'LOOP', seed: 'ABBA7000', shape: 'loop', zone: 'low', notes: '2', len: 3.43, bpm: 140, bars: 2,
    a: { chew: [60, 2], rust: 48, drown: 30 }, b: { bitrot: 20 },
    draw: { target: 'volume', rate: 8, amt: 92, shape: 'pump' }, curve: 'flat' },
  { name: 'ACID FURNACE', tag: 'LOOP', seed: 'AC1DF19E', shape: 'loop', zone: 'mid', notes: '3', len: 4, bpm: 128, bars: 2,
    a: { howl: [72, 2], stutter: 46, rust: 38 }, b: { decimate: 26 },
    draw: { target: 'filter', rate: 4, amt: 88, shape: 'stairs' }, curve: 'flat' },
  { name: 'ELEVATOR TO HELL', tag: 'DRONE', seed: 'E1EFA702', shape: 'drone', zone: 'low', notes: '2', len: 8,
    a: { drown: 65, ghost: 40, rust: 30 }, b: { smear: 44 },
    draw: { target: 'pitch', rate: 1, amt: 55, shape: 'saw' }, curve: 'collapse' },
  { name: 'STROBE CRUSHER', tag: 'LOOP', seed: '57206ECA', shape: 'loop', zone: 'mid', notes: '2', len: 2, bpm: 150, bars: 1,
    a: { stutter: [68, 3], chew: 44 }, b: { skip: 30 },
    draw: { target: 'crush', rate: 16, amt: 85, shape: 'trem' }, curve: 'flat' },

  // ── drones / atmospheres ──
  { name: 'SPECTRAL CATHEDRAL', tag: 'DRONE', seed: 'CA7ED2A1', shape: 'drone', zone: 'mid', notes: '4', len: 10,
    a: { drown: 85, ghost: 55 }, b: { smear: 75, freeze: 44, robot: 32 },
    img: { imgSeed: '5AEC72A1', mode: 'spectrum', amt: 62 }, curve: 'flat' },
  { name: 'FROZEN STAR', tag: 'DRONE', seed: 'F202E570', shape: 'drone', zone: 'high', notes: '4', len: 8,
    a: { drown: 66 }, b: { freeze: 70, robot: 40 } },
  { name: 'DATA STORM', tag: 'DRONE', seed: 'BADC0DE1', shape: 'drone', zone: 'mid', notes: '2', len: 8,
    a: { chew: 45, panic: 55, drown: 50 }, b: { bitrot: 40 },
    img: { imgSeed: 'DA7A0BAD', mode: 'bend', amt: 78 }, curve: 'collapse' },
  { name: 'BLACK TIDE', tag: 'DRONE', seed: '5EA0F00D', shape: 'drone', zone: 'low', notes: '2', len: 10,
    a: { drown: 78, ghost: 45 }, b: { smear: 72, holes: 30 }, curve: 'collapse' },
]
