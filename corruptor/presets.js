// Starting-point recipes. Each fixes a seed + source shape + which RACK A / RACK B
// modules are on (id → amount), so the CHARACTER is defined; the seed pins the
// specifics. `a` = RACK A (live fx), `b` = RACK B (offline corruption).
// Heavy on weird one-shots (tag SHOT).

export const PRESETS = [
  // ── one-shots ──
  { name: 'GLASS SNAP', tag: 'SHOT', seed: 'C0FFEE01', shape: 'shot', zone: 'high', notes: '1', len: 0.6,
    a: { chew: 55, starve: 40 }, b: { bitrot: 35 } },
  { name: 'VOID HIT', tag: 'SHOT', seed: 'B14CE500', shape: 'shot', zone: 'low', notes: '1', len: 1.5,
    a: { dive: 72, drown: 55 } },
  { name: 'DATA STAB', tag: 'SHOT', seed: 'DA7A57AB', shape: 'shot', zone: 'mid', notes: '2', len: 0.5,
    a: { rust: 60 }, b: { bitrot: 70, decimate: 60 } },
  { name: 'REVERSE BLOOM', tag: 'SHOT', seed: 'FEEDBABE', shape: 'shot', zone: 'mid', notes: '3', len: 2.2,
    a: { backmask: 80, drown: 62 }, curve: 'heal' },
  { name: 'MACHINE COUGH', tag: 'SHOT', seed: 'C0DEC0DE', shape: 'shot', zone: 'mid', notes: '1', len: 0.8,
    a: { mouth: 70, stutter: 58 } },
  { name: 'SIGNAL LOSS', tag: 'SHOT', seed: 'DEADBEEF', shape: 'shot', zone: 'mid', notes: '2', len: 1.3,
    a: { dropout: 70 }, b: { skip: 70, holes: 50 } },
  { name: 'ZAP PING', tag: 'SHOT', seed: '00BEEF00', shape: 'shot', zone: 'high', notes: '1', len: 0.4,
    a: { dive: 64, ghost: 50 } },
  { name: 'INSECT', tag: 'SHOT', seed: 'B0FFA711', shape: 'shot', zone: 'high', notes: '2', len: 0.9,
    a: { seasick: 66, mouth: 40 }, b: { shatter: 55 } },
  // ── loops ──
  { name: 'TAPE SNARL', tag: 'LOOP', seed: 'A1B2C3D4', shape: 'loop', zone: 'mid', notes: '3', len: 3,
    a: { rust: 66, seasick: 42 } },
  { name: 'ACID WORM', tag: 'LOOP', seed: '303AC1D0', shape: 'loop', zone: 'mid', notes: '5', len: 4,
    a: { seasick: 50, ghost: 56 } },
  { name: 'RUST GRIND', tag: 'LOOP', seed: 'F00DF00D', shape: 'loop', zone: 'low', notes: '2', len: 2,
    a: { chew: 60, rust: 72 }, b: { decimate: 44 } },
  { name: 'PANIC ROOM', tag: 'LOOP', seed: 'DEAD1000', shape: 'loop', zone: 'mid', notes: '3', len: 2,
    a: { panic: 70, howl: 60 } },
  // ── drones / atmospheres ──
  { name: 'VOID DRONE', tag: 'DRONE', seed: '0000F1FE', shape: 'drone', zone: 'low', notes: '1', len: 8,
    a: { drown: 80, seasick: 30 }, b: { smear: 60 } },
  { name: 'GHOST CHOIR', tag: 'DRONE', seed: 'C0A1E550', shape: 'drone', zone: 'mid', notes: '3', len: 6,
    a: { mouth: 60, drown: 72 } },
  { name: 'FROZEN STAR', tag: 'DRONE', seed: 'F202E570', shape: 'drone', zone: 'high', notes: '4', len: 8,
    a: { drown: 66 }, b: { freeze: 70, robot: 40 } },
  { name: 'BLACK TIDE', tag: 'DRONE', seed: '5EA0F00D', shape: 'drone', zone: 'low', notes: '2', len: 10,
    a: { drown: 78, ghost: 45 }, b: { smear: 72, holes: 30 }, curve: 'collapse' },
]
