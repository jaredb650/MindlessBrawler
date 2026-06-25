// ─────────────────────────────────────────────────────────────
// Characters: per-character definitions — the single source of truth for a
// fighter's IDENTITY (moveset, stats, input mapping, render profile, supers).
// The game began as a mirror match (both fighters = the base 'brawler'); this
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
    name: 'MEKA',
    moves: MOVES,        // the shared base moveset (js/moves.js)
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
    // The signature COMBO CHAIN: land the sequence and from link 2 the magnet latches the victim so
    // the rest connects for free → the finish fires at `atChain`. (fighter.js advances it; combat.js
    // magnets + fires the cinematic.) The brawler's jab→cross→uppercut→cross → the magic combo.
    comboChain: ['jab', 'cross', 'uppercut', 'cross'],
    comboFinish: { atChain: 4, kind: 'magiccombo' },
    grunts: ['grunt_1', 'grunt_2'],   // MALE pained grunts — played when HE is the one taking the hit
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
  // neutral-P 1-2-3 REKKA, link 1: a quick STAB. A CONNECTED stab arms link 2 (the arc, → slash2).
  slash: { anim: 'jab', startup: 2, active: 5, recovery: 6, damage: 11, hitstun: 13, blockstun: 7, stamina: 2,
    guard: 'mid', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_LIGHT, weapon: 'knife', bleed: 1, label: 'STAB',
    hitbox: { x: 24, y: -150, w: 96, h: 26 },
    cancels: ['slash', 'slash2', 'thrust', 'hamstring', 'gunkick', 'heelshot', 'rifleburst'] },   // slash2 = rekka link 2; thrust = AERIAL RAVE spine
  // REKKA link 2 (after a connected stab): a forward SEMICIRCLE ARC slash. → slash3 (rekka), or thrust (SHISH KEBAB).
  slash2: { anim: 'slasharc', startup: 4, active: 6, recovery: 10, damage: 15, hitstun: 15, blockstun: 9, stamina: 3,
    guard: 'mid', kind: 'punch', kbx: 1.5, hitstop: CFG.HITSTOP_MED, weapon: 'knife', bleed: 1, chainOnly: true, label: 'ARC SLASH',
    hitbox: { x: 16, y: -172, w: 104, h: 74 },
    cancels: ['slash3', 'thrust', 'risingslash', 'hamstring', 'heelshot'] },
  // REKKA link 3: an UPWARD back-hand cut — big knockback launcher (the rekka ender, knocks them far).
  slash3: { anim: 'slashup', startup: 5, active: 5, recovery: 20, damage: 30, hitstun: 0, blockstun: 13, stamina: 6,
    guard: 'mid', kind: 'punch', kbx: 13, hitstop: CFG.HITSTOP_ENDER, weapon: 'knife', bleed: 1, chainOnly: true, heavy: true,
    launcher: true, launchVy: -13, hitbox: { x: 12, y: -186, w: 70, h: 94 }, label: 'RISING CUT',
    cancels: [] },
  // advancing lunge DOUBLE-stab: longest knife reach, closes space, hit-confirm into launcher or a shot.
  thrust: { anim: 'cross', startup: 4, active: 6, recovery: 9, damage: 16, hitstun: 16, blockstun: 10, stamina: 4,
    guard: 'mid', kind: 'punch', kbx: 2.0, hitstop: CFG.HITSTOP_MED, weapon: 'knife', strikeHand: 'rear', bleed: 1, label: 'THRUST', lungeVx: 6, dashTrail: true,   // trails when the combo magnet dashes her across the ground (slash→thrust)
    hitbox: { x: 26, y: -150, w: 100, h: 32 }, multihit: { times: 2, interval: 3 },
    cancels: ['risingslash', 'pistol', 'heelshot', 'hamstring', 'upshot'] },
  // upward gut → LAUNCHER (juggle starter). Can flow into a point-blank air shot.
  risingslash: { anim: 'uppercut', startup: 6, active: 5, recovery: 18, damage: 46, hitstun: 0, blockstun: 14, stamina: 10,
    guard: 'mid', kind: 'punch', kbx: 2.0, hitstop: CFG.HITSTOP_ENDER, weapon: 'knife', strikeHand: 'rear', bleed: 1, label: 'RISING SLASH',
    hitbox: { x: 12, y: -190, w: 58, h: 86 }, launcher: true, launchVy: -13, heavy: true, popsGround: true,
    cancels: ['pistol', 'risingslash'] },   // rising → rising chains into SKYHOOK
  // low slash to the leg → BUCKLE (crumple/kneel): a frozen, fully-hittable guaranteed follow-up.
  // deep cut → 2 bleed. Must be blocked LOW.
  hamstring: { anim: 'crouchjab', startup: 4, active: 3, recovery: 8, damage: 22, hitstun: 14, blockstun: 9, stamina: 4,
    guard: 'low', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_ENDER, crouching: true, weapon: 'knife', bleed: 2, label: 'HAMSTRING',
    hitbox: { x: 16, y: -78, w: 72, h: 30 }, crumple: 'kneel', heavy: true,
    cancels: ['slash', 'thrust', 'pistol', 'risingslash', 'shotgun'] },   // → pistol = EXECUTION, → shotgun = SKEET
  // ── PISTOL (off hand, ◀P) — point-blank shot ──
  // gun-kata: short-range muzzle blast woven INTO strings. Knockback + chip, NO bleed. Flows on
  // into more knife/kick so a string reads "slash, slash, BANG, kick".
  pistol: { anim: 'pistolaim', startup: 5, active: 4, recovery: 14, damage: 0, hitstun: 0, blockstun: 0, stamina: 5,
    guard: 'mid', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_LIGHT, weapon: 'pistol', gun: true, label: 'PISTOL',
    hitbox: { x: 0, y: -150, w: 0, h: 0 },   // no melee — she fires ONE round downrange (CRUMPLES on hit)
    projectile: 'pistolround', bulletArts: false,
    cancels: ['thrust', 'heelshot', 'hamstring'] },
  // ── GUN-KATA KICKS (K) — off-hand fires on contact ──
  // quick low: the pressure glue (big stun, no push), keeps her turn alive.
  gunkick: { anim: 'legkick', startup: 4, active: 3, recovery: 9, damage: 20, hitstun: 24, blockstun: 8, stamina: 3,
    guard: 'low', kind: 'kick', kbx: 1.0, hitstop: CFG.HITSTOP_MED, gun: true, label: 'GUN KICK', popsGround: true,
    hitbox: { x: 22, y: -95, w: 78, h: 34 }, kickFollow: { kind: 'heelspike', dmg: 26, label: 'HEEL DROP' },   // on hit → front-flip heel spike into the ground
    cancels: ['gunkick', 'slash', 'hamstring', 'heelshot', 'rifleburst'] },
  // forward-K FRONT KICK: mid-range poke. On a CONNECTED hit, press K again → the SIDE KICK ender (a
  // plain 2-hit combo now — the old auto SIDE KICK cinematic is gone).
  heelshot: { anim: 'frontkick', startup: 5, active: 4, recovery: 11, damage: 38, hitstun: 17, blockstun: 10, stamina: 4,
    guard: 'mid', kind: 'kick', kbx: 4.5, hitstop: CFG.HITSTOP_MED, gun: true, label: 'FRONT KICK', popsGround: true,
    hitbox: { x: 30, y: -140, w: 90, h: 36 },
    cancels: ['sidekick', 'upshot', 'shotgun', 'rifleburst'] },
  // 2nd hit of the FRONT KICK combo (front kick → K again): a straight thrusting side kick that
  // shoves them back and knocks down. Ender — no flow cancel, only chains off the front kick.
  sidekick: { anim: 'sidekick', startup: 7, active: 4, recovery: 15, damage: 30, hitstun: 0, blockstun: 14, stamina: 6,
    guard: 'mid', kind: 'kick', kbx: 6.0, hitstop: CFG.HITSTOP_ENDER, label: 'SIDE KICK',
    hitbox: { x: 38, y: -104, w: 96, h: 42 }, knockdown: true, heavy: true, popsGround: true, chainOnly: true, noFlowCancel: true },
  // ↑K UPSHOT: a rising knee that LAUNCHES grounded foes, PLUS an UZI BURST sprayed in an arc
  // overhead — the anti-air that shreds anyone already in the air (the AR rounds juggle).
  upshot: { anim: 'upuzi', startup: 7, active: 3, recovery: 16, damage: 34, hitstun: 0, blockstun: 12, stamina: 8,
    guard: 'mid', kind: 'kick', kbx: 2.0, hitstop: CFG.HITSTOP_MED, gun: true, label: 'UPSHOT',
    hitbox: { x: 12, y: -158, w: 56, h: 66 }, launcher: true, launchVy: -10, popsGround: true,
    burst: { count: 8, vertical: true, driftX: 2, speed: 19, interval: 2, move: 'ar', sfx: 'uzi_burst' },   // streamed STRAIGHT UP → a vertical line/trail (the AR rounds juggle airborne foes)
    cancels: ['pistol'] },
  // ◀K: SHOTGUN BLAST — she PLANTS (no movement), pulls a shotgun and fires a long-range blast,
  // then RACKS it (the spent shell ejects as a physics object). A clean hit SIDE-SPIKES them flat
  // across the stage. Big range + damage, but the long rack recovery is SUPER punishable on whiff.
  shotgun: { anim: 'shotgun', startup: 11, active: 4, recovery: 32, damage: 52, hitstun: 0, blockstun: 18, stamina: 13,
    guard: 'mid', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_ENDER, weapon: 'shotgun', label: 'SHOTGUN',
    hitbox: { x: 16, y: -168, w: 188, h: 78 }, blast: true, sideSpike: true, sideSpikeAir: true, heavy: true, noFlowCancel: true,
    planted: true, rackFrame: 25, bulletArts: false, fireSfx: 'shotgun_blast', gib: true },   // a shotgun KO GIBS the head
  // low sweep → hard knockdown ender (oki). [still defined for combo refs; ↓K now = rifleburst]
  lowsweep: { anim: 'sweep', startup: 6, active: 4, recovery: 19, damage: 36, hitstun: 0, blockstun: 12, stamina: 9,
    guard: 'low', kind: 'kick', kbx: 1.5, hitstop: CFG.HITSTOP_ENDER, crouching: true, label: 'SWEEP',
    hitbox: { x: 18, y: -40, w: 92, h: 32 }, knockdown: true, heavy: true, popsGround: true },
  // ↓K ASSAULT RIFLE: she PLANTS, pulls a rifle and fires a 3-round BURST downrange — damaging
  // rounds that JUGGLE (launch) on hit. No movement; the burst (not a melee) does the work.
  rifleburst: { anim: 'rifleaim', startup: 9, active: 4, recovery: 22, damage: 0, hitstun: 0, blockstun: 14, stamina: 11,
    guard: 'mid', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_MED, weapon: 'rifle', crouching: true, label: 'RIFLE',
    hitbox: { x: 0, y: -150, w: 0, h: 0 }, planted: true, bulletArts: false,
    projectile: 'rifleround', cancels: [] },   // fires ONE big fast round from the crouch
  // ── AIR (knife + gun) ──
  // neutral air P: a basic air knife.
  airslash: { anim: 'airpunch', startup: 4, active: 999, recovery: 0, damage: 16, hitstun: 16, blockstun: 9, stamina: 3,
    guard: 'high', kind: 'punch', kbx: 1.5, hitstop: CFG.HITSTOP_LIGHT, air: true, weapon: 'knife', bleed: 1,
    hitbox: { x: 16, y: -80, w: 62, h: 46 }, popsGround: true, label: 'AIR SLASH' },
  // air ▶P: TELE-SLASH — a fast forward BLINK-slash (iaido). On hit → a stun-burst slash combo.
  teleslash: { anim: 'airpunch', startup: 3, active: 999, recovery: 0, damage: 18, hitstun: 0, blockstun: 12, stamina: 8,
    guard: 'high', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_MED, air: true, weapon: 'knife', bleed: 1,
    hitbox: { x: 6, y: -130, w: 98, h: 98 }, dive: { vx: 30, vy: -1 }, dashTrail: true,
    slashCombo: { hits: 2, launchVy: -13, style: 'iaido', label: 'IAIDO' }, label: 'TELE-SLASH' },
  // air ▶K: AIR UZI — sprays an uzi burst out in front of her.
  airuzi: { anim: 'airuzi', startup: 4, active: 999, recovery: 0, damage: 0, hitstun: 0, blockstun: 6, stamina: 4,
    guard: 'high', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_LIGHT, air: true, gun: true,
    hitbox: { x: 0, y: 0, w: 0, h: 0 }, burst: { count: 5, speed: 22, up: 0, interval: 2, move: 'uzi', sfx: 'uzi_burst' }, label: 'AIR UZI' },   // streamed STRAIGHT FORWARD → a horizontal line/trail, not a fan
  // air ↓K: AIR SPIKE — a downward knife slash (NO dive, she keeps her arc); SPIKES foes from above.
  airspike: { anim: 'divekick', startup: 5, active: 999, recovery: 0, damage: 32, hitstun: 0, blockstun: 12, stamina: 6,
    guard: 'high', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_ENDER, air: true, weapon: 'knife', bleed: 1,
    hitbox: { x: 8, y: -50, w: 78, h: 98 }, spike: CFG.AXEKICK_SPIKE_VY, label: 'AIR SPIKE' },
  // air ↑P: AERIAL UPSLASH — a knife arc sweeping a SEMICIRCLE over her head; juggles foes UP.
  // phased hitbox sweeps back-of-head → straight overhead → down-front to read as the arc.
  aerupslash: { anim: 'aerupslash', startup: 4, active: 999, recovery: 0, damage: 24, hitstun: 0, blockstun: 10, stamina: 5,
    guard: 'high', kind: 'punch', kbx: 2, hitstop: CFG.HITSTOP_MED, air: true, weapon: 'knife', bleed: 1,
    launcher: true, launchVy: -16, popsGround: true, airHitCap: 8,
    hitbox: [
      { t0: 3, t1: 7, x: -36, y: -150, w: 52, h: 56 },     // back-of-head
      { t0: 7, t1: 11, x: -16, y: -212, w: 62, h: 58 },    // straight overhead
      { t0: 11, t1: 15, x: 14, y: -212, w: 64, h: 58 },    // over and forward
      { t0: 15, t1: 20, x: 36, y: -150, w: 52, h: 56 },    // down-front
    ], label: 'AIR UPSLASH' },
  // air ↑K: SCISSOR KICK — flips upside-down and kicks UP; a clean connect = a command grab into the
  // SCISSOR TAKEDOWN cinematic (she holds airborne, throws them down into a spike).
  scissorkick: { anim: 'scissorkick', startup: 4, active: 999, recovery: 0, damage: 18, hitstun: 0, blockstun: 10, stamina: 7,
    guard: 'high', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_MED, air: true, dive: { vx: 2, vy: -10 },   // extra vertical POP — vy NEGATIVE = up in this engine
    hitbox: { x: 4, y: -176, w: 62, h: 116 }, scissorGrab: { label: 'SCISSOR TAKEDOWN' }, label: 'SCISSOR KICK' },
  // air ↓P: DIVE GRAB — a diving knife; on hit it COMMAND-GRABS into a TRIPLE SLASH (3rd launches).
  elbowdrop: { anim: 'elbowdrop', startup: 3, active: 999, recovery: 0, damage: 18, hitstun: 0, blockstun: 13, stamina: 6,
    guard: 'high', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_MED, air: true, weapon: 'knife', bleed: 1,
    hitbox: { x: 12, y: -44, w: 64, h: 60 }, dive: { vx: CFG.ELBOWDROP_VX, vy: CFG.ELBOWDROP_VY },
    slashCombo: { hits: 3, launchVy: -14, style: 'triple', label: 'TRIPLE SLASH' }, label: 'DIVE GRAB' },
  // run+↓: SLIDE — on contact, a RISING DOUBLE SLASH whose 2nd hit launches HIGH (juggle setup).
  slidetackle: { anim: 'slidetackle', startup: 4, active: 10, recovery: 16, damage: 24, hitstun: 0, blockstun: 12, stamina: 8,
    guard: 'low', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_MED, hitbox: { x: 18, y: -46, w: 96, h: 46 },
    slide: true, heavy: true, slashCombo: { hits: 2, launchVy: -17, style: 'rising', label: 'RISING SLASH' }, label: 'SLIDE' },
};

CHARACTERS.vesper = {
  id: 'vesper',
  name: 'ANDROMEDA',   // display name (internal id stays 'vesper' so all sprite mappings + code keep working)
  moves: VESPER_MOVES,
  neutralMap: {
    punch: { up: 'risingslash', down: 'hamstring', forward: 'thrust', back: 'pistol', neutral: 'slash' },
    kick:  { up: 'upshot', down: 'rifleburst', forward: 'heelshot', back: 'shotgun', neutral: 'gunkick' },
  },
  airMap: {
    punch: { up: 'aerupslash', forward: 'teleslash', down: 'elbowdrop', neutral: 'airslash' },   // ↑=overhead arc juggle, ▶=blink slash, ↓=dive grab combo
    kick:  { up: 'scissorkick', forward: 'airuzi', down: 'airspike', neutral: 'jumpkick' },       // ↑=scissor takedown, ▶=uzi spray, ↓=downward spike
  },
  dashMap: CHARACTERS.brawler.dashMap,              // TEMP
  otgKickForward: CHARACTERS.brawler.otgKickForward,
  superMap: { forward: 'tango', back: 'witchtime', neutral: 'climax' },   // her 3 supers (Phase C)
  // Vesper's signature chain: slash → thrust → rising slash (land 2 cuts → the launcher is magnet-
  // guaranteed → the AERIAL RAVE cinematic). Earned + inescapable, exactly like the brawler's.
  // MULTIPLE signature chains (tracked simultaneously — a token can belong to several at once).
  comboChains: [
    // slash → thrust → rising slash = the AERIAL RAVE flurry (her bread-and-butter)
    { sequence: ['slash', 'thrust', 'risingslash'], finish: { atChain: 3, kind: 'slashcombo', opts: { hits: 3, launchVy: -14, aerial: true, style: 'rave', label: 'AERIAL RAVE' } } },
    // rising slash → rising slash = SKYHOOK: a bigger upslash that drags them DIRECTLY ABOVE her (→ up-uzi)
    { sequence: ['risingslash', 'risingslash'], finish: { atChain: 2, kind: 'slashcombo', opts: { hits: 2, launchVy: -25, aerial: true, overhead: true, style: 'skyhook', label: 'SKYHOOK' } } },
    // STAB → ARC → thrust = SHISH KEBAB: the thrust magnetically carries them into the wall and PINS them
    { sequence: ['slash', 'slash2', 'thrust'], finish: { atChain: 3, kind: 'kebab', opts: { label: 'SHISH KEBAB' } } },
    // thrust → hamstring (kneel) → pistol = EXECUTION: steps back, 3 shots, last one side-spikes into the wall
    { sequence: ['thrust', 'hamstring', 'pistol'], finish: { atChain: 3, kind: 'execution', opts: { label: 'EXECUTION' } } },
    // thrust → hamstring → shotgun (back-K) = SKEET: kicks him up, blasts him airborne
    { sequence: ['thrust', 'hamstring', 'shotgun'], finish: { atChain: 3, kind: 'skeet', opts: { label: 'SKEET' } } },
  ],
  rekka: { trigger: 'slash', steps: ['slash', 'slash2', 'slash3'] },   // neutral-P 1-2-3 same-button string
  grunts: ['fgrunt_1', 'fgrunt_2', 'fgrunt_3'],     // FEMALE grunts — her voice, played when SHE is the one taking the hit
  dmgMult: 1.55,                                     // rushdown glass cannon: every hit lands ~55% harder (she trades HP for damage)
  dmgScalePerHit: 0.07,                              // gentler combo decay than the 0.10 default (her strings stay meaty)
  minDmgScale: 0.55,                                 // ...and a much higher floor (0.55 vs 0.35) so her LONG juggles keep hurting
  meterMult: 3.0,                                    // her specials are weaker / whiff more → her meter fills 3x faster
  comboMagnet: true,                                // EXCLUSIVE: her confirmed punch chain latches/dashes her to the victim (the rushdown "teleport"). Other chars chain without the glide.
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

// ── XAMORA (char #3): winged bo-staff HEAVY ZONER. v1 reskins the brawler body (taller + wings + staff);
// disjointed long-reach staff (P) + magic (K). Slow, tanky, big damage. Poses borrow brawler anims for now.
const XAMORA_MOVES = {
  ...MOVES,
  // ── STAFF (P) — long disjoint reach, swats them back ──
  // neutral-P STAFF SWAT rekka, link 1: a horizontal staff SWING (swats them back).
  staffswat: { anim: 'staffswing', startup: 6, active: 5, recovery: 12, damage: 20, hitstun: 16, blockstun: 11, stamina: 3,
    guard: 'mid', kind: 'punch', kbx: 6, hitstop: CFG.HITSTOP_MED, weapon: 'staff', label: 'STAFF SWAT',
    hitbox: { x: 28, y: -142, w: 214, h: 44 }, cancels: ['staffswat2', 'extendthrust', 'risingpole', 'staffsweep', 'vacuum', 'tremor'] },
  // REKKA link 2: a rapid TRIPLE machine-gun spear thrust (chest level, extended reach).
  staffswat2: { anim: 'staffthrust', startup: 5, active: 3, recovery: 14, damage: 12, hitstun: 14, blockstun: 9, stamina: 4,
    guard: 'mid', kind: 'punch', kbx: 1, hitstop: CFG.HITSTOP_LIGHT, weapon: 'staff', chainOnly: true, label: 'SPEAR FLURRY',
    hitbox: { x: 34, y: -118, w: 216, h: 34 }, multihit: { times: 3, interval: 3 }, cancels: ['staffswat3'] },
  // REKKA link 3: a spinning RING SMASH — long, INTERRUPTIBLE load, then a SIDE-SPIKE across the stage.
  staffswat3: { anim: 'staffspin', startup: 22, active: 6, recovery: 26, damage: 48, hitstun: 0, blockstun: 18, stamina: 9,
    guard: 'mid', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_ENDER, weapon: 'staff', chainOnly: true, heavy: true, blast: true, sideSpike: true, sideSpikeAir: true, noFlowCancel: true, armor: 2, label: 'RING SMASH',
    hitbox: { x: 20, y: -168, w: 250, h: 168 }, cancels: [] },   // RING SMASH — a big, far-reaching arc
  extendthrust: { anim: 'staffthrust', startup: 11, active: 6, recovery: 20, damage: 32, hitstun: 18, blockstun: 13, stamina: 6,
    guard: 'mid', kind: 'punch', kbx: 10, hitstop: CFG.HITSTOP_ENDER, weapon: 'staff', heavy: true, tipSpot: 200, label: 'EXTEND THRUST',
    hitbox: { x: 34, y: -118, w: 292, h: 30 }, lungeVx: 4, cancels: [] },   // EXTENDS to near-fullscreen; a TIP sweet-spot explodes + winds them (no stamina on wakeup)
  // forward-K SPEAR RUSH: a rapid 3-hit spear thrust that lunges in — the first two stabs pin them, the
  // THIRD launches into a juggle (her new forward-K, the freed tremor slot). Reuses the multihit launcher path.
  spearrush: { anim: 'staffthrust', startup: 9, active: 14, recovery: 18, damage: 13, hitstun: 12, blockstun: 11, stamina: 8,
    guard: 'mid', kind: 'kick', kbx: 2, hitstop: CFG.HITSTOP_MED, weapon: 'staff', multihit: { times: 3, interval: 4 }, launcher: true, launchVy: -14, lungeVx: 4, label: 'SPEAR RUSH',
    hitbox: { x: 32, y: -128, w: 212, h: 86 }, cancels: [] },
  // up-P RISING POLE: a low→high upward sweep (melee launcher) that ALSO sends a SHOCKWAVE rolling forward
  // (a tremor-clone projectile) — the staff tip ablaze. A self-contained zoner+anti-air signature.
  risingpole: { anim: 'staffrise', startup: 8, active: 5, recovery: 22, damage: 32, hitstun: 0, blockstun: 13, stamina: 6,
    guard: 'mid', kind: 'punch', kbx: 3, hitstop: CFG.HITSTOP_ENDER, weapon: 'staff', launcher: true, launchVy: -14, heavy: true, popsGround: true, projectile: 'shockwave', label: 'RISING POLE',
    hitbox: { x: 18, y: -200, w: 130, h: 130 }, cancels: [] },   // a low→high upward sweep (extended forward) that knocks them airborne
  staffsweep: { anim: 'staffsweeplow', startup: 7, active: 5, recovery: 18, damage: 22, hitstun: 0, blockstun: 12, stamina: 5,
    guard: 'low', kind: 'kick', kbx: 4, hitstop: CFG.HITSTOP_ENDER, weapon: 'staff', launcher: true, launchVy: -9, heavy: true, label: 'STAFF SWEEP',
    hitbox: { x: 24, y: -38, w: 150, h: 32 }, cancels: [] },   // low sweep that TUMBLES them up (combo starter)
  // CRESCENT SLAM = her FALCON PUNCH: huge charged windup, the world STOPS on contact, ground erupts like a
  // wall-spike, DIRECT hit = devastating slam + sky-high bounce; a WHIFF erupts the ground (AoE knockback).
  crescentslam: { anim: 'staffslam', startup: 20, active: 6, recovery: 32, damage: 62, hitstun: 0, blockstun: 22, stamina: 12,
    guard: 'high', kind: 'punch', kbx: 6, hitstop: 30, weapon: 'staff', heavy: true, crescentSlam: true, guardBreak: true, popsGround: true, noFlowCancel: true, armor: 1, label: 'CRESCENT SLAM',
    hitbox: { x: 22, y: -150, w: 178, h: 176 }, cancels: [] },   // overhead staff slam — long reach, the reaction owns the slam
  // ── MAGIC (K) — zoning orbs/shockwaves + close AoE ──
  // neutral-K VACUUM: casts a slow orb that YANKS the foe toward her on contact — her GAP-CLOSER. A slow
  // heavy zoner's "get over here": pull them out of neutral into Talon Snatch / Crescent Slam range.
  vacuum: { anim: 'cross', startup: 12, active: 4, recovery: 22, damage: 0, hitstun: 0, blockstun: 0, stamina: 6,
    guard: 'mid', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_LIGHT, gun: true, label: 'VACUUM', hitbox: { x: 0, y: -150, w: 0, h: 0 },
    projectile: 'vacuum', cancels: ['staffswat', 'tremor'] },
  tremor: { anim: 'sweep', startup: 12, active: 4, recovery: 22, damage: 0, hitstun: 0, blockstun: 0, stamina: 6,
    guard: 'low', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_LIGHT, label: 'TREMOR', hitbox: { x: 0, y: -40, w: 0, h: 0 },
    projectile: 'tremor', planted: true, cancels: [] },
  skypillar: { anim: 'staffvert', startup: 9, active: 6, recovery: 20, damage: 22, hitstun: 0, blockstun: 12, stamina: 6,
    guard: 'mid', kind: 'kick', kbx: 2, hitstop: CFG.HITSTOP_ENDER, weapon: 'staff', launcher: true, launchVy: -14, label: 'SKYPILLAR',
    hitbox: { x: 6, y: -380, w: 64, h: 330 }, cancels: [] },   // staff held VERTICAL, extends straight into the sky — a TALL anti-air column
  // down-K LANTERN: PLANTS a hovering trap-orb in front of her that detonates on contact (pops them up into
  // her juggle/grab). Space control, recovery cover, oki — the zoning-with-teeth tool. (Replaces ward burst.)
  lantern: { anim: 'sweep', startup: 14, active: 4, recovery: 24, damage: 0, hitstun: 0, blockstun: 0, stamina: 7,
    guard: 'mid', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_LIGHT, label: 'LANTERN', hitbox: { x: 0, y: -40, w: 0, h: 0 },
    projectile: 'lantern', planted: true, cancels: [] },
  smite: { anim: 'overhand', startup: 18, active: 6, recovery: 28, damage: 44, hitstun: 0, blockstun: 16, stamina: 10,
    guard: 'high', kind: 'punch', kbx: 5, hitstop: CFG.HITSTOP_ENDER, heavy: true, electrocute: true, armor: 1, noFlowCancel: true, label: 'SMITE',
    hitbox: { x: 60, y: -190, w: 130, h: 200 }, cancels: [] },   // mid-range AoE blast → ELECTROCUTES (stuns in place, hittable seize)
  // ── AIR ──
  airstaff: { anim: 'airpunch', startup: 5, active: 999, recovery: 0, damage: 20, hitstun: 16, blockstun: 10, stamina: 4,
    guard: 'high', kind: 'punch', kbx: 3, hitstop: CFG.HITSTOP_MED, air: true, weapon: 'staff', label: 'AIR STAFF',
    hitbox: { x: 20, y: -90, w: 120, h: 50 } },
  meteorstaff: { anim: 'divekick', startup: 6, active: 999, recovery: 0, damage: 34, hitstun: 0, blockstun: 14, stamina: 6,
    guard: 'high', kind: 'punch', kbx: 0, hitstop: CFG.HITSTOP_ENDER, air: true, weapon: 'staff', spike: CFG.ELBOWDROP_SPIKE_VY, label: 'METEOR STAFF',
    hitbox: { x: 6, y: -40, w: 90, h: 120 } },
  fallingstar: { anim: 'jumpkick', startup: 6, active: 4, recovery: 0, damage: 0, hitstun: 0, blockstun: 0, stamina: 4,
    guard: 'high', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_LIGHT, air: true, gun: true, label: 'FALLING STAR',
    hitbox: { x: 0, y: 0, w: 0, h: 0 }, projectile: 'wispdown' },
  // air ↑P WING BEAT: a wide horizontal wing+staff sweep — her AIR-TO-AIR. Beats other air approaches, juggles UP.
  wingbeat: { anim: 'staffswing', startup: 5, active: 999, recovery: 0, damage: 24, hitstun: 0, blockstun: 12, stamina: 6,
    guard: 'high', kind: 'punch', kbx: 2, hitstop: CFG.HITSTOP_MED, air: true, weapon: 'staff',
    launcher: true, launchVy: -14, popsGround: true, airHitCap: 5,   // one extra lift past the default 3 (bounded to 1 wingbeat/airtime by usedAirAttack)
    hitbox: { x: -34, y: -150, w: 156, h: 84 }, label: 'WING BEAT' },
  // air ▶P GLIDE POKE: a long forward staff jab thrown from a hover/glide — disjoint hover pressure (in/out game).
  glidepoke: { anim: 'staffthrust', startup: 6, active: 999, recovery: 0, damage: 20, hitstun: 16, blockstun: 10, stamina: 4,
    guard: 'high', kind: 'punch', kbx: 3, hitstop: CFG.HITSTOP_MED, air: true, weapon: 'staff',
    hitbox: { x: 30, y: -104, w: 158, h: 44 }, label: 'GLIDE POKE' },
  // air ↓K DIVE BOMB: a committed ANGLED winged dive (dive vx forward + steep vy) that SPIKES grounded foes.
  divebomb: { anim: 'divekick', startup: 5, active: 999, recovery: 0, damage: 36, hitstun: 0, blockstun: 14, stamina: 7,
    guard: 'high', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_ENDER, air: true, weapon: 'staff',
    dive: { vx: 6, vy: 17 }, spike: CFG.ELBOWDROP_SPIKE_VY,
    hitbox: { x: 6, y: -40, w: 96, h: 130 }, label: 'DIVE BOMB' },
  // air ↑K SKY TALON: the AIR command grab — snatches a jumping foe and HURLS them into the ground (the winged
  // predator's answer to people escaping her UP). Clean connect → the SKY TALON cinematic.
  skytalon: { anim: 'airpunch', startup: 5, active: 999, recovery: 0, damage: 16, hitstun: 0, blockstun: 10, stamina: 7,
    guard: 'high', kind: 'kick', kbx: 0, hitstop: CFG.HITSTOP_MED, air: true,
    hitbox: { x: 0, y: -172, w: 84, h: 150 }, skyTalon: { label: 'SKY TALON' }, label: 'SKY TALON' },
};

CHARACTERS.xamora = {
  id: 'xamora',
  name: 'XAMORA',
  moves: XAMORA_MOVES,
  neutralMap: {
    punch: { up: 'risingpole', down: 'staffsweep', forward: 'extendthrust', back: 'crescentslam', neutral: 'staffswat' },
    kick:  { up: 'skypillar', down: 'lantern', forward: 'spearrush', back: 'smite', neutral: 'vacuum' },   // forward-K = SPEAR RUSH (3-hit thrust → launch)
  },
  airMap: {
    punch: { up: 'wingbeat', forward: 'glidepoke', down: 'meteorstaff', neutral: 'airstaff' },
    kick:  { up: 'skytalon', down: 'divebomb', neutral: 'fallingstar' },
  },
  dashMap: CHARACTERS.brawler.dashMap,                 // TEMP
  otgKickForward: CHARACTERS.brawler.otgKickForward,
  superMap: { forward: 'wrath', back: 'wrath', neutral: 'wrath' },   // WRATH OF GOD — her signature meteor-storm super
  rekka: { trigger: 'staffswat', steps: ['staffswat', 'staffswat2', 'staffswat3'] },   // neutral-P: swing → spear flurry → ring smash
  dmgMult: 1.6,                                          // the HEAVY: she out-damages everyone strike-for-strike (the trade for being slow)
  doubleJump: true,
  glide: true,                                          // wings: hold JUMP while falling → slow-fall glide
  grunts: ['fgrunt_1', 'fgrunt_2', 'fgrunt_3'],
  stats: {
    maxHp: 1200,                                        // tanky (vs 1000 brawler / 820 Vesper)
    maxStamina: CFG.MAX_STAMINA,
    staminaRegen: CFG.STAMINA_REGEN,
    walkSpeed: CFG.WALK_SPEED * 0.82,                   // slow + deliberate
    runSpeed: CFG.RUN_SPEED * 0.82,
    jumpVel: CFG.JUMP_VEL * 1.3,                        // the CHARGED high jump — explodes upward
    jumpDriftFwd: CFG.JUMP_DRIFT_FWD,
    jumpDriftBack: CFG.JUMP_DRIFT_BACK,
    gravity: CFG.GRAVITY * 1.15,                        // heavy fall (the glide negates it on hold)
    backdashSpeed: CFG.BACKDASH_SPEED * 0.9,
    backdashFrames: CFG.BACKDASH_FRAMES,
    momentumKeep: CFG.MOMENTUM_KEEP * 0.7,              // big body, less carried momentum
    driftDecay: 0.9,
    prejumpFrames: 8,                                   // the LONGER load before the high jump
  },
};

// Selectable roster, in character-select order.
const CHAR_ROSTER = ['brawler', 'vesper', 'xamora'];

// resolve the active character for a fighter, tolerant of an id string or a def.
function charDef(c) {
  if (!c) return CHARACTERS.brawler;
  return typeof c === 'string' ? (CHARACTERS[c] || CHARACTERS.brawler) : c;
}

// Normalize a character's combo chains into a list of { sequence, finish }. Back-compat:
// a char with the legacy single comboChain/comboFinish wraps into a 1-element list (the brawler
// stays byte-identical); a char with comboChains uses it directly (Vesper's multiple chains).
function comboChainsOf(char) {
  if (char.comboChains) return char.comboChains;
  if (char.comboChain) return [{ sequence: char.comboChain, finish: char.comboFinish }];
  return [];
}
