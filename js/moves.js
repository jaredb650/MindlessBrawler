// ─────────────────────────────────────────────────────────────
// Move data. Everything an attack IS lives here — frame data,
// hitboxes, guard height, cancel routes, stamina cost.
// Fighter/Combat only interpret this table, so adding a move =
// adding an entry. `anim` is the animation key the renderer (and a
// future sprite system) looks up.
//
// Hitbox coords are relative to the fighter's feet, facing RIGHT
// (combat.js mirrors them for left-facing). y is negative = up;
// the box spans y .. y+h.
//
// Feel philosophy (v0.2 "relentless" pass):
//   lights are FAST and nearly free to whiff — spam is paid for in stamina
//   `heavy: true`  → pays the whiff tax + long recovery: raw whiffs get punished
//   `popsGround: true` → hitting a downed body pops it off the floor (ground juggle)
//
// Combo design intent:
//   stun strings  → jab/cross/crouchjab/frontkick/legkick (low dmg, keep pressure)
//   damage enders → hook (knockdown), uppercut (launcher), sweep (low knockdown)
//   ground game   → anything hits a downed body; kicks/heavies pop it up,
//                   soccer kick is the premium pop
// ─────────────────────────────────────────────────────────────
const MOVES = {
  jab: {
    anim: 'jab', startup: 2, active: 3, recovery: 5,
    damage: 30, hitstun: 16, blockstun: 9, stamina: 2,
    guard: 'mid', kbx: 2.0, hitstop: CFG.HITSTOP_LIGHT,
    hitbox: { x: 18, y: -155, w: 58, h: 35 },
    cancels: ['jab', 'cross', 'knee', 'legkick', 'sweep'],
  },
  cross: {
    anim: 'cross', startup: 4, active: 3, recovery: 9,
    damage: 55, hitstun: 19, blockstun: 11, stamina: 4,
    guard: 'mid', kbx: 3.0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 22, y: -150, w: 70, h: 40 },
    cancels: ['hook', 'knee', 'legkick'],
  },
  // Ender: cross → forward+P again. Drops them like a sack of potatoes.
  hook: {
    anim: 'hook', startup: 6, active: 4, recovery: 15,
    damage: 80, hitstun: 0, blockstun: 13, stamina: 6,
    guard: 'mid', kbx: 4.0, hitstop: CFG.HITSTOP_ENDER,
    hitbox: { x: 14, y: -160, w: 72, h: 45 },
    knockdown: true, chainOnly: true, heavy: true, popsGround: true,
  },
  // Ender: up+P. Launches → ground bounce → knockdown.
  uppercut: {
    anim: 'uppercut', startup: 6, active: 5, recovery: 22,
    damage: 90, hitstun: 0, blockstun: 14, stamina: 12,
    guard: 'mid', kbx: 2.0, hitstop: CFG.HITSTOP_ENDER,
    hitbox: { x: 12, y: -185, w: 55, h: 80 },
    launcher: true, launchVy: -13.5, heavy: true, popsGround: true, flyConvert: 'flyuppercut',
  },
  // back+P: spinning backfist — slower, more range, lunges forward to cover distance.
  backfist: {
    anim: 'backfist', startup: 9, active: 4, recovery: 16,
    damage: 70, hitstun: 24, blockstun: 13, stamina: 9,
    guard: 'mid', kbx: 5.0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 26, y: -160, w: 85, h: 40 },
    lungeVx: 5, heavy: true, popsGround: true,
  },
  // down+P: quick crouching body jab.
  crouchjab: {
    anim: 'crouchjab', startup: 3, active: 3, recovery: 6,
    damage: 22, hitstun: 14, blockstun: 8, stamina: 2,
    guard: 'mid', kbx: 1.5, hitstop: CFG.HITSTOP_LIGHT, crouching: true,
    hitbox: { x: 16, y: -110, w: 55, h: 30 },
    cancels: ['crouchjab', 'knee', 'sweep', 'legkick'],
  },
  // neutral K: front kick — longest-range poke, makes a little space.
  frontkick: {
    anim: 'frontkick', startup: 5, active: 4, recovery: 10,
    damage: 45, hitstun: 17, blockstun: 10, stamina: 3,
    guard: 'mid', kbx: 4.0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 30, y: -140, w: 80, h: 35 },
    cancels: ['knee', 'legkick'], popsGround: true,
  },
  // ↑+K: clinch knee to the body — body shots break the will to fight:
  // drains opponent STAMINA on hit (half even through block). Chains in from
  // everything light; tap JUMP during its startup (in range) → FLYING KNEE.
  knee: {
    anim: 'knee', startup: 4, active: 3, recovery: 7,
    damage: 35, hitstun: 18, blockstun: 9, stamina: 3,
    guard: 'mid', kbx: 1.2, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 10, y: -125, w: 48, h: 42 },
    cancels: ['legkick', 'sweep'],
    staminaDrain: 12, popsGround: true, flyConvert: 'flyknee',
  },
  // ←+K: spinning back kick — huge telegraph, huge lunge, huge damage, and the
  // ONE strike that blasts people across the stage. Exempt from flow cancel:
  // even on hit you stand through the spin — it ENDS exchanges, never starts them.
  backkick: {
    anim: 'backkick', startup: 12, active: 4, recovery: 26,
    damage: 100, hitstun: 0, blockstun: 16, stamina: 12,
    guard: 'mid', kbx: 6.0, hitstop: CFG.HITSTOP_ENDER,
    hitbox: { x: 24, y: -150, w: 95, h: 45 },
    lungeVx: 7, heavy: true, popsGround: true, blast: true, noFlowCancel: true,
  },
  // Flying knee (jump-converted from knee): flat arc, real travel.
  // THREE payoffs by spacing — the skill-shot move:
  //   point-blank (hit within pbWindow flight frames) = +pbDamage bonus,
  //     the hardest single strike in the game (harder than backkick/soccer)
  //   early/rising = blast them across the stage
  //   TIP of the arc = stamina zeroed, gassed on the spot
  flyknee: {
    anim: 'flyknee', startup: 2, active: 999, recovery: 0,
    damage: 70, hitstun: 0, blockstun: 14, stamina: 8,
    guard: 'mid', kbx: 3.0, hitstop: CFG.HITSTOP_ENDER,
    hitbox: { x: 8, y: -95, w: 62, h: 48 },
    pbWindow: 6, pbDamage: 60,
    air: true, flight: { vx: 12, vy: -11.5 }, kneeSpot: true, heavy: true, popsGround: true,   // real height — it FLIES, flatter than a jump but clearly airborne
  },
  // Flying uppercut (jump-converted from uppercut): near-vertical 3-hit rise
  // with startup invulnerability — the pop-out-of-pressure reversal. Final hit
  // launches them HIGH while you land first: juggle starter. Death on whiff.
  flyuppercut: {
    anim: 'flyuppercut', startup: 2, active: 999, recovery: 0,
    damage: 35, hitstun: 0, blockstun: 14, stamina: 6,
    guard: 'mid', kbx: 2.0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 6, y: -170, w: 55, h: 90 },
    air: true, flight: { vx: 3.2, vy: -14 }, multihit: { times: 3, interval: 5 },
    launcher: true, launchVy: -15, heavy: true,
  },
  // forward+K: leg kick — THE stun-string glue. Big stun, almost no pushback,
  // must be blocked low. Less damage; its value is keeping pressure alive.
  legkick: {
    anim: 'legkick', startup: 5, active: 3, recovery: 10,
    damage: 40, hitstun: 26, blockstun: 8, stamina: 4,
    guard: 'low', kbx: 1.0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 20, y: -95, w: 70, h: 35 },
    popsGround: true,
  },
  // down+K: sweep — low ender, knocks down, very punishable on whiff.
  sweep: {
    anim: 'sweep', startup: 7, active: 4, recovery: 20,
    damage: 60, hitstun: 0, blockstun: 12, stamina: 10,
    guard: 'low', kbx: 1.5, hitstop: CFG.HITSTOP_ENDER, crouching: true,
    hitbox: { x: 18, y: -40, w: 85, h: 32 },
    knockdown: true, heavy: true, popsGround: true,
  },
  // Air P or K: jumping kick — blocked standing only (the jump-in opener).
  jumpkick: {
    anim: 'jumpkick', startup: 5, active: 999, recovery: 0,   // active until landing
    damage: 60, hitstun: 20, blockstun: 12, stamina: 3,
    guard: 'high', kbx: 2.0, hitstop: CFG.HITSTOP_MED, air: true,
    hitbox: { x: 14, y: -60, w: 65, h: 50 },   // relative to airborne feet — angled down-forward
    popsGround: true,
  },
  // forward+K near a downed opponent: the PREMIUM ground hit — biggest pop,
  // biggest damage. Vs a standing opponent it's just a big slow kick.
  soccer: {
    anim: 'soccer', startup: 10, active: 4, recovery: 22,
    damage: 110, hitstun: 22, blockstun: 14, stamina: 10,
    guard: 'mid', kbx: 4.0, hitstop: CFG.HITSTOP_ENDER,
    hitbox: { x: 16, y: -70, w: 75, h: 70 },
    otg: true, heavy: true, popsGround: true, popVy: -11.5,
  },
};

// Neutral-state button+direction → move name.
// 'forward'/'back' are relative to facing; up does NOT jump (jump is its own button).
// `oppDowned` includes the fallheavy collapse — soccer's startup bridges into the
// downed state, so kicking someone mid-drop comes out as the punish, not a whiffed legkick.
function resolveNeutralMove(btn, dirCat, oppDowned, closeToOpp) {
  if (btn === 'punch') {
    switch (dirCat) {
      case 'up': return 'uppercut';
      case 'down': return 'crouchjab';
      case 'forward': return 'cross';
      case 'back': return 'backfist';
      default: return 'jab';
    }
  }
  if (btn === 'kick') {
    switch (dirCat) {
      case 'up': return 'knee';
      case 'back': return 'backkick';
      case 'down': return 'sweep';
      case 'forward': return (oppDowned && closeToOpp) ? 'soccer' : 'legkick';
      default: return 'frontkick';
    }
  }
  return null;
}
