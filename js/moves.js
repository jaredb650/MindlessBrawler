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
    guard: 'mid', kind: 'punch', kbx: 2.0, hitstop: CFG.HITSTOP_LIGHT,
    hitbox: { x: 18, y: -155, w: 58, h: 35 },
    cancels: ['jab', 'cross', 'axekick', 'legkick', 'sweep'],
  },
  cross: {
    anim: 'cross', startup: 4, active: 3, recovery: 9,
    damage: 55, hitstun: 19, blockstun: 11, stamina: 4,
    guard: 'mid', kind: 'punch', kbx: 3.0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 22, y: -150, w: 70, h: 40 },
    cancels: ['hook', 'axekick', 'legkick'],
  },
  // Ender: cross → forward+P again. Drops them like a sack of potatoes.
  hook: {
    anim: 'hook', startup: 6, active: 4, recovery: 15,
    damage: 80, hitstun: 0, blockstun: 13, stamina: 6,
    guard: 'mid', kind: 'punch', kbx: 4.0, hitstop: CFG.HITSTOP_ENDER,
    hitbox: { x: 14, y: -160, w: 72, h: 45 },
    knockdown: true, chainOnly: true, heavy: true, popsGround: true,
  },
  // Ender: up+P. Launches → ground bounce → knockdown.
  uppercut: {
    anim: 'uppercut', startup: 6, active: 5, recovery: 22,
    damage: 90, hitstun: 0, blockstun: 14, stamina: 12,
    guard: 'mid', kind: 'punch', kbx: 2.0, hitstop: CFG.HITSTOP_ENDER,
    hitbox: { x: 12, y: -185, w: 55, h: 80 },
    launcher: true, launchVy: -13.5, heavy: true, popsGround: true, flyConvert: 'flyuppercut',
  },
  // back+P: spinning backfist — slower, more range, lunges forward to cover distance.
  backfist: {
    anim: 'backfist', startup: 9, active: 4, recovery: 16,
    damage: 70, hitstun: 24, blockstun: 13, stamina: 9,
    guard: 'mid', kind: 'punch', kbx: 5.0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 26, y: -160, w: 85, h: 40 },
    lungeVx: 5, heavy: true, popsGround: true,
  },
  // run+P: dash punch — a committed leaping straight. More reach + damage than
  // cross, long recovery: whiff it and you're punished. Carries the run's momentum.
  dashpunch: {
    anim: 'dashpunch', startup: 7, active: 4, recovery: 16,
    damage: 70, hitstun: 22, blockstun: 14, stamina: CFG.DASH_ATTACK_STAMINA,
    guard: 'mid', kbx: 5.0, hitstop: CFG.HITSTOP_MED, kind: 'punch',
    hitbox: { x: 24, y: -150, w: 82, h: 42 },
    lungeVx: CFG.DASH_ATTACK_LUNGE, heavy: true, popsGround: true,
  },
  // run+K: dash kick — knocks down and BLASTS them toward the wall. The corner
  // carry: hit a launched/cornered body with this and they wall-splat.
  dashkick: {
    anim: 'dashkick', startup: 8, active: 4, recovery: 18,
    damage: 65, hitstun: 0, blockstun: 14, stamina: CFG.DASH_ATTACK_STAMINA,
    guard: 'mid', kbx: 7.0, hitstop: CFG.HITSTOP_ENDER, kind: 'kick',
    hitbox: { x: 28, y: -120, w: 90, h: 48 },
    lungeVx: CFG.DASH_ATTACK_LUNGE, knockdown: true, heavy: true, popsGround: true,
  },
  // down+P: quick crouching body jab.
  crouchjab: {
    anim: 'crouchjab', startup: 3, active: 3, recovery: 6,
    damage: 22, hitstun: 14, blockstun: 8, stamina: 2,
    guard: 'mid', kind: 'punch', kbx: 1.5, hitstop: CFG.HITSTOP_LIGHT, crouching: true,
    hitbox: { x: 16, y: -110, w: 55, h: 30 },
    cancels: ['crouchjab', 'axekick', 'sweep', 'legkick'],
  },
  // neutral K: front kick — longest-range poke, makes a little space.
  frontkick: {
    anim: 'frontkick', startup: 5, active: 4, recovery: 10,
    damage: 45, hitstun: 17, blockstun: 10, stamina: 3,
    guard: 'mid', kind: 'kick', kbx: 4.0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 30, y: -140, w: 80, h: 35 },
    cancels: ['axekick', 'legkick'], popsGround: true,
  },
  // ↑+K: clinch knee to the body — body shots break the will to fight:
  // drains opponent STAMINA on hit (half even through block). Chains in from
  // everything light; tap JUMP during its startup (in range) → FLYING KNEE.
  knee: {
    anim: 'knee', startup: 4, active: 3, recovery: 7,
    damage: 35, hitstun: 18, blockstun: 9, stamina: 3,
    guard: 'mid', kind: 'kick', kbx: 1.2, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 10, y: -125, w: 48, h: 42 },
    cancels: ['legkick', 'sweep'],
    staminaDrain: 12, popsGround: true, flyConvert: 'flyknee',
  },
  // ↑+K: AXE KICK — the overhead ender. Slow telegraphed lift, then the heel
  // chops STRAIGHT DOWN through the guard: a true overhead, must be blocked
  // STANDING (guard:'high'). Huge damage, hard knockdown, pops a downed body.
  // Caps the light strings (Fork A) and — like the knee before it — tap JUMP
  // during its startup (in range) still converts to the FLYING KNEE (Fork B).
  axekick: {
    anim: 'axekick', startup: 14, active: 4, recovery: 24,
    damage: 95, hitstun: 0, blockstun: 16, stamina: 11,
    guard: 'high', kind: 'kick', kbx: 3.5, hitstop: CFG.HITSTOP_ENDER,
    hitbox: { x: 6, y: -190, w: 60, h: 190 },   // TALL: heel travels head → floor on the way down
    knockdown: true, heavy: true, popsGround: true, flyConvert: 'flyknee',
  },
  // ←+K: spinning back kick — huge telegraph, huge lunge, huge damage, and the
  // ONE strike that blasts people across the stage. Exempt from flow cancel:
  // even on hit you stand through the spin — it ENDS exchanges, never starts them.
  backkick: {
    anim: 'backkick', startup: 12, active: 4, recovery: 26,
    damage: 100, hitstun: 0, blockstun: 16, stamina: 12,
    guard: 'mid', kind: 'kick', kbx: 6.0, hitstop: CFG.HITSTOP_ENDER,
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
    guard: 'mid', kind: 'kick', kbx: 3.0, hitstop: CFG.HITSTOP_ENDER,
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
    guard: 'mid', kind: 'punch', kbx: 2.0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 6, y: -170, w: 55, h: 90 },
    air: true, flight: { vx: 3.2, vy: -14 }, multihit: { times: 3, interval: 5 },
    launcher: true, launchVy: -15, heavy: true,
  },
  // forward+K: leg kick — THE stun-string glue. Big stun, almost no pushback,
  // must be blocked low. Less damage; its value is keeping pressure alive.
  legkick: {
    anim: 'legkick', startup: 5, active: 3, recovery: 10,
    damage: 40, hitstun: 26, blockstun: 8, stamina: 4,
    guard: 'low', kind: 'kick', kbx: 1.0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 20, y: -95, w: 70, h: 35 },
    popsGround: true,
  },
  // down+K: sweep — low ender, knocks down, very punishable on whiff.
  sweep: {
    anim: 'sweep', startup: 7, active: 4, recovery: 20,
    damage: 60, hitstun: 0, blockstun: 12, stamina: 10,
    guard: 'low', kind: 'kick', kbx: 1.5, hitstop: CFG.HITSTOP_ENDER, crouching: true,
    hitbox: { x: 18, y: -40, w: 85, h: 32 },
    knockdown: true, heavy: true, popsGround: true,
  },
  // Air P: jumping punch — fast, light, blocked standing only. The low-commitment
  // air poke (cheap, short landing recovery), vs the heavier jumpkick.
  airpunch: {
    anim: 'airpunch', startup: 4, active: 999, recovery: 0,   // active until landing
    damage: 35, hitstun: 18, blockstun: 11, stamina: 2,
    guard: 'high', kbx: 2.0, hitstop: CFG.HITSTOP_LIGHT, air: true, kind: 'punch',
    hitbox: { x: 16, y: -80, w: 56, h: 44 },   // relative to airborne feet — angled down-forward
    popsGround: true,
  },
  // Air K: jumping kick — blocked standing only (the jump-in opener).
  jumpkick: {
    anim: 'jumpkick', startup: 5, active: 999, recovery: 0,   // active until landing
    damage: 60, hitstun: 20, blockstun: 12, stamina: 3,
    guard: 'high', kbx: 2.0, hitstop: CFG.HITSTOP_MED, air: true, kind: 'kick',
    hitbox: { x: 14, y: -60, w: 65, h: 50 },   // relative to airborne feet — angled down-forward
    popsGround: true,
  },
  // down+K in the air: steep dive bomb. Redirects momentum hard down-forward on
  // start (dive:{vx,vy}, read in startMove), so it BEATS a slow anti-air and
  // changes your jump arc — but planting it whiffed is a long, punishable landing.
  // On hit it drives a grounded body down (knockdown) and juggles an airborne one.
  divekick: {
    anim: 'divekick', startup: 3, active: 999, recovery: 0,   // active until landing
    damage: 70, hitstun: 24, blockstun: 13, stamina: 6,
    guard: 'high', kbx: 3.0, hitstop: CFG.HITSTOP_ENDER, air: true, kind: 'kick',
    hitbox: { x: 14, y: -52, w: 64, h: 60 },   // relative to airborne feet — steep down-forward leg
    dive: { vx: CFG.DIVEKICK_VX, vy: CFG.DIVEKICK_VY },
    knockdown: true, heavy: true, popsGround: true,
  },
  // forward+K near a downed opponent: the PREMIUM ground hit — biggest pop,
  // biggest damage. Vs a standing opponent it's just a big slow kick.
  soccer: {
    anim: 'soccer', startup: 10, active: 4, recovery: 22,
    damage: 110, hitstun: 22, blockstun: 14, stamina: 10,
    guard: 'mid', kind: 'kick', kbx: 4.0, hitstop: CFG.HITSTOP_ENDER,
    hitbox: { x: 16, y: -70, w: 75, h: 70 },
    otg: true, heavy: true, popsGround: true, popVy: -11.5,
  },
  // ── Clinch strikes (only from the 'clinch' hold; see fighter.js) ──
  // clinchHit:true → combat.js applies damage/stamina but NEVER changes the
  // victim's state: they stay 'clinched' so you keep working the body.
  clinchpunch: {
    anim: 'clinchpunch', startup: 3, active: 3, recovery: 8,
    damage: 20, hitstun: 0, blockstun: 0, stamina: 3,
    guard: 'mid', kbx: 0, hitstop: CFG.HITSTOP_MED,
    hitbox: { x: 8, y: -120, w: 40, h: 36 },
    clinchHit: true, kind: 'punch',
  },
  clinchknee: {
    anim: 'clinchknee', startup: 5, active: 3, recovery: 12,
    damage: 30, hitstun: 0, blockstun: 0, stamina: 4,
    guard: 'mid', kbx: 0, hitstop: CFG.HITSTOP_ENDER,
    hitbox: { x: 6, y: -100, w: 42, h: 46 },
    staminaDrain: 18, clinchHit: true, kind: 'kick',
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
      case 'up': return 'axekick';
      case 'back': return 'backkick';
      case 'down': return 'sweep';
      case 'forward': return (oppDowned && closeToOpp) ? 'soccer' : 'legkick';
      default: return 'frontkick';
    }
  }
  return null;
}

// In-air button+direction → aerial move name. One attack per jump (the caller
// gates with usedAirAttack). down+K is the dive bomb; everything else is the
// standard jump-in (P punch / K kick).
function resolveAirMove(btn, dirCat) {
  if (btn === 'punch') return 'airpunch';
  if (btn === 'kick') return dirCat === 'down' ? 'divekick' : 'jumpkick';
  return null;
}

// Run-state button → dash attack. The run COMMITS into a dedicated lunge instead
// of a normal — there is no directional variety here (you're already running).
function resolveDashMove(btn) {
  if (btn === 'punch') return 'dashpunch';
  if (btn === 'kick') return 'dashkick';
  return null;
}
