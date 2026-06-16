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
// Vesper inherits the FULL brawler table (so aerials/throws/clinch/getup all still work) and
// OVERRIDES her ground normals: faster startups, lower damage (glass cannon), a `weapon` prop
// (knife on P, pistol on K) and a `label` for the kill-feed. Anims reuse the brawler poses for
// now (a slash animates like a punch with a knife in hand); her own poses can come later.
const VESPER_MOVES = {
  ...MOVES,
  // ── KNIFE (P) ──
  slash: { anim: 'jab', startup: 2, active: 3, recovery: 5, damage: 22, hitstun: 15, blockstun: 9, stamina: 2,
    guard: 'mid', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_LIGHT, weapon: 'knife', label: 'SLASH',
    hitbox: { x: 24, y: -150, w: 92, h: 32 },
    cancels: ['slash', 'thrust', 'hamstring', 'risingslash', 'heelshot', 'lowsweep'] },
  thrust: { anim: 'cross', startup: 4, active: 3, recovery: 8, damage: 38, hitstun: 18, blockstun: 11, stamina: 4,
    guard: 'mid', kind: 'punch', kbx: 2.5, hitstop: CFG.HITSTOP_MED, weapon: 'knife', label: 'THRUST', lungeVx: 4,
    hitbox: { x: 24, y: -150, w: 90, h: 34 },
    cancels: ['risingslash', 'reverseslash', 'heelshot', 'hamstring'] },
  risingslash: { anim: 'uppercut', startup: 6, active: 5, recovery: 19, damage: 58, hitstun: 0, blockstun: 14, stamina: 11,
    guard: 'mid', kind: 'punch', kbx: 2.0, hitstop: CFG.HITSTOP_ENDER, weapon: 'knife', label: 'RISING SLASH',
    hitbox: { x: 12, y: -185, w: 56, h: 80 }, launcher: true, launchVy: -13, heavy: true, popsGround: true },
  reverseslash: { anim: 'backfist', startup: 8, active: 4, recovery: 15, damage: 50, hitstun: 22, blockstun: 13, stamina: 8,
    guard: 'mid', kind: 'punch', kbx: 4.5, hitstop: CFG.HITSTOP_MED, weapon: 'knife', label: 'REVERSE SLASH', lungeVx: 5,
    hitbox: { x: 26, y: -158, w: 90, h: 40 }, heavy: true, popsGround: true,
    cancels: ['heelshot', 'lowsweep'] },
  hamstring: { anim: 'crouchjab', startup: 3, active: 3, recovery: 6, damage: 18, hitstun: 14, blockstun: 8, stamina: 2,
    guard: 'low', kind: 'punch', kbx: 1.0, hitstop: CFG.HITSTOP_LIGHT, crouching: true, weapon: 'knife', label: 'HAMSTRING',
    hitbox: { x: 16, y: -95, w: 66, h: 30 },
    cancels: ['hamstring', 'slash', 'thrust', 'lowsweep'] },
  // ── GUN-KATA (K) ──
  gunkick: { anim: 'legkick', startup: 4, active: 3, recovery: 9, damage: 30, hitstun: 22, blockstun: 8, stamina: 3,
    guard: 'low', kind: 'kick', kbx: 1.0, hitstop: CFG.HITSTOP_MED, weapon: 'pistol', label: 'GUN KICK', popsGround: true,
    hitbox: { x: 22, y: -95, w: 76, h: 34 },
    cancels: ['gunkick', 'lowsweep', 'heelshot'] },
  heelshot: { anim: 'frontkick', startup: 5, active: 4, recovery: 10, damage: 42, hitstun: 17, blockstun: 10, stamina: 4,
    guard: 'mid', kind: 'kick', kbx: 4.0, hitstop: CFG.HITSTOP_MED, weapon: 'pistol', label: 'HEEL SHOT', popsGround: true,
    hitbox: { x: 30, y: -140, w: 86, h: 36 },
    cancels: ['upshot', 'lowsweep'] },
  upshot: { anim: 'axekick', startup: 11, active: 6, recovery: 16, damage: 60, hitstun: 0, blockstun: 16, stamina: 10,
    guard: 'high', kind: 'kick', kbx: 3.0, hitstop: CFG.HITSTOP_ENDER, weapon: 'pistol', label: 'UPSHOT',
    hitbox: { x: 20, y: -190, w: 58, h: 90 }, knockdown: true, heavy: true, popsGround: true, noFlowCancel: true },
  pirouette: { anim: 'backkick', startup: 11, active: 4, recovery: 24, damage: 70, hitstun: 0, blockstun: 16, stamina: 11,
    guard: 'mid', kind: 'kick', kbx: 6.0, hitstop: CFG.HITSTOP_ENDER, weapon: 'pistol', label: 'PIROUETTE',
    hitbox: { x: 24, y: -150, w: 95, h: 45 }, lungeVx: 7, heavy: true, popsGround: true, blast: true, sideSpikeAir: true, noFlowCancel: true },
  lowsweep: { anim: 'sweep', startup: 6, active: 4, recovery: 19, damage: 45, hitstun: 0, blockstun: 12, stamina: 9,
    guard: 'low', kind: 'kick', kbx: 1.5, hitstop: CFG.HITSTOP_ENDER, crouching: true, weapon: 'pistol', label: 'SWEEP',
    hitbox: { x: 18, y: -40, w: 90, h: 32 }, knockdown: true, heavy: true, popsGround: true },
};

CHARACTERS.vesper = {
  id: 'vesper',
  name: 'VESPER',
  moves: VESPER_MOVES,
  neutralMap: {
    punch: { up: 'risingslash', down: 'hamstring', forward: 'thrust', back: 'reverseslash', neutral: 'slash' },
    kick:  { up: 'upshot', down: 'lowsweep', forward: 'heelshot', back: 'pirouette', neutral: 'gunkick' },
  },
  airMap: CHARACTERS.brawler.airMap,                // TEMP — air knife/gun later
  dashMap: CHARACTERS.brawler.dashMap,              // TEMP
  otgKickForward: CHARACTERS.brawler.otgKickForward,
  superMap: CHARACTERS.brawler.superMap,            // TEMP until Phase C (her own supers)
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
