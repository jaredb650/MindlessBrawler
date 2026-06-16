// ─────────────────────────────────────────────────────────────
// Fighter: the state machine. One instance per player.
//
// Sprite-swap contract: a fighter is always in exactly one state,
// with `f` = frames elapsed in that state, and `animKey()` returning
// the animation name (state name, or the move's anim during attacks).
// A future sprite renderer keys off (animKey, f) and nothing else —
// all the logic below stays untouched.
//
// States:
//   idle walk run backdash crouch prejump air airattack land
//   attack blockstun hitstun parried launched fallheavy downed getup
//   gassed superstart
//   clinchgrab clinch clinched
//   backroll kipup
//   slipcounter countered
//   wakeuproll
//   wallsplat slip
//   crumple                         (shared body-shot/kneel stun — stand vs kneel by crumpleKind)
//   suplexthrow suplexed gpmount gpmounted crumpled   (canned-cinematic bodies — sequencer-driven no-ops)
// (dashpunch/dashkick are moves that run in the 'attack' state — see moves.js)
// ─────────────────────────────────────────────────────────────

// Entering any of these means the defender escaped — combo bookkeeping resets.
const NEUTRAL_RESET = new Set(['idle', 'walk', 'crouch', 'run', 'blockstun', 'getup', 'downed', 'backroll', 'kipup', 'wakeuproll']);

// Impact states that flash the body white on ENTRY (the universal contact flash). Covers
// the DIRECT setState('fallheavy'/'wallsplat') knockdown / throw-slam / suplex / wall-impact
// paths that bypass the receive* funnels. Block/crumple flash from their own funnels.
const FLASH_ON_ENTER = new Set(['hitstun', 'launched', 'fallheavy', 'wallsplat']);

// States where this.move stays live (everything else clears it on entry).
const MOVE_STATES = new Set(['attack', 'airattack', 'flyattack']);

// GROUNDED-LEAP ARC (shared): height above the floor for a move that stays in the
// `attack` state but visually leaves the ground (gazelleHop). One smooth parabola
// rises to mv.gazelleHop.apex by the end of [startup+active], then eases back to 0
// over recovery so the body is grounded again before endMove. NOT an air state —
// the caller offsets this.y by this and the end-of-update floor-clamp skips it.
function groundLeapY(f, mv) {
  const h = mv.gazelleHop;
  if (!h) return 0;
  const rise = mv.startup + mv.active;
  const total = rise + mv.recovery;
  if (f <= 0 || f >= total) return 0;
  if (f <= rise) return Math.sin((f / rise) * (Math.PI / 2)) * h.apex;   // 0 → apex (up the lift+swing)
  return Math.cos(((f - rise) / Math.max(1, mv.recovery)) * (Math.PI / 2)) * h.apex;   // apex → 0 (settle through recovery)
}

// Execution window: they're gassed, nearly dead, and you're close enough.
function canExecute(att, opp) {
  return opp.state === 'gassed' && opp.hp > 0 && opp.hp <= opp.stats.maxHp * CFG.EXECUTE_HP_FRAC
    && Math.abs(opp.x - att.x) <= CFG.EXECUTE_RANGE;
}

// Ground & Pound window: opponent is on the floor, alive, you're close, off cooldown,
// and you're in a standing/neutral state. Mutually exclusive with canExecute by
// opp.state (gassed != downed), so the two P+K finishers never both fire.
function canGroundPound(att, opp) {
  return (opp.state === 'downed' || opp.state === 'fallheavy') && opp.hp > 0
    && att.stamina > 0 && att.groundpoundCD <= 0
    && ['idle', 'walk', 'crouch'].includes(att.state)
    && Math.abs(opp.x - att.x) <= CFG.GROUNDPOUND_RANGE;
}

class Fighter {
  constructor(x, facing, pad, name, color, char) {
    this.pad = pad;
    this.name = name;
    this.color = color;
    this.char = charDef(char);     // per-character identity (js/characters.js); default = brawler
    this.charType = this.char.id;
    this.moveSet = this.char.moves;
    this.stats = this.char.stats;  // physical feel (hp/speed/jump/gravity/stamina/backdash)
    this.spawnX = x;
    this.spawnFacing = facing;
    this.reset();
  }

  // Swap this fighter's character identity (used by the character-select before a fight).
  setCharacter(char) {
    this.char = charDef(char);
    this.charType = this.char.id;
    this.moveSet = this.char.moves;
    this.stats = this.char.stats;
    this.reset();
  }

  reset() {
    this.x = this.spawnX;
    this.y = CFG.FLOOR_Y;
    this.prevX = this.x; this.prevY = this.y;   // render-interpolation snapshot (smooth motion on >60Hz)
    this.animClock = 0;                          // never-reset cyclic-anim phase → idle/walk bob + stride stay continuous across transitions
    this.vx = 0; this.vy = 0;
    this.pushVel = 0;
    this.facing = this.spawnFacing;
    this.hp = this.stats.maxHp;
    this.meter = 0;
    this.stamina = this.stats.maxStamina;
    this.state = 'idle';
    this.f = 0;
    this.move = null; this.moveName = null;
    this.moveHitDone = false; this.madeContact = false; this.madeHit = false;
    this.hitFlash = 0;
    this.stunFrames = 0;
    this.invuln = 0;
    this.backHeldFrames = 0;
    this.comboHits = 0; this.comboMoves = {}; this.airHits = 0;
    this.jabChain = 0;         // consecutive CONNECTED jabs → the 3rd auto-bursts into machine-gun blows
    this.jabCounted = false;   // whether the current jab has been tallied into jabChain
    this.crouchjabChain = 0;   // consecutive CONNECTED crouch jabs → a 2nd (connected) down+P upgrades into the liver shot
    this.crouchjabCounted = false; // whether the current crouch jab has been tallied into crouchjabChain
    this.bounced = false;
    this.noTech = false;       // set on un-techable launches (KO / point-blank knee / execution)
    this.groundHits = 0;       // hits eaten while downed this knockdown (cap → invuln getup)
    this.attackDrift = 0;      // momentum carried into/through strikes
    this.grabSlide = 0;        // forward lunge carried into a grab's reach (walk/dash grabs reach further)
    this.sideSpikeFrames = 0;  // electric overhand: reduced-gravity flat-flight window
    this.pendingElectric = 0;  // electrocution queued by the side spike — converts to `electrified` on landing
    this.electrified = 0;      // electrocution seize timer: locked + convulsing + passive DoT
    this.wallSpiked = false;   // a wall-spike wallsplat → slow slide down the wall + blood trail
    this.bleed = 0;            // bleed stacks (Vesper's knife DoT)
    this.bleedTimer = 0;       // frames left bleeding (refreshed on each knife hit)
    this.gibArmed = 0;         // hit by a gib move (shotgun) recently → a KO decapitates
    this.vesperChain = 0; this.vesperChainTimer = 0;   // slash→thrust→rising chain (aerial rave)
    this.hitCount = 0;         // multihit bookkeeping (flying uppercut)
    this.lastHitF = -99;
    this.bulletsFired = 0;     // bullet-arts rounds fired this strike (Vesper)
    this.lastBulletF = -99;
    this.thrownFrom = 0;       // clinch-throw arc endpoints
    this.thrownTo = 0;
    this.thrower = null;       // set while thrown — the body to reset on a throw tech
    this.techWindow = 0;       // frames left to tech out of the current throw/clinch
    this.rollDir = 0;          // wakeup-roll travel direction
    this.pendingRoll = 0;      // direction captured the frame a wakeup roll is requested
    this.reversalWhiff = false;// a reversal in progress: whiff = death-on-whiff recovery tax
    this.getupDelay = 0;       // frames of delayed-getup extension banked while downed
    this.usedAirAttack = false;
    this.usedAirDash = false;   // one air-dash per jump (Vesper)
    this.usedDoubleJump = false; // one double jump per airtime (Vesper)
    this.runDir = 0; this.bdDir = 0;
    this.landFrames = CFG.LAND_FRAMES;
    this.superFlash = false;   // main consumes → triggers cinematic freeze
    this.superKind = 'cannon'; // 'cannon' (neutral) | 'beam' (forward) | 'combo' (back)
    this.comboStrike = 'punch';// super-combo flurry: which strike the current teleport hit shows (render)
    this.swordWind = false;    // super-combo finisher: blade in the windup (raised) vs a live swipe (render)
    this.decapitated = false;  // sword-finisher KO: head detached → body renders headless
    this.punchChain = 0;       // magic punch combo progress: jab(1)→cross(2)→uppercut(3)→cross(4)
    this.punchChainTimer = 0;  // grace frames the chain stays armed between links (input-driven, decays in update)
    this.swordReady = 0;       // window (after the auto-combo) where a back kick triggers the sword combo
    this.spawnShot = false;    // combat consumes → spawns the cannon round
    this.counterKind = null;   // 'punch'|'kick' of the counter blow (render reads it)
    this.counterCD = 0;        // frames until this fighter can trigger another counter
    this.groundpoundCD = 0;    // frames until this fighter can ground & pound again
    this.clinchTimer = 0;      // frames held in 'clinch' (auto-release at CLINCH_MAX_FRAMES)
    this.clinchMash = 0;       // victim's escape progress while 'clinched'
    this.inClinch = false;     // a clinch strike is live → endMove returns to 'clinch', not idle
    this.clinchBroke = false;  // victim sets this when mash escapes → clincher reads it next frame
    this.crumpleKind = 'stand';   // 'stand' (doubled-over body shot) | 'kneel' (buckle to one knee)
    this.flatlinerPrimed = false; // a just-frame overhand off the machine-gun → flatliner cinematic (consumed once in combat.js)
  }

  // ── bookkeeping ────────────────────────────────────────────
  setState(name) {
    const prev = this.state;
    this.state = name;
    this.f = 0;
    if (FLASH_ON_ENTER.has(name)) this.hitFlash = CFG.HIT_FLASH;   // white impact frame on every fallheavy/wallsplat/launched/hitstun entry

    if (!MOVE_STATES.has(name)) { this.move = null; this.moveName = null; }
    if (NEUTRAL_RESET.has(name)) { this.comboHits = 0; this.comboMoves = {}; this.airHits = 0; this.jabChain = 0; this.crouchjabChain = 0; }
    // (punchChain is deliberately NOT cleared on neutral: a magic-combo link recovers to idle
    //  between hits while the victim is still in hitstun, so the chain's lifetime is the VICTIM's
    //  combo — cleared in update() when the opponent leaves their hit state, not when WE idle.)
    if (name === 'getup') { this.invuln = CFG.GETUP_FRAMES + CFG.GETUP_INVULN_EXTRA; this.groundHits = 0; playSfx('getup'); }
    if (name === 'backroll') { this.invuln = CFG.BACKROLL_INVULN; this.groundHits = 0; playSfx('tech'); }
    if (name === 'kipup') { this.invuln = CFG.KIPUP_INVULN; this.groundHits = 0; playSfx('getup'); }
    // wakeup roll: grant its (shorter-than-the-roll) invuln + capture the travel dir; reuse getup sfx
    if (name === 'wakeuproll') { this.invuln = CFG.WAKEUPROLL_INVULN; this.groundHits = 0; this.rollDir = this.pendingRoll || this.facing; playSfx('getup'); }   // OVERWRITE (not max) so the late roll's exposed tail is real — inheriting getup's longer invuln made it safer than a clean roll
    // any get-up route clears banked delayed-getup, so it can't leak into a later knockdown this round
    if (name === 'getup' || name === 'backroll' || name === 'kipup' || name === 'wakeuproll') this.getupDelay = 0;
    if (name === 'downed') { this.vx = 0; this.bounced = false; }   // groundHits PERSISTS across pops within one knockdown
    if (name === 'gassed') playSfx('gassed');
    if (name === 'backdash' || name === 'run') playSfx('dash');
    // clinch timer is owned by beginClinch (it zeroes it on a FRESH lock) so it
    // survives looping back to 'clinch' from a clinch strike — only the broke flag clears here
    if (name === 'clinch') this.clinchBroke = false;
    if (name === 'clinched') { this.clinchMash = 0; this.clinchBroke = false; }
    // Leaving gassed by ANY route (including getting hit) grants the recovery
    // refill — otherwise hitting a gassed fighter denies it and re-gas loops.
    if (prev === 'gassed' && name !== 'gassed') this.stamina = Math.max(this.stamina, CFG.GASSED_RECOVER_STAMINA);
  }

  animKey() { return this.move ? this.move.anim : this.state; }
  isAirborne() { return this.state === 'air' || this.state === 'airattack' || this.state === 'flyattack' || this.state === 'launched'; }
  isCrouched() { return this.state === 'crouch' || !!(this.move && this.move.crouching); }
  inHitState() { return this.state === 'hitstun' || this.state === 'launched' || this.state === 'crumple'; }

  // ── boxes ──────────────────────────────────────────────────
  hurtbox() {
    if (this.state === 'downed' || this.state === 'fallheavy') {
      // Taller than the body LOOKS on purpose: a downed opponent must be
      // hittable by ANY strike — no more legs ghosting through a floored body.
      return { x: this.x - CFG.DOWNED_W / 2, y: this.y - CFG.CROUCH_H, w: CFG.DOWNED_W, h: CFG.CROUCH_H };
    }
    const h = this.isCrouched() ? CFG.CROUCH_H : CFG.BODY_H;
    return { x: this.x - CFG.BODY_W / 2, y: this.y - h, w: CFG.BODY_W, h };
  }

  pushbox() {
    // clinch/clinched are pinned bodies — null pushbox so a stray push-apart can't shove them
    if (['downed', 'fallheavy', 'getup', 'thrown', 'suplexthrow', 'suplexed', 'gpmount', 'gpmounted', 'crumpled', 'clinch', 'clinched', 'electrified'].includes(this.state)) return null;
    return { x: this.x - CFG.PUSHBOX_W / 2, y: this.y - CFG.BODY_H, w: CFG.PUSHBOX_W, h: CFG.BODY_H };
  }

  activeHitbox() {
    if (MOVE_STATES.has(this.state) && this.move && !this.moveHitDone) {
      const mv = this.move;
      // flying uppercut only strikes on the way UP — the fall is the commitment
      if (this.moveName === 'flyuppercut' && this.vy > 2) return null;
      const hb = mv.hitbox;
      // PHASED hitbox: an array of {t0,t1,x,y,w,h} segments, each live for its own
      // frame window (the axe kick's heel-square → chop-box). Single boxes still
      // use the startup/active gate below.
      if (Array.isArray(hb)) {
        for (const seg of hb) {
          if (this.f > seg.t0 && this.f <= seg.t1) {
            const x = this.facing === 1 ? this.x + seg.x : this.x - seg.x - seg.w;
            return { x, y: this.y + seg.y, w: seg.w, h: seg.h };
          }
        }
        return null;
      }
      if (this.f > mv.startup && this.f <= mv.startup + mv.active) {
        const x = this.facing === 1 ? this.x + hb.x : this.x - hb.x - hb.w;
        return { x, y: this.y + hb.y, w: hb.w, h: hb.h };
      }
    }
    return null;
  }

  // ── actions ────────────────────────────────────────────────
  // `snap` (optional): direction state captured at press time — buffered presses
  // resolve with the direction the player MEANT, even if released during a freeze.
  dirCategory(opp, snap) {
    const p = snap || this.pad.held;
    if (p.up) return 'up';
    if (p.down) return 'down';
    const dir = p.right ? 1 : p.left ? -1 : 0;
    if (dir === 0) return 'neutral';
    const toward = Math.sign(opp.x - this.x) || this.facing;
    return dir === toward ? 'forward' : 'back';
  }

  startMove(name, isAir = false) {
    const mv = this.moveSet[name];
    this.stamina = Math.max(0, this.stamina - mv.stamina);
    // MAGIC PUNCH COMBO — drive the chain off the INPUT SEQUENCE (jab→cross→uppercut→cross), not
    // hit-confirm: the moment it reaches 2 the magnet (attack-case) yanks you into range so every
    // remaining link CONNECTS on its own — that's the "inescapable latch". Any off-sequence start
    // breaks it; a grace timer (update()) lets it survive loose timing between links but expires so
    // a stale jab can't arm it later. The combat.js override only fires on a CLEAN hit, so blocking
    // the string still defends — you just get latched, not comboed.
    const pc = this.punchChain;
    this.punchChain = name === 'jab' ? 1
      : (name === 'cross' && pc === 1) ? 2
      : (name === 'uppercut' && pc === 2) ? 3
      : (name === 'cross' && pc === 3) ? 4
      : 0;
    if (this.punchChain > 0) this.punchChainTimer = CFG.PUNCHCHAIN_GRACE;
    // VESPER aerial-rave chain: slash → thrust → rising slash. At 3 the rising slash hit fires the
    // aerial juggle cinematic (combat.js). Held by the same grace window.
    if (this.charType === 'vesper') {
      const vc = this.vesperChain || 0;
      this.vesperChain = name === 'slash' ? 1 : (name === 'thrust' && vc === 1) ? 2 : (name === 'risingslash' && vc === 2) ? 3 : 0;
      if (this.vesperChain > 0) this.vesperChainTimer = CFG.PUNCHCHAIN_GRACE;
    }
    // No dead-stops: strikes carry a chunk of your locomotion into them.
    // Chains ('attack' → 'attack') keep whatever flow is already going.
    if (!isAir) {
      const heldDir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
      if (this.state === 'run') this.attackDrift = this.runDir * this.stats.runSpeed * this.stats.momentumKeep;
      else if (this.state === 'walk') this.attackDrift = heldDir * this.stats.walkSpeed * this.stats.momentumKeep;
      else if (this.state !== 'attack') this.attackDrift = 0;
      if (mv.slide) this.attackDrift = (this.runDir || this.facing) * CFG.SLIDE_TACKLE_SPEED;   // the slide tackle glides hard
      if (mv.planted) this.attackDrift = 0;   // a planted move (shotgun) kills all carried momentum — she stands and fires
    }
    this.setState(isAir ? 'airattack' : 'attack');
    this.move = mv;
    this.moveName = name;
    this.moveHitDone = false;
    this.madeContact = false;
    this.madeHit = false;                    // reset per move — set true only on a CLEAN hit (combat.js), drives the flow cancel
    this.hitCount = 0;
    this.lastHitF = -99;
    this.bulletsFired = 0;                    // bullet-arts rounds reset per strike
    this.jabCounted = false;                 // this move's connecting-jab tally (machine-gun chain)
    if (name !== 'jab') this.jabChain = 0;   // only a jab→jab→jab string builds the burst
    this.crouchjabCounted = false;           // this move's connecting-crouchjab tally (liver-shot chain)
    if (name !== 'crouchjab' && name !== 'livershot') this.crouchjabChain = 0;   // only a crouchjab string (→ livershot) builds it
    this.flatlinerPrimed = false;            // every move starts un-primed; the just-frame remap re-sets it AFTER this returns
    // Dive bomb: a `dive` field redirects the jump arc steeply down-forward on
    // start (e.g. divekick). vy is positive = downward; vx is signed by facing.
    if (mv.dive) { this.vx = this.facing * mv.dive.vx; this.vy = mv.dive.vy; }
    // Gazelle-step: a grounded LEAP. Carry forward via attackDrift (glided in the
    // attack case); the vertical arc is driven by the shared groundLeapY helper. Seeding
    // attackDrift (not vx) keeps the body in the grounded `attack` state, no air physics.
    if (mv.gazelleHop) this.attackDrift = this.facing * mv.gazelleHop.vx;
    // Flying leap (superman punch): a `flight` field on a GROUND-started move converts it
    // into a real airborne strike — flat, fast arc like the flying knee. State swaps to
    // 'flyattack' so it inherits airborne physics + the FLY_LAND_RECOVERY landing. Mirrors
    // the in-line flyConvert takeoff but fires straight from startMove so a cancelled-in move launches.
    if (mv.flight && !isAir) {
      // aim at the opponent's CURRENT side, not stale committed facing — a cross-up
      // between the cancelled-from move and this launch must not fire backward.
      const toward = this.opp ? (Math.sign(this.opp.x - this.x) || this.facing) : (Math.sign(this.facing) || this.facing);
      this.facing = toward;
      this.setState('flyattack');
      this.move = mv; this.moveName = name;
      this.moveHitDone = false; this.madeContact = false;
      this.hitCount = 0; this.lastHitF = -99;
      this.vx = toward * mv.flight.vx;
      this.vy = mv.flight.vy;
      this.y = CFG.FLOOR_Y - 1;
      playSfx('fly_takeoff');
      this.reversalWhiff = false;
      return;
    }
    playSfx(mv.heavy ? 'whoosh_heavy' : 'whoosh_light');
    this.reversalWhiff = false;   // set true only by the wakeup-reversal path, right after this returns
  }

  endMove() {
    const mv = this.move;
    // Whiff tax: HEAVIES only. A whiffed jab is a shrug; a whiffed raw
    // backfist/uppercut/sweep is how you gas out and die.
    if (mv && mv.heavy && !this.madeContact) this.stamina = Math.max(0, this.stamina - mv.stamina * CFG.WHIFF_STAMINA_PENALTY);
    // Grounded-leap belt-and-suspenders: settle the body back to the floor so the
    // next move never starts slightly airborne (groundLeapY already returns ~0 by here).
    if (mv && mv.gazelleHop && this.y < CFG.FLOOR_Y) { this.y = CFG.FLOOR_Y; this.vy = 0; }
    // a clinch strike loops back into the hold — keep working the body until auto-release
    if (this.inClinch && this.clinchTimer < CFG.CLINCH_MAX_FRAMES) { this.setState('clinch'); return; }
    this.setState(this.stamina <= 0 ? 'gassed' : 'idle');
  }

  tryActions(opp, game) {
    const p = this.pad;
    // P+K on a gassed, nearly-dead opponent → the execution
    if (p.pressed.punch && p.pressed.kick && canExecute(this, opp)) {
      p.consume('punch');
      p.consume('kick');
      startExecution(this, opp, game);
      return true;
    }
    // P+K standing over a DOWNED opponent (close) → mount + ground & pound. Placed
    // AFTER canExecute (a gassed kill wins when both could — they can't, downed != gassed)
    // and BEFORE the neutral clinch-grab (which already excludes downed bodies → dead slot).
    if (p.pressed.punch && p.pressed.kick && canGroundPound(this, opp)) {
      p.consume('punch');
      p.consume('kick');
      startGroundPound(this, opp, game);
      return true;
    }
    if (p.pressed.super && this.meter >= CFG.SUPER_COST) {
      p.consume('super');
      this.meter = 0;
      // Directional super (resolved against the PRESS-TIME snap): FORWARD = OVERDRIVE BEAM,
      // BACK = the SUPER COMBO, anything else (neutral/up/down) = the Mech Cannon.
      const sdir = this.dirCategory(opp, p.snap.super);
      const sm = this.char.superMap || { neutral: 'cannon' };
      this.superKind = sm[sdir] || sm.neutral;
      this.setState('superstart');
      this.superFlash = true;
      return true;
    }
    // Neutral P+K (idle/walk/crouch/run) → the clinch grab. Mid-string P+K is
    // handled in the 'attack' case (→ throwgrab) and is intentionally untouched.
    // A TUMBLING (launched) body is grabbable; only true jump/air-attack states aren't.
    if (p.pressed.punch && p.pressed.kick && this.stamina > 0 && opp.hp > 0
        && ['idle', 'walk', 'crouch', 'run'].includes(this.state)
        && !['air', 'airattack', 'flyattack', 'downed', 'fallheavy', 'thrown', 'getup', 'clinch', 'clinched', 'wallsplat'].includes(opp.state)) {
      // slide INTO the grab with leftover momentum — a walk/dash grab lunges further
      const slide = this.state === 'run' ? CFG.GRAB_SLIDE_RUN : this.state === 'walk' ? CFG.GRAB_SLIDE_WALK : 0;
      p.consume('punch');
      p.consume('kick');
      this.setState('clinchgrab');
      this.grabSlide = this.facing * slide;
      return true;
    }
    const btn = p.pressed.punch ? 'punch' : p.pressed.kick ? 'kick' : null;
    if (btn && this.stamina > 0) {
      const name = resolveNeutralMove(btn, this.dirCategory(opp, p.snap[btn]), opp.state === 'downed' || opp.state === 'fallheavy', Math.abs(opp.x - this.x) < 160, this.char);
      if (name) { p.consume(btn); this.startMove(name); return true; }
    }
    if (p.pressed.jump) { p.consume('jump'); this.setState('prejump'); return true; }
    if (p.tapDir !== 0) {
      const toward = Math.sign(opp.x - this.x) || this.facing;
      if (p.tapDir === toward) {
        this.runDir = p.tapDir;
        this.setState('run');
      } else {
        this.bdDir = p.tapDir;
        this.setState('backdash');
        this.invuln = Math.max(this.invuln, CFG.BACKDASH_INVULN);
      }
      return true;
    }
    return false;
  }

  tryCancel(opp) {
    const mv = this.move;
    if (!mv || !mv.cancels) return;
    // FLOW: light normals gatling on WHIFF too — pokes keep merging into each other
    // even when you're spacing (and buffer to catch a walk-in). HEAVIES still need
    // contact: you commit to them. (Whiffs eat full recovery if you don't chain on.)
    if (!this.madeContact && mv.heavy) return;
    if (this.f < mv.startup || this.f > mv.startup + mv.active + CFG.CANCEL_WINDOW_PAD) return;
    const btn = this.pad.pressed.punch ? 'punch' : this.pad.pressed.kick ? 'kick' : null;
    if (!btn || this.stamina <= 0) return;
    let cand = resolveNeutralMove(btn, this.dirCategory(opp, this.pad.snap[btn]), opp.state === 'downed' || opp.state === 'fallheavy', Math.abs(opp.x - this.x) < 160, this.char);
    // "Cross, then forward+punch again → hook": a basic ender route — flows even on whiff (buffer it).
    if (cand === 'cross' && mv.cancels.includes('hook')) cand = 'hook';
    let flatline = false;
    // ── string-SPECIAL remaps: CONFIRMS only. They come out off a CONNECTED hit, never a whiff
    // (a whiffed normal just gatlings into the basic normal). The chain-counter ones self-gate anyway. ──
    if (this.madeContact) {
      // MACHINE-GUN BLOWS — a jab during the 3rd CONNECTED jab triggers the burst a hair early.
      if (cand === 'jab' && this.moveName === 'jab' && this.jabChain >= 3 && mv.cancels.includes('machinegun')) cand = 'machinegun';
      // SUPERMAN PUNCH: frontkick → forward+P (resolves 'cross') → the flight punch.
      if (cand === 'cross' && this.moveName === 'frontkick' && mv.cancels.includes('superman')) cand = 'superman';
      // LIVER SHOT: a CONNECTED crouchjab → down+P AGAIN.
      if (cand === 'crouchjab' && this.moveName === 'crouchjab' && this.crouchjabChain >= 1 && mv.cancels.includes('livershot')) cand = 'livershot';
      // GAZELLE HOOK: jab→jab (jabChain===2) → forward+P.
      if (cand === 'cross' && this.moveName === 'jab' && this.jabChain >= 2 && mv.cancels.includes('gazelle')) cand = 'gazelle';
      // SPINNING ELBOW: backfist → forward+P, or cross → back+P.
      if (cand === 'cross' && this.moveName === 'backfist' && mv.cancels.includes('spinelbow')) cand = 'spinelbow';
      if (cand === 'backfist' && this.moveName === 'cross' && mv.cancels.includes('spinelbow')) cand = 'spinelbow';
      // CALF KICK COLLAPSE: legkick → NEUTRAL K (resolves 'legkick'). Self-fires (calfkick isn't in legkick.cancels).
      if (cand === 'legkick' && this.moveName === 'legkick' && mv.cancels.includes('legkick')) { this.pad.consume(btn); this.startMove('calfkick'); return; }
      // TORNADO KICK: frontkick → back+K (resolves 'backkick').
      if (cand === 'backkick' && this.moveName === 'frontkick' && mv.cancels.includes('tornado')) cand = 'tornado';
      // OVERHAND / THE FLATLINER: forward+P out of the machine-gun blows; a just-frame press primes the cinematic.
      if (cand === 'cross' && this.moveName === 'machinegun' && mv.cancels.includes('overhand')) {
        cand = 'overhand';
        flatline = this.justFrameAfterFinalHit(CFG.FLATLINER_JF_WINDOW);
      }
    }
    if (cand && mv.cancels.includes(cand)) {
      this.pad.consume(btn);
      this.startMove(cand);                 // clears flatlinerPrimed — re-set it AFTER the start
      if (flatline) this.flatlinerPrimed = true;
    }
  }

  // Just-frame predicate (Flatliner, reusable): true for `window` frames after a
  // multihit's FINAL hit. After the last hit the move stops re-arming, so
  // lastHitF FREEZES on that hit's frame — the exact timestamp to measure from.
  justFrameAfterFinalHit(window) {
    const mv = this.move;
    return !!(mv && mv.multihit && this.hitCount >= mv.multihit.times
      && (this.f - this.lastHitF) <= window);
  }

  // ── reactions (combat.js calls these) ──────────────────────
  receiveBlockstun(frames) { this.setState('blockstun'); this.stunFrames = frames; this.hitFlash = CFG.HIT_FLASH_BLOCK; }
  receiveHitstun(frames) { this.setState('hitstun'); this.stunFrames = frames; this.vx = 0; this.vy = 0; this.hitFlash = CFG.HIT_FLASH; }
  receiveParriedStagger() { this.setState('parried'); this.stunFrames = CFG.PARRY_ATTACKER_STAGGER; }
  // Shared crumple reaction (liver shot / spinning elbow / calf kick). Long OPEN
  // window held for a guaranteed follow-up, then recovers like hitstun. Stays
  // GROUNDED — no knockback. `kind` is 'stand' | 'kneel' (render reads crumpleKind).
  receiveCrumple(frames, kind) {
    this.setState('crumple');
    this.stunFrames = frames;
    this.crumpleKind = kind || 'stand';
    this.vx = 0; this.vy = 0;
    this.hitFlash = CFG.HIT_FLASH;
    playSfx(this.crumpleKind === 'kneel' ? 'buckle' : 'crumple');   // bone-break on a buckle, hurt grunt on a body-shot crumple
  }

  // Shared SPIKE reaction (diving elbow; reusable by any future spike). Slams an
  // airborne body straight to the floor: drives vy hard DOWN (≥ BOUNCE_MIN_VY so the
  // existing launched→bounce→fallheavy path fires), keeps only a small horizontal
  // carry, and sets noTech so the slam can't be kip-up/back-rolled. freshLaunch=false
  // keeps DI off the spike AND preserves noTech (setLaunched only clears it on a fresh
  // launch); we re-assert noTech after to be explicit, matching the KO/point-blank path.
  receiveSpike(downVy, away, game) {
    // LIFT a standing body off its feet into a mid-air tumble (right where it stands),
    // then ROCKET it down so it SLAMS the floor and BOUNCES — not a quiet thud-to-downed.
    // (Airborne/tumbling victims already have air; only lift them if they're low.)
    if (CFG.FLOOR_Y - this.y < CFG.SPIKE_LIFT) { this.y = CFG.FLOOR_Y - CFG.SPIKE_LIFT; this.prevY = this.y; }
    this.bounced = false;                          // GUARANTEE the bounce (clear any stale flag — setLaunched(false) won't)
    this.setLaunched(away * 1.5, downVy, false);   // vy positive = DOWN; no fresh-launch DI on a hard spike
    this.noTech = true;
    if (game) {
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 4);
      game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER);
    }
    spawnSpike(this.x, away);                       // downward energy lance + ground burst
    spawnDust(this.x, CFG.FLOOR_Y, 14);
    playSfx('spike');                               // the acid/energy spike cast
  }

  // SIDE SPIKE (electric overhand): the horizontal spike — launched dead-flat with great
  // force, gravity SUPPRESSED (not zero) during the flight so they fly nearly straight into
  // the wall. Arms the electrocution; it begins once they LAND (pendingElectric → electrified).
  receiveSideSpike(away, game) {
    if (CFG.FLOOR_Y - this.y < CFG.SIDESPIKE_LIFT) { this.y = CFG.FLOOR_Y - CFG.SIDESPIKE_LIFT; this.prevY = this.y; }
    this.bounced = false;
    this.setLaunched(away * CFG.SIDESPIKE_VX, 0, false);   // vy = 0 → dead flat, no DI
    this.noTech = true;
    this.sideSpikeFrames = CFG.SIDESPIKE_FRAMES;           // reduced-gravity flight window (electric arming is set by the caller)
    spawnSideSpike(this.x, CFG.FLOOR_Y - CFG.BODY_H * 0.55, away);   // the side spike's own horizontal energy burst
    spawnDust(this.x, CFG.FLOOR_Y, 10);
    playSfx('sidespike');
  }

  // A launched body splatting a wall. `into` = +1 (left wall) / -1 (right wall) = the way
  // it faces, into the stage. A SIDE-SPIKE flat-flight splat (sideSpikeFrames>0) deals
  // SIGNIFICANT damage + rumble debris + a heavy impact; a normal splat is the usual thud.
  _wallSplat(wx, into, game) {
    const sideSpiked = this.sideSpikeFrames > 0;   // captured BEFORE we clear it
    this.vx = 0; this.facing = into;
    this.setState('wallsplat'); this.sideSpikeFrames = 0;   // flat-flight ends at the wall (peel-off under normal gravity)
    const by = this.y - CFG.BODY_H * 0.55;
    if (sideSpiked) {
      this.wallSpiked = true;                                   // → slow slide down the wall + blood trail (wallsplat case)
      this.hp = Math.max(0, this.hp - CFG.SIDESPIKE_WALL_DMG);   // the wall-spike HURTS
      if (this.hp <= 0) this.pendingElectric = 0;               // dead → no posthumous electrocution
      game.shake = Math.max(game.shake, CFG.SIDESPIKE_WALL_SHAKE);
      game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER);
      spawnRumble(wx + into * 12, this.y - CFG.BODY_H * 0.5, into);   // debris blasted off the wall
      spawnBlood(wx + into * 14, by, into, 38);                       // BLOOD EXPLOSION out from the wall
      for (let i = 0; i < 5; i++) spawnStain(wx - into * 22, by + (Math.random() - 0.5) * CFG.BODY_H * 0.7, true);   // splattered up the wall
      spawnDust(wx, CFG.FLOOR_Y, 20);
      spawnSpark(wx + into * 20, by, 'hit', 2);
      if (this.pendingElectric > 0) spawnElectric(wx + into * 20, this.y - CFG.BODY_H * 0.5, CFG.ELECTRIC_BURST);
      spawnFloatText(this.x, this.y - CFG.BODY_H - 20, 'WALL SPIKE!!', '#ffd54f');
      playSfx('hit_heavy');                                          // heavy hit layered on impact
      playSfx('wall_spike');                                         // the punch-a-rock impact, layered
    } else {
      game.shake = Math.max(game.shake, CFG.WALLSPLAT_SHAKE);
      spawnDust(wx, this.y, 12);
      spawnSpark(wx + into * 20, by, 'hit');
    }
    if (this.hp <= 0) spawnBlood(wx + into * 8, by, into, 24);   // corpse splats the wall
    playSfx('wall_splat');
    pushFeed(sideSpiked ? 'WALL SPIKE!!' : 'WALL SPLAT!', this.color);
  }

  beginThrown(thrower) {
    this.setState('thrown');
    this.sideSpikeFrames = 0; this.pendingElectric = 0;   // a throw mid-side-spike cancels the flight + armed electrocution
    this.invuln = CFG.THROW_FRAMES + 10;
    this.thrownFrom = this.x;
    const to = thrower.x - thrower.facing * 85;
    this.thrownTo = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, to));
    this.thrower = thrower;            // who's holding us — needed to reset them on a tech
    this.techWindow = CFG.THROW_TECH_WINDOW;   // mash P+K within this to break free
    playSfx('throw_grab');
    pushFeed('JUDO TOSS!', thrower.color);
  }

  // GERMAN SUPLEX entry: lock the pair, put the victim in a backward over-the-head
  // bridge, and hand BOTH bodies to the shared canned-cinematic harness (kind:'suplex').
  // The thrower sits in a 'suplexthrow' anim while runSuplexCine drives the arc + spike +
  // tech-mash; the Fighter 'suplexthrow'/'suplexed' cases are no-ops while the cine owns them.
  beginSuplex(opp, game) {
    this.facing = Math.sign(opp.x - this.x) || this.facing;   // face the victim once
    this.inClinch = false; opp.inClinch = false;              // leave the clinch — the throw owns them now
    this.stamina = Math.max(0, this.stamina - CFG.SUPLEX_STAMINA);
    opp.beginSuplexed(this);                                  // victim → spiked-thrown state + arc endpoints
    this.setState('suplexthrow');                             // thrower's bridge pose (render key)
    this.invuln = Math.max(this.invuln, CFG.SUPLEX_FRAMES + 8);
    this.move = MOVES.suplex; this.moveName = 'suplex';       // so animKey()/feed resolve
    startCine('suplex', this, opp, game);                     // the harness owns both bodies from here
    playSfx('throw_grab');
    pushFeed('GERMAN SUPLEX!', this.color);
  }

  // Victim side: enter the spiked-throw state + seed the arc endpoints (the cine
  // interpolates them). Mirrors beginThrown but the body lands BEHIND the thrower
  // (side switch), head-first. Throw-techable in the opening frames (read in runSuplexCine).
  beginSuplexed(thrower) {
    this.setState('suplexed');
    this.invuln = CFG.SUPLEX_FRAMES + 10;
    this.thrownFrom = this.x;
    const to = thrower.x - thrower.facing * CFG.SUPLEX_BACK_DIST;   // OVER the head, far side
    this.thrownTo = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, to));
    this.thrower = thrower;
    this.techWindow = CFG.SUPLEX_TECH_WINDOW;   // mash P+K to break the bridge
    this.vx = 0; this.vy = 0;
  }

  beginClinch(opp) {
    // the lock: both bodies couple, the way throwgrab→throwanim does
    this.facing = Math.sign(opp.x - this.x) || this.facing;   // face the victim ONCE; held the whole clinch
    this.setState('clinch');
    this.clinchTimer = 0;        // fresh lock — start the auto-release clock (setState won't zero it)
    this.inClinch = true;
    this.invuln = Math.max(this.invuln, 4);   // committed — brief ghost on the lock
    opp.y = CFG.FLOOR_Y; opp.vx = 0; opp.vy = 0;   // pluck a TUMBLING (airborne) body down into the grounded clinch
    opp.sideSpikeFrames = 0; opp.pendingElectric = 0;   // a grab mid-side-spike cancels the flight + its armed electrocution
    opp.enterClinched(this);
    playSfx('throw_grab');
    pushFeed('CLINCH!', this.color);
  }

  enterClinched(clincher) {
    this.setState('clinched');
    this.inClinch = true;
    this.invuln = Math.max(this.invuln, 4);
    this.facing = Math.sign(clincher.x - this.x) || -clincher.facing;
  }

  breakClinch(opp, game) {
    // mutual separation: both shove apart, both drop the hold
    const away = Math.sign(this.x - opp.x) || -this.facing;
    this.pushVel = away * CFG.CLINCH_BREAK_PUSHBACK;
    opp.pushVel = -away * CFG.CLINCH_BREAK_PUSHBACK;
    this.inClinch = false; opp.inClinch = false;
    this.setState(this.stamina <= 0 ? 'gassed' : 'idle');
    opp.setState(opp.stamina <= 0 ? 'gassed' : 'idle');
    playSfx('clinch_break');
  }

  setLaunched(vx, vy, freshLaunch) {
    if (freshLaunch) { this.bounced = false; this.noTech = false; this.sideSpikeFrames = 0; this.pendingElectric = 0; this.wallSpiked = false; }   // a FRESH launch clears any stale side-spike arming
    this.hitFlash = CFG.HIT_FLASH;   // OTG pops / launches / KO blasts all flash on contact too
    // Hard guard: a missing/NaN launch velocity must never reach physics — it would
    // NaN the body's position and make it vanish off-screen. Default to a gentle float.
    if (!Number.isFinite(vx)) vx = 0;
    if (!Number.isFinite(vy)) vy = -9;
    // KO blows hit 1.5x harder — a corpse gets BLASTED off its feet (cinematic).
    if (freshLaunch && this.hp <= 0) { vx *= CFG.KO_KNOCKBACK_MULT; vy *= CFG.KO_KNOCKBACK_MULT; }
    // Directional influence: on a fresh launch, holding a way bends the arc a hair
    // (clamped to ±DI_NUDGE — never reverses it). Pairs with choosing where to tech.
    // `held` is live through the wrapping hitstop; only the press buffers freeze.
    // Juggle re-pops (freshLaunch=false) keep their intended trajectory — no DI.
    if (freshLaunch) {
      const h = this.pad.held;
      const dx = h.right ? 1 : h.left ? -1 : 0;
      const dy = h.up ? -1 : h.down ? 1 : 0;
      vx += dx * CFG.DI_NUDGE;
      vy += dy * CFG.DI_NUDGE;
    }
    this.setState('launched');
    this.vx = vx;
    this.vy = vy;
    if (this.y >= CFG.FLOOR_Y) this.y = CFG.FLOOR_Y - 1;
  }

  // ── per-frame update (skipped during hitstop/superfreeze) ──
  update(opp, game) {
    this.opp = opp;   // stash so startMove() can re-aim opponent-relative (flight moves) even on a cross-up
    this.f++;
    this.animClock++;                         // monotonic — drives cyclic anim (bob/stride) so transitions don't pop f back to 0
    if (this.invuln > 0) this.invuln--;
    if (this.hitFlash > 0) this.hitFlash--;   // universal contact-flash timer (set in the receive* funnels)
    if (this.counterCD > 0) this.counterCD--;

    // MAGIC PUNCH COMBO lifetime: the chain is armed by the input sequence (startMove) and held
    // by a grace timer so loose timing between links survives — but it expires, so a lone jab can't
    // arm the magnet on a much-later poke. An off-sequence move start zeroes it directly.
    if (this.punchChain > 0 && --this.punchChainTimer <= 0) this.punchChain = 0;
    if (this.swordReady > 0) this.swordReady--;   // back-kick→sword-combo window (set when the auto-combo ends)
    if (this.gibArmed > 0) this.gibArmed--;       // shotgun-gib window
    if (this.vesperChain > 0 && --this.vesperChainTimer <= 0) this.vesperChain = 0;
    // BLEED DoT (Vesper's knife wounds): drips damage while it lasts, then clears. Can bleed out a KO.
    if (this.bleed > 0) {
      if (--this.bleedTimer <= 0) { this.bleed = 0; }
      else if (this.hp > 0 && this.bleedTimer % CFG.BLEED_TICK === 0) {
        this.hp = Math.max(0, this.hp - CFG.BLEED_DMG * this.bleed);
        spawnBlood(this.x, CFG.FLOOR_Y - CFG.BODY_H * 0.5, -this.facing, 2);   // a small wound drip
      }
    }

    // ELECTROCUTION seize (electric overhand): locked, convulsing, taking passive DoT.
    // Fully owns the body and refreshes invuln so the shock can't be knocked out of it.
    if (this.electrified > 0) {
      this.electrified--;
      this.invuln = Math.max(this.invuln, 2);
      if (this.state !== 'electrified') this.setState('electrified');
      this.vx = 0; this.vy = 0; this.y = CFG.FLOOR_Y;
      if (this.hp > 0 && this.electrified % CFG.ELECTRIC_TICK === 0) {
        this.hp -= CFG.ELECTRIC_DMG;                                  // passive damage — a jolt every tick
        spawnElectric(this.x, CFG.FLOOR_Y - CFG.BODY_H * 0.55, 5);    // crackle on the body
        if (this.hp <= 0) { this.hp = 0; this.electrified = 0; }      // electrocuted to death → end the seize, let the KO resolve
      }
      if (this.electrified <= 0) this.setState(this.stamina <= 0 ? 'gassed' : 'downed');   // shock ends → collapse
      return;   // the seize owns the frame
    }
    if (this.groundpoundCD > 0) this.groundpoundCD--;

    const NO_REGEN = new Set(['attack', 'airattack', 'flyattack', 'superstart', 'gassed', 'hitstun', 'blockstun', 'parried', 'launched', 'fallheavy', 'downed', 'throwgrab', 'throwanim', 'thrown', 'execute', 'executed', 'clinchgrab', 'clinch', 'clinched', 'slipcounter', 'countered', 'wallsplat', 'slip', 'crumple', 'suplexthrow', 'suplexed', 'gpmount', 'gpmounted', 'crumpled']);
    if (!NO_REGEN.has(this.state)) this.stamina = Math.min(this.stats.maxStamina, this.stamina + this.stats.staminaRegen);

    // Parry timing: how *fresh* is the block? Holding back forever never parries.
    const away = Math.sign(this.x - opp.x) || -this.facing;
    const holdingAway = (away === 1 && this.pad.held.right) || (away === -1 && this.pad.held.left);
    this.backHeldFrames = holdingAway ? this.backHeldFrames + 1 : 0;

    switch (this.state) {
      case 'idle':
      case 'walk': {
        if (this.stamina <= 0) { this.setState('gassed'); break; }
        this.facing = opp.x >= this.x ? 1 : -1;
        if (this.tryActions(opp, game)) break;
        if (this.pad.held.down) { this.setState('crouch'); break; }
        const dir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
        const next = dir !== 0 ? 'walk' : 'idle';
        // swap directly (both neutral) but keep the sprite contract: f restarts per anim
        if (this.state !== next) { this.state = next; this.f = 0; }
        if (dir !== 0) {
          this.x += dir * this.stats.walkSpeed;
          // walking them down refuels faster than turtling — aggression is rewarded
          if (dir === this.facing) this.stamina = Math.min(this.stats.maxStamina, this.stamina + CFG.ADVANCE_REGEN_BONUS);
        }
        break;
      }
      case 'crouch': {
        if (this.stamina <= 0) { this.setState('gassed'); break; }
        this.facing = opp.x >= this.x ? 1 : -1;
        if (this.tryActions(opp, game)) break;
        if (!this.pad.held.down) this.setState('idle');
        break;
      }
      case 'run': {
        // run + DOWN → SLIDE TACKLE: take the legs out and pop them airborne.
        if (this.pad.held.down && this.stamina > 0) { this.startMove('slidetackle'); break; }
        // run + P/K → a committed dash attack (resolved BEFORE tryActions so the run
        // commits into the lunge instead of a plain cross/legkick). BUT P+K together is
        // the dash GRAB — let that fall through to tryActions instead of eating it as a dashpunch.
        const bothPK = this.pad.pressed.punch && this.pad.pressed.kick;
        const dbtn = bothPK ? null : (this.pad.pressed.punch ? 'punch' : this.pad.pressed.kick ? 'kick' : null);
        if (dbtn && this.stamina > 0) {
          const dn = resolveDashMove(dbtn, this.char);
          if (dn) { this.pad.consume(dbtn); this.startMove(dn); break; }
        }
        if (this.tryActions(opp, game)) break;
        const heldDir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
        if (heldDir !== this.runDir) { this.setState('idle'); break; }
        this.x += this.runDir * this.stats.runSpeed;
        break;
      }
      case 'backdash': {
        this.x += this.bdDir * this.stats.backdashSpeed * Math.max(0, 1 - this.f / this.stats.backdashFrames);
        if (this.f >= this.stats.backdashFrames) this.setState('idle');
        break;
      }
      case 'prejump': {
        if (this.f >= CFG.PREJUMP_FRAMES) {
          const dir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
          const toward = Math.sign(opp.x - this.x) || this.facing;
          this.vx = dir === 0 ? 0 : dir * (dir === toward ? this.stats.jumpDriftFwd : this.stats.jumpDriftBack);
          this.vy = this.stats.jumpVel;
          this.usedAirAttack = false;
          this.usedAirDash = false;
          this.usedDoubleJump = false;
          this.setState('air');
          playSfx('jump');
        }
        break;
      }
      case 'air': {
        // WALL JUMP / DOUBLE JUMP (Vesper) — both eat the JUMP press. A wall jump (near a wall)
        // kicks her back into the stage and REFRESHES her air options; a double jump is a second
        // hop. Wall jump wins when she's on a wall.
        const nearL = this.x <= CFG.WALL_L + CFG.WALL_JUMP_REACH, nearR = this.x >= CFG.WALL_R - CFG.WALL_JUMP_REACH;
        if (this.char.wallJump && this.pad.pressed.jump && (nearL || nearR) && this.stamina >= CFG.WALL_JUMP_COST) {
          this.pad.consume('jump');
          this.vy = this.stats.jumpVel;
          this.vx = (nearL ? 1 : -1) * CFG.WALL_JUMP_VX;        // kick away from the wall, into the stage
          this.usedDoubleJump = false; this.usedAirDash = false; this.usedAirAttack = false;   // the wall refreshes everything
          this.stamina -= CFG.WALL_JUMP_COST;
          spawnDust(this.x + (nearL ? -10 : 10), this.y - CFG.BODY_H * 0.4, 6);
          playSfx('jump');
        } else if (this.char.doubleJump && this.pad.pressed.jump && !this.usedDoubleJump && this.stamina >= CFG.DOUBLE_JUMP_COST) {
          this.pad.consume('jump');
          this.usedDoubleJump = true;
          const jdir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
          const toward = Math.sign(opp.x - this.x) || this.facing;
          this.vx = jdir === 0 ? this.vx * 0.4 : jdir * (jdir === toward ? this.stats.jumpDriftFwd : this.stats.jumpDriftBack);
          this.vy = this.stats.jumpVel * CFG.DOUBLE_JUMP_MULT;
          this.usedAirAttack = false;   // a fresh jump → you can attack again
          this.stamina -= CFG.DOUBLE_JUMP_COST;
          spawnDust(this.x, this.y - CFG.BODY_H * 0.3, 5);
          playSfx('jump');
        }
        // AIR-DASH (Vesper): a double-tap in the air blinks her horizontally, once per jump.
        if (this.char.airDash && this.pad.tapDir !== 0 && !this.usedAirDash && this.stamina >= CFG.AIR_DASH_COST) {
          this.usedAirDash = true;
          this.vx = this.pad.tapDir * CFG.AIR_DASH_VX;
          this.vy = Math.min(this.vy, CFG.AIR_DASH_VY);   // slight lift so it reads as a dash
          this.stamina -= CFG.AIR_DASH_COST;
          spawnDust(this.x, this.y, 6);
          playSfx('jump');
        }
        const btn = this.pad.pressed.punch ? 'punch' : this.pad.pressed.kick ? 'kick' : null;
        if (!this.usedAirAttack && btn && this.stamina > 0) {
          this.pad.consume(btn);
          this.usedAirAttack = true;
          this.startMove(resolveAirMove(btn, this.dirCategory(opp, this.pad.snap[btn]), this.char), true);
        }
        break;
      }
      case 'airattack': {
        const mv = this.move;   // air guns fire too (uzi spray, air bullet arts)
        if (mv && this.f === mv.startup + 1) {
          if (mv.projectile === 'pistolround') spawnPistolRound(this);
          if (mv.burst) spawnGunBurst(this, mv.burst);
          if (mv.fireSfx) playSfx(mv.fireSfx);
        }
        break;   // physics carries it; lands into 'land' below
      }
      case 'land': {
        if (this.f >= this.landFrames) this.setState(this.stamina <= 0 ? 'gassed' : 'idle');
        break;
      }
      case 'attack': {
        const mv = this.move;
        // GUN MOVES: FIRE on the active frame — spawn the round (pistol) + the shot sound.
        if (this.f === mv.startup + 1) {
          if (mv.projectile === 'pistolround') spawnPistolRound(this);
          if (mv.burst) spawnGunBurst(this, mv.burst);   // uzi spray / assault-rifle burst
          if (mv.fireSfx) playSfx(mv.fireSfx);   // e.g. the shotgun blast (its reload tail covers the rack)
        }
        // SHOTGUN: eject the spent shell (a physics object) on the rack frame.
        if (mv.rackFrame && this.f === mv.rackFrame) {
          spawnShell(this.x - this.facing * 4, CFG.FLOOR_Y - CFG.BODY_H * 0.62, -this.facing * 2.4 + (Math.random() - 0.5) * 1.6, -6 - Math.random() * 2);
        }
        // BULLET ARTS (Vesper): keep HOLDING P/K after a CONNECTED strike → she trails gunfire that
        // extends the combo. Fires after the active frames, capped per strike, costs stamina.
        if (this.char.bulletArts && mv.bulletArts !== false && this.madeContact
            && this.f > mv.startup + (mv.active || 0)
            && (this.pad.held.punch || this.pad.held.kick)
            && this.bulletsFired < CFG.BULLET_MAX
            && this.f - this.lastBulletF >= CFG.BULLET_INTERVAL
            && this.stamina >= CFG.BULLET_COST) {
          this.bulletsFired++;
          this.lastBulletF = this.f;
          this.stamina -= CFG.BULLET_COST;
          spawnBullet(this);
        }
        // MAGIC PUNCH COMBO: once the chain has confirmed (>=2), the attacker LATCHES to the
        // opponent — glides to strike range every frame so the inescapable string never drops.
        if (this.punchChain >= 2) {
          const toward = Math.sign(opp.x - this.x) || this.facing;   // re-aim each frame so a cross-up can't strand the magnet behind them
          this.facing = toward;
          const want = opp.x - toward * CFG.MAGNET_DIST;
          this.x += (want - this.x) * CFG.MAGNET_PULL;
          this.x = Math.max(CFG.WALL_L + CFG.BODY_W / 2, Math.min(CFG.WALL_R - CFG.BODY_W / 2, this.x));
        }
        // AUTO machine-gun: count each CONNECTING jab once (the auto-convert below
        // turns the 3rd into the burst on its own — no extra press).
        if (this.moveName === 'jab' && this.madeContact && !this.jabCounted) {
          this.jabCounted = true;
          this.jabChain = (this.jabChain || 0) + 1;
        }
        // Same tally for the crouch-jab string: a connected down+P arms the liver-shot upgrade.
        if (this.moveName === 'crouchjab' && this.madeContact && !this.crouchjabCounted) {
          this.crouchjabCounted = true;
          this.crouchjabChain = (this.crouchjabChain || 0) + 1;
        }
        // FEINT: cancel a NON-convertible move's startup back into neutral for a
        // stamina cost — bait a parry, then whiff-punish. BACK + JUMP during startup.
        // (flyConvert moves keep JUMP for their conversion, so they can't feint.)
        if (!mv.clinchHit && !mv.flyConvert && !this.madeContact && this.f <= mv.startup + CFG.FEINT_WINDOW_PAD
            && this.pad.pressed.jump && this.stamina >= CFG.FEINT_COST) {
          const back = (this.pad.held.right && opp.x < this.x) || (this.pad.held.left && opp.x > this.x);
          if (back) {
            this.pad.consume('jump');
            this.stamina -= CFG.FEINT_COST;
            this.setState(this.stamina <= 0 ? 'gassed' : 'idle');
            playSfx('whoosh_light');
            pushFeed('FEINT', this.color);
            break;
          }
        }
        // GERMAN SUPLEX buffered out of a CLINCH STRIKE (clinchknee/clinchpunch):
        // up + P + K while a clinch strike is live cancels straight into the spike.
        // The mid-string P+K guard below is gated `!mv.clinchHit`, so it never sees
        // this — this branch owns the clinch-strike → suplex cancel without touching it.
        if (this.inClinch && mv.clinchHit && this.pad.held.up
            && this.pad.pressed.punch && this.pad.pressed.kick
            && this.stamina > 0 && this.clinchTimer < CFG.CLINCH_MAX_FRAMES) {
          this.pad.consume('punch'); this.pad.consume('kick');
          this.inClinch = false; opp.inClinch = false;   // drop the clinch loop; the throw owns them
          this.beginSuplex(opp, game);
          break;
        }
        // P+K mid-string: execution if available, otherwise the clinch throw
        if (!mv.clinchHit && this.madeContact && this.pad.pressed.punch && this.pad.pressed.kick
            && this.f >= mv.startup && this.f <= mv.startup + mv.active + 8) {
          this.pad.consume('punch');
          this.pad.consume('kick');
          if (canExecute(this, opp)) startExecution(this, opp, game);
          else {
            const fwd = (this.facing === 1 && this.pad.held.right) || (this.facing === -1 && this.pad.held.left);
            this.setState('throwgrab');
            this.grabSlide = fwd ? this.facing * CFG.GRAB_SLIDE_WALK : 0;   // holding forward → the throw lunges in
          }
          break;
        }
        // tap JUMP during knee/uppercut startup (in range) → flying version
        if (mv.flyConvert && this.f <= mv.startup && this.pad.pressed.jump) {
          const fm = this.moveSet[mv.flyConvert];
          const range = mv.flyConvert === 'flyknee' ? CFG.FLY_KNEE_RANGE : CFG.FLY_UPPERCUT_RANGE;
          if (Math.abs(opp.x - this.x) <= range && this.stamina > 0) {
            this.pad.consume('jump');
            this.stamina = Math.max(0, this.stamina - fm.stamina);
            const toward = Math.sign(opp.x - this.x) || this.facing;
            this.facing = toward;
            this.setState('flyattack');
            this.move = fm;
            this.moveName = mv.flyConvert;
            this.punchChain = 0;   // jumping out of the chain (e.g. uppercut→flyuppercut) breaks the magic combo
            this.moveHitDone = false;
            this.madeContact = false;
            this.hitCount = 0;
            this.lastHitF = -99;
            this.vx = toward * fm.flight.vx;
            this.vy = fm.flight.vy;
            this.y = CFG.FLOOR_Y - 1;
            // the reversal promise: brief invulnerable rise
            if (this.moveName === 'flyuppercut') this.invuln = Math.max(this.invuln, 10);
            playSfx('fly_takeoff');
            break;
          }
        }
        // Pinned clinch strikes impart no locomotion — the locked pair stays put.
        if (!this.inClinch) {
          if (mv.lungeVx && this.f <= mv.startup) this.x += this.facing * mv.lungeVx;
          // momentum glides through the strike…
          this.x += this.attackDrift;
          this.attackDrift *= this.stats.driftDecay;
          // grounded-leap arc: gazelle rises off the floor and settles by recovery (no air state)
          if (mv.gazelleHop) this.y = CFG.FLOOR_Y - groundLeapY(this.f, mv);
          // …and holding toward keeps you advancing — pressing the attack sips stamina
          const toward = Math.sign(opp.x - this.x) || this.facing;
          const heldDir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
          if (heldDir === toward && this.stamina > 0) {
            this.x += toward * CFG.PRESS_DRIFT;
            this.stamina = Math.max(0, this.stamina - CFG.PRESS_DRIFT_STAMINA);
          }
        }
        this.tryCancel(opp);   // may swap this.move mid-string
        if (this.state === 'attack') {
          const m = this.move;
          // AUTO machine-gun blows: the 3rd connected jab flows into the flurry by
          // itself the moment its active frames finish — no 4th press needed.
          if (this.moveName === 'jab' && this.jabChain >= 3 && this.f >= m.startup + m.active && this.stamina > 0) {
            this.startMove('machinegun');
            break;
          }
          let total = m.startup + m.active + m.recovery;
          // Death on whiff: a WHIFFED wakeup reversal eats bonus recovery — a read on it is a free punish.
          if (this.reversalWhiff && !this.madeContact) total += CFG.WAKEUP_REVERSAL_RECOVERY;
          // FLOW CANCEL: a clean HIT caps recovery — land it and you're moving again,
          // so you stay plus and keep pressure. A BLOCK no longer caps recovery: the
          // blocked move rides its full recovery, so blockstun makes you NEGATIVE on
          // block (the turn hands back — real frame traps, and lows/overheads finally
          // matter). Whiff still eats every recovery frame.
          const flowEnd = m.startup + m.active + CFG.FLOW_CANCEL_RECOVERY;
          // noFlowCancel moves (backkick, axe kick) ride out their FULL recovery
          // even on hit — the spin/chop plays to completion, never snapped short.
          const flowCancelable = this.madeHit && !m.noFlowCancel;
          // BULLET ARTS extends the move: while she's still feeding rounds (held + budget left),
          // the strike doesn't end — she keeps gunning. It ends once the rounds/stamina run out
          // or the button is released (or she cancels into another move).
          const firingBA = this.char.bulletArts && m.bulletArts !== false && this.madeContact
            && (this.pad.held.punch || this.pad.held.kick) && this.bulletsFired < CFG.BULLET_MAX
            && this.stamina >= CFG.BULLET_COST && this.f >= m.startup + (m.active || 0);
          if (!firingBA && (this.f >= total || (flowCancelable && this.f >= flowEnd))) this.endMove();
        }
        break;
      }
      case 'blockstun': {
        // PUSHBLOCK: P+K while holding back → spend stamina to shove the attacker
        // out. A panic button to relieve corner pressure — never free.
        const back = (this.pad.held.right && opp.x < this.x) || (this.pad.held.left && opp.x > this.x);
        if (this.pad.pressed.punch && this.pad.pressed.kick && back && this.stamina >= CFG.PUSHBLOCK_COST) {
          this.pad.consume('punch');
          this.pad.consume('kick');
          this.stamina -= CFG.PUSHBLOCK_COST;
          const away = Math.sign(opp.x - this.x) || this.facing;
          applyPush(this, opp, CFG.PUSHBLOCK_PUSH, away);   // shove THEM outward (att=this,vic=opp,away from me)
          spawnSpark(this.x + this.facing * 30, this.y - CFG.BODY_H * 0.6, 'block');
          playSfx('block');
          pushFeed('PUSHBLOCK', this.color);
        }
        if (this.f >= this.stunFrames) this.setState('idle');
        break;
      }
      case 'hitstun':
      case 'parried': {
        if (this.f >= this.stunFrames) this.setState('idle');
        break;
      }
      case 'crumple': {
        // A long OPEN window held for a guaranteed follow-up, then recovers like
        // hitstun (a free-follow-up window, not a guaranteed knockdown). The kneel
        // buckle slumps into a real collapse (feeds okizeme); the stand body-shot
        // freeze stands frozen then recovers to idle/gassed.
        if (this.f >= this.stunFrames) this.setState(this.crumpleKind === 'kneel' ? 'fallheavy' : (this.stamina <= 0 ? 'gassed' : 'idle'));
        break;
      }
      case 'flyattack':
      case 'launched':
        break;   // physics + landing logic below
      case 'wallsplat': {
        // Pinned to the wall, fully hittable — the corner-carry juggle window.
        // Any strike that connects re-launches normally (combat.js sees a grounded,
        // non-downed body). Holds position; gravity is suppressed (not airborne).
        this.vx = 0; this.vy = 0;
        // WALL SPIKE: slowly slide DOWN the wall, smearing a blood trail, then peel off.
        if (this.wallSpiked) {
          this.y = Math.min(CFG.FLOOR_Y, this.y + CFG.WALLSPIKE_SLIDE_SPEED);
          const wx = this.facing === 1 ? CFG.WALL_L + 8 : CFG.WALL_R - 8;          // the wall is behind the body
          if (this.f % 3 === 0) spawnStain(wx, this.y - CFG.BODY_H * 0.45 + Math.random() * 30, true);   // vertical streak down the wall
          if (this.f >= CFG.WALLSPIKE_SLIDE_FRAMES) {
            this.wallSpiked = false;
            this.setLaunched(-this.facing * 2, CFG.WALLSPLAT_DROP_VY, false);       // peel off into the fall (electrocution arms on landing)
            playSfx('body_slam');
          }
          break;
        }
        if (this.f >= CFG.WALLSPLAT_FRAMES) {
          // peel off the wall and slide down into the bounce/fall path
          this.setLaunched(-this.facing * 2, CFG.WALLSPLAT_DROP_VY, false);
          playSfx('body_slam');
        }
        break;
      }
      case 'slip':
        break;   // Phase 3's counter sequencer (runCounter in main.js) drives this body
      case 'throwgrab': {
        // a forward lunge carried into the reach (extends range on a committed throw)
        if (this.f <= 5 && this.grabSlide) {
          this.x = Math.max(CFG.WALL_L + CFG.BODY_W / 2, Math.min(CFG.WALL_R - CFG.BODY_W / 2, this.x + this.grabSlide));
          this.grabSlide *= CFG.GRAB_SLIDE_DECAY;
        }
        // the grab reaches on frame 5; miss = long, punishable whiff. A TUMBLING
        // (launched) body is grabbable — snatch them out of the air and slam them.
        if (this.f === 5) {
          const ok = opp.hp > 0 && opp.invuln <= 0
            && !['air', 'airattack', 'flyattack', 'downed', 'fallheavy', 'thrown', 'getup', 'wallsplat'].includes(opp.state)
            && Math.abs(opp.x - this.x) <= CFG.THROW_RANGE;
          if (ok) {
            this.setState('throwanim');
            this.invuln = CFG.THROW_FRAMES + 8;   // throws are committed — both ghost briefly
            opp.beginThrown(this);
            break;
          }
        }
        if (this.f >= 20) this.setState('idle');
        break;
      }
      case 'throwanim': {
        if (this.f >= CFG.THROW_FRAMES + 8) this.setState('idle');
        break;
      }
      case 'thrown': {
        // THROW TECH: mash P+K in the opening frames → break the grab, both reset to neutral.
        if (this.techWindow > 0) {
          this.techWindow--;
          if (this.pad.pressed.punch && this.pad.pressed.kick) {
            this.pad.consume('punch');
            this.pad.consume('kick');
            const thr = this.thrower;
            this.y = CFG.FLOOR_Y;
            const away = Math.sign(this.x - (thr ? thr.x : this.x)) || -this.facing;
            this.pushVel = away * CFG.THROW_TECH_PUSHBACK;
            if (thr) { thr.pushVel = -away * CFG.THROW_TECH_PUSHBACK; if (['throwanim', 'throwgrab'].includes(thr.state)) thr.setState('idle'); }
            this.thrower = null;
            this.setState('idle');
            spawnDust(this.x, CFG.FLOOR_Y, 8);
            game.hitstop = Math.max(game.hitstop, 6);
            playSfx('throw_grab');
            pushFeed('THROW TECH!', this.color);
            break;
          }
        }
        // canned judo arc over the thrower's head, slam behind them
        const t = Math.min(1, this.f / CFG.THROW_FRAMES);
        this.x = this.thrownFrom + (this.thrownTo - this.thrownFrom) * t;
        this.y = CFG.FLOOR_Y - Math.sin(t * Math.PI) * 120;
        if (this.f >= CFG.THROW_FRAMES) {
          this.y = CFG.FLOOR_Y;
          this.hp = Math.max(0, this.hp - CFG.THROW_DMG);
          spawnSpark(this.x, this.y - 30, 'hit');
          spawnDust(this.x, this.y, 12);
          game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
          game.hitstop = Math.max(game.hitstop, 8);
          playSfx('throw_slam');
          this.setState('fallheavy');
        }
        break;
      }
      case 'clinchgrab': {
        // carry the walk/dash momentum into the reach (extends effective range)
        if (this.f <= CFG.CLINCH_REACH_FRAME && this.grabSlide) {
          this.x = Math.max(CFG.WALL_L + CFG.BODY_W / 2, Math.min(CFG.WALL_R - CFG.BODY_W / 2, this.x + this.grabSlide));
          this.grabSlide *= CFG.GRAB_SLIDE_DECAY;
        }
        // mirrors throwgrab: the reach lands on CLINCH_REACH_FRAME or it's a whiff.
        // A tumbling (launched) body counts — only true jump/air states are ungrabbable.
        if (this.f === CFG.CLINCH_REACH_FRAME) {
          const ok = opp.hp > 0 && opp.invuln <= 0
            && !['air', 'airattack', 'flyattack', 'downed', 'fallheavy', 'thrown', 'getup', 'clinch', 'clinched', 'wallsplat'].includes(opp.state)
            && Math.abs(opp.x - this.x) <= CFG.CLINCH_GRAB_RANGE;
          if (ok) { this.beginClinch(opp); break; }
        }
        if (this.f >= CFG.CLINCH_WHIFF_RECOVERY) this.setState('idle');
        break;
      }
      case 'clinch': {
        // facing was locked in beginClinch — do NOT recompute it here. If it
        // chases the pinned victim it flip-flops every frame and teleports the
        // whole pair side to side (the clinch oscillation bug).
        // victim mashed out last frame? let go.
        if (this.clinchBroke) { this.breakClinch(opp, game); break; }
        // auto-release: nobody clinches forever
        if (this.clinchTimer >= CFG.CLINCH_MAX_FRAMES) { this.breakClinch(opp, game); break; }
        this.clinchTimer++;
        const p = this.pad;
        // GERMAN SUPLEX: up + P + K → backward over-the-head spike (side switch).
        // FIRST action check — must beat the punch-only / kick-only branches below,
        // else pressing P fires clinchpunch before the K is ever read. Consumes BOTH.
        if (p.pressed.punch && p.pressed.kick && p.held.up && this.stamina > 0) {
          p.consume('punch'); p.consume('kick');
          this.beginSuplex(opp, game);
          break;
        }
        if (p.pressed.punch && this.stamina > 0) { p.consume('punch'); this.startMove('clinchpunch'); break; }
        if (p.pressed.kick && this.stamina > 0) { p.consume('kick'); this.startMove('clinchknee'); break; }
        // BACK (held away from the opponent) → judo throw, ends the clinch.
        // (read from pad.held — snap.jump carries no direction for a non-jump press)
        const back = (opp.x > this.x && p.held.left) || (opp.x < this.x && p.held.right);
        if (back) {
          this.inClinch = false; opp.inClinch = false;
          opp.beginThrown(this);
          this.setState('throwanim');
          this.invuln = CFG.THROW_FRAMES + 8;
          break;
        }
        if (p.pressed.jump) { p.consume('jump'); this.inClinch = false; opp.inClinch = false; opp.setState(opp.stamina <= 0 ? 'gassed' : 'idle'); this.setState('prejump'); break; }
        const fwd = (opp.x > this.x && p.held.right) || (opp.x < this.x && p.held.left);
        if (fwd || p.held.up) { this.breakClinch(opp, game); break; }
        break;
      }
      case 'clinched': {
        // pinned to the clincher every frame — authoritative even while the
        // clincher is mid clinchpunch/clinchknee (its state is 'attack' then)
        const clincherHolding = opp.state === 'clinch'
          || (opp.state === 'attack' && opp.move && opp.move.clinchHit);
        if (!clincherHolding) { this.inClinch = false; this.setState(this.stamina <= 0 ? 'gassed' : 'idle'); break; }
        this.x = opp.x + opp.facing * CFG.CLINCH_DIST;   // pinned IN FRONT of the clincher (it faces us)
        this.facing = -opp.facing;                        // always face the clincher — no recompute, no wobble
        // MASH: every fresh press (any button or a direction tap) builds escape
        const p = this.pad;
        let pressed = 0;
        for (const b of ['punch', 'kick', 'jump', 'super']) if (p.pressed[b]) { p.consume(b); pressed++; }
        if (p.tapDir !== 0) pressed++;
        if (pressed > 0) this.clinchMash += CFG.CLINCH_MASH_PER_PRESS * pressed;
        if (this.clinchMash >= CFG.CLINCH_ESCAPE_THRESHOLD) {
          opp.clinchBroke = true;   // clincher reads it next frame and separates us
          // separate immediately too, in case the clincher is mid-strike
          this.inClinch = false; opp.inClinch = false;
          const away = Math.sign(this.x - opp.x) || -this.facing;
          this.pushVel = away * CFG.CLINCH_BREAK_PUSHBACK;
          opp.pushVel = -away * CFG.CLINCH_BREAK_PUSHBACK;
          this.setState(this.stamina <= 0 ? 'gassed' : 'idle');
          playSfx('clinch_break');
          pushFeed('CLINCH BREAK!', this.color);
        }
        break;
      }
      case 'execute':
      case 'executed':
        break;   // the execution sequencer in main.js drives both bodies
      case 'suplexthrow':
      case 'suplexed':
      case 'gpmount':
      case 'gpmounted':
      case 'crumpled':
        break;   // canned-cinematic bodies — the cine sequencer (runCine in main.js) drives them; cases exist for state-machine completeness + render
      case 'slipcounter':
      case 'countered':
        break;   // the counter sequencer in main.js drives both bodies
      case 'fallheavy': {
        if (this.f >= CFG.FALL_FRAMES) this.setState('downed');
        break;
      }
      case 'downed': {
        // Dead fighters stay down.
        if (this.hp <= 0) break;
        // Wakeup ROLL: a fresh L/R press off the floor → short invulnerable reposition.
        // (Lenient single-press, not a double-tap — the knockdown is a deliberate beat.)
        const rollPress = this.pad.pressed.left ? -1 : this.pad.pressed.right ? 1 : 0;
        if (rollPress !== 0) {
          this.pad.consume(this.pad.pressed.left ? 'left' : 'right');
          this.pendingRoll = rollPress;
          this.setState('wakeuproll');
          break;
        }
        // DELAYED getup: hold DOWN to bank extension and stay floored longer (control your wakeup).
        if (this.pad.held.down && this.getupDelay < CFG.DELAYED_GETUP_MAX) this.getupDelay++;
        // Eat your ground-hit budget OR the (possibly extended) floor timer → fast invuln getup.
        if (this.groundHits >= CFG.MAX_GROUND_HITS || this.f >= CFG.KNOCKDOWN_FRAMES + this.getupDelay) {
          this.setState('getup');   // setState zeroes getupDelay
        }
        break;
      }
      case 'getup': {
        if (this.f <= CFG.WAKEUP_REVERSAL_WINDOW) {
          // Reversal: a buffered strike fires AS you rise (getup invuln covers the startup).
          const btn = this.pad.pressed.punch ? 'punch' : this.pad.pressed.kick ? 'kick' : null;
          if (btn && this.stamina > 0) {
            const name = resolveNeutralMove(btn, this.dirCategory(opp, this.pad.snap[btn]), false, false, this.char);
            if (name) { this.pad.consume(btn); this.startMove(name); this.reversalWhiff = true; break; }
          }
          // Late wakeup roll (a roll input buffered a hair past the floor).
          const rollPress = this.pad.pressed.left ? -1 : this.pad.pressed.right ? 1 : 0;
          if (rollPress !== 0) {
            this.pad.consume(this.pad.pressed.left ? 'left' : 'right');
            this.pendingRoll = rollPress;
            this.setState('wakeuproll');
            break;
          }
        }
        if (this.f >= CFG.GETUP_FRAMES) this.setState('idle');
        break;
      }
      case 'wakeuproll': {
        // Eased reposition (decelerates like the backdash). Reuses the backroll look.
        this.x += this.rollDir * CFG.WAKEUPROLL_SPEED * Math.max(0, 1 - this.f / CFG.WAKEUPROLL_FRAMES);
        if (this.f >= CFG.WAKEUPROLL_FRAMES) this.setState('idle');
        break;
      }
      case 'backroll': {
        // invuln roll AWAY — eased out like the backdash, ends standing
        this.x += this.bdDir * CFG.BACKROLL_SPEED * Math.max(0, 1 - this.f / CFG.BACKROLL_FRAMES);
        if (this.f >= CFG.BACKROLL_FRAMES) this.setState('idle');
        break;
      }
      case 'kipup': {
        // fast spring to the feet in place — brief invuln, then actionable
        if (this.f >= CFG.KIPUP_FRAMES) this.setState('idle');
        break;
      }
      case 'gassed': {
        // Wide open: no attacks, no block, no jump — just a slow desperate shuffle.
        const dir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
        this.x += dir * this.stats.walkSpeed * 0.4;
        if (this.f % 14 === 1) {   // sweat drips (logic-rate, freeze-gated — not in render)
          Particles.push({ x: this.x, y: this.y - CFG.BODY_H * 0.9, vx: this.facing, vy: -1.5, life: 16, maxLife: 16, color: '#4fc3f7', size: 3, grav: 0.2 });
        }
        if (this.f >= CFG.GASSED_FRAMES) this.setState('idle');   // refill happens in setState
        break;
      }
      case 'superstart': {
        if (this.superKind === 'beam') {
          // charge → fire (the beam's multi-hits resolve in combat.js updateBeam) → recovery → idle
          if (this.f >= CFG.BEAM_CHARGE + CFG.BEAM_ACTIVE + CFG.BEAM_RECOVERY) this.setState('idle');
        } else if (this.superKind === 'combo') {
          // the starter — an UNBLOCKABLE command-grab (by design): if it REACHES a grounded
          // body, the inescapable combo begins (main.js). Whiff = wasted meter; spacing/jump dodges.
          if (this.f === CFG.SUPER_STARTUP) {
            const grounded = !opp.isAirborne() && !['downed', 'fallheavy', 'getup'].includes(opp.state);
            if (opp.hp > 0 && opp.invuln <= 0 && grounded && Math.abs(opp.x - this.x) <= CFG.COMBO_STARTER_RANGE) {
              startSuperCombo(this, opp, game);
            }
          }
          if (this.f >= CFG.SUPER_STARTUP + CFG.SUPER_RECOVERY) this.setState('idle');   // whiffed starter → recover (meter spent)
        } else if (this.superKind === 'climax') {
          // BULLET CLIMAX: she poses and UNLOADS — a screen-filling barrage over the active window.
          if (this.f >= CFG.SUPER_STARTUP && this.f < CFG.SUPER_STARTUP + CFG.CLIMAX_FRAMES && (this.f - CFG.SUPER_STARTUP) % CFG.CLIMAX_INTERVAL === 0) {
            spawnClimaxVolley(this);
            game.shake = Math.max(game.shake, CFG.SHAKE_LIGHT);
          }
          if (this.f >= CFG.SUPER_STARTUP + CFG.CLIMAX_FRAMES + CFG.SUPER_RECOVERY) this.setState('idle');
        } else if (this.superKind === 'tango') {
          // KILLER TANGO: a teleport-slash rush — if a grounded opp is in range it starts the cinematic.
          if (this.f === CFG.SUPER_STARTUP) {
            const grounded = !opp.isAirborne() && !['downed', 'fallheavy', 'getup'].includes(opp.state);
            if (opp.hp > 0 && opp.invuln <= 0 && grounded && Math.abs(opp.x - this.x) <= CFG.COMBO_STARTER_RANGE) startTango(this, opp, game);
          }
          if (this.f >= CFG.SUPER_STARTUP + CFG.SUPER_RECOVERY) this.setState('idle');
        } else if (this.superKind === 'witchtime') {
          // WITCH TIME: an invuln DODGE. A real attack swinging into it triggers global slow-mo
          // (she stays full speed → free punish). No attack to dodge = wasted meter.
          this.invuln = Math.max(this.invuln, 2);
          const m = opp.move;
          const swingingAtMe = MOVE_STATES.has(opp.state) && m && opp.f >= m.startup - 2
            && opp.f <= m.startup + (m.active || 0) + 4 && Math.abs(opp.x - this.x) < 190;
          if (game.witchTime <= 0 && swingingAtMe) {
            game.witchTime = CFG.WITCH_TIME_FRAMES; game.witchWho = this;
            this.invuln = Math.max(this.invuln, 14);   // a safe beat to begin the punish
            game.flash = Math.max(game.flash, 12); game.flashMax = Math.max(game.flashMax, 12);
            game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
            playSfx('beam_activate');
            pushFeed('WITCH TIME!!', this.color);
            this.setState(this.stamina <= 0 ? 'gassed' : 'idle');   // out of the dodge → free to act
          } else if (this.f >= CFG.SUPER_STARTUP + CFG.WITCH_DODGE_FRAMES) {
            this.setState('idle');   // dodge ended, nothing to punish (meter spent)
          }
        } else {
          if (this.f === CFG.SUPER_STARTUP) this.spawnShot = true;
          if (this.f >= CFG.SUPER_STARTUP + CFG.SUPER_RECOVERY) this.setState('idle');
        }
        break;
      }
    }

    // ── shared physics ──
    if (this.isAirborne()) {
      // side spike: gravity SUPPRESSED (not zero) for the flat-flight window → flies straight, sags slightly
      if (this.sideSpikeFrames > 0) {
        this.vy += this.stats.gravity * CFG.SIDESPIKE_GRAV_MULT; this.sideSpikeFrames--;
        spawnSideTrail(this.x, this.y - CFG.BODY_H * 0.5);   // a particle trail streaming off the flying body
      } else this.vy += this.stats.gravity;
      this.x += this.vx;
      this.y += this.vy;
      if (this.y >= CFG.FLOOR_Y && this.vy >= 0) {
        this.y = CFG.FLOOR_Y;
        const impact = this.vy;
        this.vy = 0;
        if (this.state === 'launched') {
          // ── GROUND TECH (first contact only, techable launches only) ──
          // Tight buffered window: a good read denies the OTG/soccer juggle. We gate
          // on !this.bounced (first floor contact) + the press buffer's own freshness
          // (pad.pressed already encodes the 8f INPUT_BUFFER) — NOT on this.f, which is
          // already large here (the body was airborne many frames). JUMP wins over BACK.
          const techJump = this.pad.pressed.jump;
          const techBack = (away === 1 && this.pad.pressed.right) || (away === -1 && this.pad.pressed.left);
          if (!this.bounced && !this.noTech && (techJump || techBack)) {
            this.y = CFG.FLOOR_Y;
            this.vx = 0; this.vy = 0;
            if (techBack && !techJump) {       // BACK takes priority only when JUMP isn't held
              this.pad.consume(this.pad.held.right ? 'right' : 'left');
              this.bdDir = away;
              this.setState('backroll');
            } else {
              this.pad.consume('jump');
              this.setState('kipup');
            }
          } else if (!this.bounced && impact >= CFG.BOUNCE_MIN_VY) {
            // Hit the ground HARD and bounce — never a flat no-impact landing.
            this.bounced = true;
            this.vy = -impact * CFG.GROUND_BOUNCE;
            this.y = CFG.FLOOR_Y - 1;
            game.shake = Math.max(game.shake, 5);
            spawnDust(this.x, CFG.FLOOR_Y, 10);
            if (this.hp <= 0) spawnBlood(this.x, CFG.FLOOR_Y - 22, Math.sign(this.vx) || this.facing, 16);   // a corpse squirts on every bounce
            playSfx('bounce');
          } else if (this.pendingElectric > 0) {
            // the side-spiked body has LANDED → the electrocution seize begins (top-of-update handler owns it)
            this.electrified = this.pendingElectric; this.pendingElectric = 0;
            this.vx = 0; this.vy = 0; this.y = CFG.FLOOR_Y;
            this.invuln = Math.max(this.invuln, 2);   // cover the very first seize frame (before the handler runs next tick)
            this.setState('electrified');
            spawnElectric(this.x, CFG.FLOOR_Y - CFG.BODY_H * 0.5, CFG.ELECTRIC_BURST);   // blue energy explosion on landing
            playSfx('body_slam');
            playSfx('electrocute');                                                      // the electricity runs through the seize
          } else {
            if (this.hp <= 0) spawnBlood(this.x, CFG.FLOOR_Y - 18, this.facing, 12);   // ...and on the final slam
            this.vx = 0;
            this.setState('fallheavy');
            playSfx('body_slam');
          }
        } else {
          this.vx = 0;
          // air whiff pays the same heavy-only tax as grounded (endMove never runs for air moves)
          if ((this.state === 'airattack' || this.state === 'flyattack') && this.move && this.move.heavy && !this.madeContact) {
            this.stamina = Math.max(0, this.stamina - this.move.stamina * CFG.WHIFF_STAMINA_PENALTY);
          }
          this.landFrames = this.state === 'flyattack'
            ? (this.madeContact ? CFG.FLY_LAND_RECOVERY_HIT : CFG.FLY_LAND_RECOVERY)
            : this.moveName === 'divekick' ? CFG.DIVEKICK_LAND_RECOVERY
            : this.moveName === 'elbowdrop' ? CFG.DIVEKICK_LAND_RECOVERY   // diving elbow = same long, punishable plant as the divekick
            : this.moveName === 'airpunch' ? CFG.AIRPUNCH_LAND_RECOVERY
            : this.state === 'airattack' ? CFG.LAND_FRAMES + 4 : CFG.LAND_FRAMES;
          this.setState('land');
        }
      }
    }

    // Hit/block shove (kept small — hits keep you in the pocket).
    if (this.pushVel) {
      this.x += this.pushVel;
      this.pushVel *= 0.78;
      if (Math.abs(this.pushVel) < 0.3) this.pushVel = 0;
    }

    // Safety net: no grounded-only state may persist in midair (e.g. parried out
    // of a jump). 'thrown' is exempt — its arc is driven directly, not by physics.
    // 'wallsplat' is exempt too — a mid-air splat must HOLD at impact height, not
    // get yanked to the floor before the pin renders (it pops down on timeout).
    if (!this.isAirborne() && this.state !== 'thrown' && this.state !== 'suplexed' && this.state !== 'wallsplat' && !(this.move && this.move.gazelleHop) && this.y < CFG.FLOOR_Y) { this.y = CFG.FLOOR_Y; this.vy = 0; }

    // Walls — the phone booth has hard edges. Launched bodies splat and rebound.
    const minX = CFG.WALL_L + 30, maxX = CFG.WALL_R - 30;
    if (this.x < minX) {
      this.x = minX;
      if (this.state === 'launched' && this.vx <= -CFG.WALLSPLAT_MIN_VX) this._wallSplat(minX, 1, game);
      else if (this.state === 'launched' && this.vx < -4) { if (this.hp <= 0) spawnBlood(minX + 6, this.y - CFG.BODY_H * 0.5, 1, 10); this.vx = -this.vx * 0.35; game.shake = Math.max(game.shake, 4); }
      else if (this.vx < 0) this.vx = 0;
    }
    if (this.x > maxX) {
      this.x = maxX;
      if (this.state === 'launched' && this.vx >= CFG.WALLSPLAT_MIN_VX) this._wallSplat(maxX, -1, game);
      else if (this.state === 'launched' && this.vx > 4) { if (this.hp <= 0) spawnBlood(maxX - 6, this.y - CFG.BODY_H * 0.5, -1, 10); this.vx = -this.vx * 0.35; game.shake = Math.max(game.shake, 4); }
      else if (this.vx > 0) this.vx = 0;
    }
  }
}
