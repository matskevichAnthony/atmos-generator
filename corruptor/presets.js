// Factory recipes — the demo reel. Each fixes seed + source shape + which
// RACK A / RACK B modules are on; the seed pins the specifics.
// `a` = RACK A (live fx), `b` = RACK B (offline corruption).
// Module value: amt (number) or [amt, nonce] to pin the internal dice roll.
// Optional: bpm, bars, img { imgSeed, mode, amt } — the IMAGE UNIT joins the patch,
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
