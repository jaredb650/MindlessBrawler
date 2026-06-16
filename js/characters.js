// ─────────────────────────────────────────────────────────────
// Characters: per-character definitions — the single source of truth for a
// fighter's IDENTITY (moveset, stats, input mapping, render profile, supers).
// The game began as a mirror match (both fighters = the MMA 'brawler'); this
// registry is the seam a 2nd character (Vesper, gun-kata) layers in through.
//
// A Fighter reads its identity from here at construction: this.char / charType /
// moveSet (and, as the per-character refactor proceeds, stats / input maps /
// render profile). 'brawler' is defined to reproduce the ORIGINAL behavior
// exactly — adding a character must never change how the brawler plays.
// ─────────────────────────────────────────────────────────────
const CHARACTERS = {
  brawler: {
    id: 'brawler',
    name: 'BRAWLER',
    moves: MOVES,        // the shared MMA moveset (js/moves.js)
    // physical "feel" — the bruiser's values ARE the original CFG constants (so nothing changes).
    // A 2nd character overrides these (e.g. less HP, faster, less-floaty jumps).
    stats: {
      maxHp: CFG.MAX_HP,
      maxStamina: CFG.MAX_STAMINA,
      staminaRegen: CFG.STAMINA_REGEN,
      walkSpeed: CFG.WALK_SPEED,
      runSpeed: CFG.RUN_SPEED,
      jumpVel: CFG.JUMP_VEL,
      jumpDriftFwd: CFG.JUMP_DRIFT_FWD,
      jumpDriftBack: CFG.JUMP_DRIFT_BACK,
      gravity: CFG.GRAVITY,
      backdashSpeed: CFG.BACKDASH_SPEED,
      backdashFrames: CFG.BACKDASH_FRAMES,
      momentumKeep: CFG.MOMENTUM_KEEP,   // fraction of move speed carried into a strike
      driftDecay: 0.92,                  // per-frame decay of that attack-slide
    },
    // input → move name (resolved by the data-driven resolve* helpers in moves.js).
    // dirCat ∈ up|down|forward|back|neutral; `neutral` is the fallback for any unlisted dir.
    neutralMap: {
      punch: { up: 'uppercut', down: 'crouchjab', forward: 'cross', back: 'backfist', neutral: 'jab' },
      kick:  { up: 'axekick', down: 'sweep', forward: 'frontkick', back: 'backkick', neutral: 'legkick' },
    },
    otgKickForward: 'soccer',   // forward+K vs a close DOWNED opponent (OTG) → soccer kick instead of frontkick
    airMap: {
      punch: { down: 'elbowdrop', neutral: 'airpunch' },   // down+P = diving elbow spike; else the air poke
      kick:  { down: 'divekick', neutral: 'jumpkick' },
    },
    dashMap: { punch: 'dashpunch', kick: 'dashkick' },
    // directional super → kind (resolved against the press-time snap; 'neutral' is the fallback
    // for neutral/up/down). The kind drives the superstart behavior + cinematics.
    superMap: { forward: 'beam', back: 'combo', neutral: 'cannon' },
  },
};

// ── VESPER (char #2): gun-kata rushdown glass cannon. ──────────
// Built up across Phase A: A.1 = stats only (she is selectable + feels distinct now); her body
// lands in A.2 (drawFighterVesper) and her real knife/gun moveset in A.3. UNTIL A.3 she borrows
// the brawler's moveset + input maps so she is immediately playable.
// Vesper's gun-kata kit. She inherits the FULL brawler table (aerials/throws/clinch/getup still
// work) and OVERRIDES her ground normals into a DISTINCT, combo-rich moveset:
//   LEAD HAND = KNIFE (all P normals): every knife hit draws a slash line + stacks BLEED (DoT).
//   OFF HAND  = PISTOL (◀P + gun-kata K): point-blank shots that weave INTO strings (knockback,
//               chip, no bleed) — "slash, slash, BANG".
// Every move has a distinct hitbox / damage / PURPOSE (poke, lunge, launcher, buckle, juggle,
// ender) and the cancel trees flow knife → gun → kick. Anims reuse brawler poses for now; the
// knife/pistol props + slash lines + muzzle flash carry the identity (render.js).
const VESPER_MOVES = {
  ...MOVES,
  // ── KNIFE (lead hand, P) — slash lines + BLEED ──
  // i2 range-finder, MULTISLASH: two quick cuts per press, no push, opens everything. bleeds each cut.
  slash: { anim: 'jab', startup: 2, active: 5, recovery: 5, damage: 9, hitstun: 13, blockstun: 7, stamina: 2,
    guard: 'mid', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_LIGHT, weapon: 'knife', bleed: 1, label: 'SLASH',
    hitbox: { x: 22, y: -150, w: 90, h: 30 }, multihit: { times: 2, interval: 2 },
    cancels: ['slash', 'thrust', 'hamstring', 'risingslash', 'pistol', 'gunkick', 'heelshot', 'lowsweep'] },
  // advancing lunge DOUBLE-stab: longest knife reach, closes space, hit-confirm into launcher or a shot.
  thrust: { anim: 'cross', startup: 4, active: 6, recovery: 9, damage: 16, hitstun: 16, blockstun: 10, stamina: 4,
    guard: 'mid', kind: 'punch', kbx: 2.0, hitstop: CFG.HITSTOP_MED, weapon: 'knife', bleed: 1, label: 'THRUST', lungeVx: 6,
    hitbox: { x: 26, y: -150, w: 100, h: 32 }, multihit: { times: 2, interval: 3 },
    cancels: ['risingslash', 'pistol', 'heelshot', 'hamstring', 'upshot'] },
  // upward gut → LAUNCHER (juggle starter). Can flow into a point-blank air shot.
  risingslash: { anim: 'uppercut', startup: 6, active: 5, recovery: 18, damage: 46, hitstun: 0, blockstun: 14, stamina: 10,
    guard: 'mid', kind: 'punch', kbx: 2.0, hitstop: CFG.HITSTOP_ENDER, weapon: 'knife', bleed: 1, label: 'RISING SLASH',
    hitbox: { x: 12, y: -190, w: 58, h: 86 }, launcher: true, launchVy: -13, heavy: true, popsGround: true,
    cancels: ['pistol'] },
  // low slash to the leg → BUCKLE (crumple/kneel): a frozen, fully-hittable guaranteed follow-up.
  // deep cut → 2 bleed. Must be blocked LOW.
  hamstring: { anim: 'crouchjab', startup: 4, active: 3, recovery: 8, damage: 22, hitstun: 14, blockstun: 9, stamina: 4,
    guard: 'low', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_ENDER, crouching: true, weapon: 'knife', bleed: 2, label: 'HAMSTRING',
    hitbox: { x: 16, y: -78, w: 72, h: 30 }, crumple: 'kneel', heavy: true,
    cancels: ['slash', 'thrust', 'pistol', 'risingslash'] },
  // ── PISTOL (off hand, ◀P) — point-blank shot ──
  // gun-kata: short-range muzzle blast woven INTO strings. Knockback + chip, NO bleed. Flows on
  // into more knife/kick so a string reads "slash, slash, BANG, kick".
  pistol: { anim: 'cross', startup: 5, active: 6, recovery: 12, damage: 16, hitstun: 15, blockstun: 11, stamina: 5,
    guard: 'mid', kind: 'punch', kbx: 2.5, hitstop: CFG.HITSTOP_MED, weapon: 'pistol', gun: true, label: 'POINT-BLANK',
    hitbox: { x: 18, y: -152, w: 66, h: 30 }, multihit: { times: 2, interval: 3 }, popsGround: true,
    cancels: ['thrust', 'heelshot', 'hamstring'] },
  // ── GUN-KATA KICKS (K) — off-hand fires on contact ──
  // quick low: the pressure glue (big stun, no push), keeps her turn alive.
  gunkick: { anim: 'legkick', startup: 4, active: 3, recovery: 9, damage: 20, hitstun: 24, blockstun: 8, stamina: 3,
    guard: 'low', kind: 'kick', kbx: 1.0, hitstop: CFG.HITSTOP_MED, gun: true, label: 'GUN KICK', popsGround: true,
    hitbox: { x: 22, y: -95, w: 78, h: 34 },
    cancels: ['gunkick', 'slash', 'hamstring', 'heelshot', 'lowsweep'] },
  // gun-kata roundhouse: mid spacing tool, fires on contact, makes room.
  heelshot: { anim: 'frontkick', startup: 5, active: 4, recovery: 11, damage: 38, hitstun: 17, blockstun: 10, stamina: 4,
    guard: 'mid', kind: 'kick', kbx: 4.5, hitstop: CFG.HITSTOP_MED, gun: true, label: 'HEEL SHOT', popsGround: true,
    hitbox: { x: 30, y: -140, w: 90, h: 36 },
    cancels: ['upshot', 'shotgun', 'lowsweep'] },
  // rising knee-kick → JUGGLE KEEPER (low launch): the air-combo filler. Flow into a shot.
  upshot: { anim: 'knee', startup: 7, active: 3, recovery: 14, damage: 34, hitstun: 0, blockstun: 12, stamina: 7,
    guard: 'mid', kind: 'kick', kbx: 2.0, hitstop: CFG.HITSTOP_MED, gun: true, label: 'UPSHOT',
    hitbox: { x: 12, y: -158, w: 56, h: 66 }, launcher: true, launchVy: -10, popsGround: true,
    cancels: ['pistol'] },
  // ◀K: SHOTGUN BLAST — she PLANTS (no movement), pulls a shotgun and fires a long-range blast,
  // then RACKS it (the spent shell ejects as a physics object). A clean hit SIDE-SPIKES them flat
  // across the stage. Big range + damage, but the long rack recovery is SUPER punishable on whiff.
  shotgun: { anim: 'shotgun', startup: 11, active: 4, recovery: 32, damage: 52, hitstun: 0, blockstun: 18, stamina: 13,
    guard: 'mid', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_ENDER, weapon: 'shotgun', label: 'SHOTGUN',
    hitbox: { x: 16, y: -168, w: 188, h: 78 }, blast: true, sideSpike: true, sideSpikeAir: true, heavy: true, noFlowCancel: true,
    planted: true, rackFrame: 25, bulletArts: false },   // already a gun — no bullet-arts off it
  // low sweep → hard knockdown ender (oki).
  lowsweep: { anim: 'sweep', startup: 6, active: 4, recovery: 19, damage: 36, hitstun: 0, blockstun: 12, stamina: 9,
    guard: 'low', kind: 'kick', kbx: 1.5, hitstop: CFG.HITSTOP_ENDER, crouching: true, gun: true, label: 'SWEEP',
    hitbox: { x: 18, y: -40, w: 92, h: 32 }, knockdown: true, heavy: true, popsGround: true },
};

CHARACTERS.vesper = {
  id: 'vesper',
  name: 'VESPER',
  moves: VESPER_MOVES,
  neutralMap: {
    punch: { up: 'risingslash', down: 'hamstring', forward: 'thrust', back: 'pistol', neutral: 'slash' },
    kick:  { up: 'upshot', down: 'lowsweep', forward: 'heelshot', back: 'shotgun', neutral: 'gunkick' },
  },
  airMap: CHARACTERS.brawler.airMap,                // TEMP — air knife/gun later
  dashMap: CHARACTERS.brawler.dashMap,              // TEMP
  otgKickForward: CHARACTERS.brawler.otgKickForward,
  superMap: { forward: 'tango', back: 'witchtime', neutral: 'climax' },   // her 3 supers (Phase C)
  airDash: true,                                    // rushdown mobility: a mid-air blink (fighter.js air state)
  doubleJump: true,                                 // a second jump in the air
  wallJump: true,                                   // kick off a wall for more air (refreshes double jump + air-dash)
  bulletArts: true,                                 // hold P/K after a connected strike → trailing gunfire (fighter.js)
  // physical feel — the rushdown identity: less HP, faster on the ground, snappier/less-floaty jump.
  stats: {
    maxHp: 820,                                     // glass cannon
    maxStamina: CFG.MAX_STAMINA,
    staminaRegen: CFG.STAMINA_REGEN,
    walkSpeed: CFG.WALK_SPEED * 1.25,               // faster footsteps
    runSpeed: CFG.RUN_SPEED * 1.2,
    jumpVel: CFG.JUMP_VEL * 0.95,                   // slightly lower hop...
    jumpDriftFwd: CFG.JUMP_DRIFT_FWD * 1.15,        // ...with more air control
    jumpDriftBack: CFG.JUMP_DRIFT_BACK * 1.15,
    gravity: CFG.GRAVITY * 1.3,                     // falls harder → far less floaty
    backdashSpeed: CFG.BACKDASH_SPEED * 1.2,        // quick evasive slip
    backdashFrames: CFG.BACKDASH_FRAMES,
    momentumKeep: 1.0,                              // carries her FULL move speed into a strike (vs 0.6)...
    driftDecay: 0.95,                               // ...and the slide bleeds off slower → flows into the next attack
  },
};

// Selectable roster, in character-select order.
const CHAR_ROSTER = ['brawler', 'vesper'];

// resolve the active character for a fighter, tolerant of an id string or a def.
function charDef(c) {
  if (!c) return CHARACTERS.brawler;
  return typeof c === 'string' ? (CHARACTERS[c] || CHARACTERS.brawler) : c;
}
