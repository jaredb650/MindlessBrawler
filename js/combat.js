// ─────────────────────────────────────────────────────────────
// Combat: hit detection + resolution. The rules of getting punched.
//   block → chip + small shove        parry → attacker staggered, opening earned
//   hit   → scaled damage/stun        enders → launch / sack-of-potatoes drop
// Also owns projectiles (the Mech Cannon round) and body push-apart.
// ─────────────────────────────────────────────────────────────
const Projectiles = [];

// Kill-feed style strike feed (drawn by ui.js, newest first).
const MOVE_LABELS = {
  jab: 'JAB', cross: 'CROSS', hook: 'HOOK!', uppercut: 'UPPERCUT!',
  backfist: 'BACKFIST', crouchjab: 'BODY JAB', frontkick: 'FRONT KICK',
  legkick: 'LEG KICK', sweep: 'SWEEP!', soccer: 'SOCCER KICK!',
  jumpkick: 'JUMP KICK', knee: 'KNEE', backkick: 'SPINNING BACK KICK!',
  axekick: 'AXE KICK!', tornado: 'TORNADO KICK!',
  airpunch: 'AIR PUNCH', divekick: 'DIVE KICK!', elbowdrop: 'ELBOW DROP!',
  clinchpunch: 'DIRTY BOXING', clinchknee: 'BODY KNEE!', suplex: 'GERMAN SUPLEX!',
  flyknee: 'FLYING KNEE!', flyuppercut: 'FLYING UPPERCUT!', cannon: 'MECH CANNON!!',
  dashpunch: 'DASH PUNCH!', dashkick: 'DASH KICK!',
  machinegun: 'MACHINE-GUN BLOWS!', overhand: 'OVERHAND!', slidetackle: 'SLIDE TACKLE!',
  livershot: 'LIVER SHOT!', spinelbow: 'SPINNING ELBOW!', calfkick: 'CALF KICK!',
  superman: 'SUPERMAN PUNCH!!', gazelle: 'GAZELLE HOOK!',
  groundpound: 'GROUND & POUND!',   // sequencer pushes feed text literally; this is for grep/consistency
  flatliner: 'THE FLATLINER!!',     // just-frame overhand KO; beginFlatliner pushes feed literally — this is for grep/consistency
};

function pushFeed(text, color) {
  game.feed.unshift({ text, color, life: 110 });
  if (game.feed.length > 6) game.feed.pop();
}

function hitSfx(move) {
  if (move.hitSound) playSfx(move.hitSound);                                                  // optional per-move override
  else if (move.hitstop >= CFG.HITSTOP_ENDER) playSfx(move.kind === 'kick' ? 'hit_heavy2' : 'hit_heavy');   // heavy KICKS = flesh impact, heavy PUNCHES = power punch (variety — hit_heavy was overused)
  else if (move.hitstop >= CFG.HITSTOP_MED) playSfx('hit_med');
  else playSfx('hit_light');
  if (move.staminaDrain) playSfx('body_blow');
}

// The cannon round resolves through the same rules as a melee hit.
const SUPER_MOVE = {
  anim: 'cannon', damage: CFG.SUPER_DMG, guard: 'mid', blockstun: 30,
  hitstop: 20, kbx: 16, launcher: true, launchVy: -13, isSuper: true,
  popsGround: true, popVy: -12,   // a 20mm shell absolutely moves a downed body
};

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function canBlock(vic, sourceX, move) {
  if (vic.isAirborne()) return false;
  if (!['idle', 'walk', 'crouch', 'blockstun'].includes(vic.state)) return false;
  const away = Math.sign(vic.x - sourceX) || -vic.facing;
  const holdingAway = (away === 1 && vic.pad.held.right) || (away === -1 && vic.pad.held.left);
  if (!holdingAway) return false;
  const crouched = vic.pad.held.down;
  if (move.guard === 'low' && !crouched) return false;   // lows must be blocked low
  if (move.guard === 'high' && crouched) return false;   // jump-ins must be blocked standing
  return true;
}

// Small shove, and if the victim is cornered the ATTACKER eats it instead —
// hits never blow anyone out of the pocket for free.
function applyPush(att, vic, amount, away) {
  const minX = CFG.WALL_L + 30, maxX = CFG.WALL_R - 30;
  const cornered = (vic.x <= minX + 4 && away === -1) || (vic.x >= maxX - 4 && away === 1);
  if (cornered) att.pushVel = -away * amount;
  else vic.pushVel = away * amount;
}

function landAttack(att, vic, move, game, sourceX, contactPoint) {
  const away = Math.sign(vic.x - sourceX) || att.facing;
  // Projectiles resolve through here too; attacker-side move bookkeeping (and the
  // parry stagger) only applies when `move` is the attacker's LIVE move — a cannon
  // round landing later must not corrupt whatever its owner is doing by then.
  const live = att.move === move;

  // Clinch strike: damage + drain + juice, but the victim NEVER leaves 'clinched'.
  // No block/parry, no combo scaling, no knockback — the bodies stay pinned.
  if (move.clinchHit) {
    const dmg = Math.max(1, move.damage);
    vic.hp -= dmg;
    if (move.staminaDrain) vic.stamina = Math.max(0, vic.stamina - move.staminaDrain);
    att.meter = Math.min(CFG.MAX_METER, att.meter + dmg * CFG.METER_PER_DAMAGE);
    if (live) { att.moveHitDone = true; att.madeContact = true; }
    game.hitstop = Math.max(game.hitstop, move.hitstop);
    if (move.hitstop >= CFG.HITSTOP_ENDER) game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
    spawnSpark(contactPoint.x, contactPoint.y, 'hit');
    if (move.hitstop >= CFG.HITSTOP_ENDER) spawnBlood(contactPoint.x, contactPoint.y, away, CFG.HEAVY_BLOOD);   // heavy hit → blood spurt
    hitSfx(move);
    pushFeed(MOVE_LABELS[move.anim] || move.anim, att.color);
    if (vic.hp <= 0) { vic.hp = 0; vic.inClinch = false; att.inClinch = false; vic.setLaunched(away * 5, -10, true); }
    return;
  }

  // SLIP → COUNTER (Phase 5): a FRESH (parry-timed) crouch-block-back UNDER a HIGH
  // overhead ducks it and feeds Phase 3's counter sequencer. This MUST run BEFORE
  // canBlock(), which by design rejects a crouched blocker vs a high (overheads/jump-ins
  // must be blocked standing) — so inside that gate the slip would be dead code. A
  // PASSIVE (non-fresh) crouch still eats the overhead clean, as intended.
  if (live && move.guard === 'high' && !att.isAirborne() && !vic.isAirborne()
      && vic.pad.held.down && vic.backHeldFrames > 0 && vic.backHeldFrames <= CFG.PARRY_WINDOW
      && vic.counterCD <= 0 && !game.counter
      && ['idle', 'walk', 'crouch', 'blockstun'].includes(vic.state)) {
    const slipAway = Math.sign(vic.x - sourceX) || -vic.facing;
    const holdingAway = (slipAway === 1 && vic.pad.held.right) || (slipAway === -1 && vic.pad.held.left);
    if (holdingAway) {
      att.moveHitDone = true; att.madeContact = true;
      vic.counterKind = 'punch';   // the slip's signature blow (a hard cross)
      const slipBlow = { kind: 'punch', damage: move.damage, anim: move.anim };
      startCounter(vic, att, slipBlow, game);   // vic slips → counters att
      game.hitstop = Math.max(game.hitstop, CFG.PARRY_HITSTOP);
      spawnFloatText(vic.x, vic.y - CFG.BODY_H - 30, 'SLIP!', '#ffe082');
      playSfx('counter_slip');
      pushFeed('SLIP COUNTER!', vic.color);
      return;
    }
  }

  if (canBlock(vic, sourceX, move)) {
    // Fresh block = parry. Holding back forever doesn't count — you must time it.
    if (vic.backHeldFrames > 0 && vic.backHeldFrames <= CFG.PARRY_WINDOW) {
      vic.meter = Math.min(CFG.MAX_METER, vic.meter + CFG.METER_ON_PARRY);
      if (live) {
        att.moveHitDone = true;
        att.madeContact = true;
        // the opening: attacker is helpless, you act NOW (airborne attackers get
        // swatted out of the sky instead — 'parried' is a grounded-only state)
        if (att.isAirborne()) att.setLaunched(-away * 2, Math.max(att.vy, 2), true);
        else att.receiveParriedStagger();
      }
      game.hitstop = Math.max(game.hitstop, CFG.PARRY_HITSTOP);
      spawnSpark(contactPoint.x, contactPoint.y, 'parry');
      spawnFloatText(vic.x, vic.y - CFG.BODY_H - 30, 'PARRY!', '#ffe082');
      playSfx('parry');
      pushFeed('PARRY!', vic.color);
      return;
    }
    const chip = Math.round(move.damage * CFG.CHIP_RATIO);
    vic.hp = Math.max(CFG.CHIP_FLOOR, vic.hp - chip);
    if (move.staminaDrain) vic.stamina = Math.max(0, vic.stamina - move.staminaDrain * 0.5);   // body shots hurt through a guard
    vic.receiveBlockstun(move.blockstun);
    applyPush(att, vic, CFG.BLOCK_PUSHBACK, away);
    att.meter = Math.min(CFG.MAX_METER, att.meter + CFG.METER_ON_BLOCK);
    if (live) { att.moveHitDone = true; att.madeContact = true; }
    game.hitstop = Math.max(game.hitstop, 4);
    spawnSpark(contactPoint.x, contactPoint.y, 'block');
    playSfx('block');
    pushFeed(`${MOVE_LABELS[move.anim] || move.anim} — blocked`, 'rgba(170,175,190,0.85)');
    return;
  }

  // ── clean hit ──
  // COUNTER-HIT: catch them in their own move's STARTUP (grounded, off cooldown)
  // → hand both bodies to the cinematic sequencer in main.js. The cannon round
  // (no `kind`) and airborne exchanges are excluded on purpose. (Clinch strikes
  // never reach here — the clinchHit early-out above returns first.)
  // INTENTIONAL: the counter only fires when the attacker is holding AWAY (the
  // block/retreat direction) as they land it — a deliberate defensive read, not
  // a freebie off every startup trade.
  const vicCommitting = MOVE_STATES.has(vic.state) && vic.move && vic.f <= vic.move.startup;
  const attAway = Math.sign(att.x - vic.x) || att.facing;
  const attHoldingBack = (attAway === 1 && att.pad.held.right) || (attAway === -1 && att.pad.held.left);
  if (live && move.kind && attHoldingBack && !att.isAirborne() && !vic.isAirborne()
      && vicCommitting && att.counterCD <= 0 && !game.counter) {
    startCounter(att, vic, move, game);
    return;
  }
  if (vic.inHitState()) vic.comboHits++;
  else { vic.comboHits = 1; vic.comboMoves = {}; vic.airHits = 0; }
  const hits = vic.comboHits;
  const sameCount = vic.comboMoves[move.anim] || 0;
  vic.comboMoves[move.anim] = sameCount + 1;

  const dmgScale = Math.max(CFG.MIN_DMG_SCALE, 1 - CFG.DMG_SCALE_PER_HIT * (hits - 1));
  const dmg = Math.max(1, Math.round(move.damage * dmgScale));
  vic.hp -= dmg;
  // a pained grunt on a meaty hit — random, and skipped on crumple moves (those already grunt)
  if (dmg >= CFG.GRUNT_DMG && !move.crumple && Math.random() < CFG.GRUNT_CHANCE) playSfx(Math.random() < 0.5 ? 'grunt_1' : 'grunt_2');
  // body shots break the will to fight: knee drains the gas tank directly
  if (move.staminaDrain) vic.stamina = Math.max(0, vic.stamina - move.staminaDrain * dmgScale);
  const meterBefore = att.meter;
  att.meter = Math.min(CFG.MAX_METER, att.meter + dmg * CFG.METER_PER_DAMAGE);
  if (meterBefore < CFG.MAX_METER && att.meter >= CFG.MAX_METER) playSfx('meter_ready');
  if (live) { att.moveHitDone = true; att.madeContact = true; }
  game.hitstop = Math.max(game.hitstop, move.hitstop);
  if (move.hitstop >= CFG.HITSTOP_ENDER) game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
  spawnSpark(contactPoint.x, contactPoint.y, 'hit');
  if (move.hitstop >= CFG.HITSTOP_ENDER) spawnBlood(contactPoint.x, contactPoint.y, away, CFG.HEAVY_BLOOD);   // heavy hit → blood spurt
  hitSfx(move);
  pushFeed(MOVE_LABELS[move.anim] || move.anim, att.color);

  if (vic.hp <= 0) {
    // A primed just-frame overhand ALWAYS plays the Flatliner cinematic, even when its
    // own damage was lethal — otherwise the signature finisher silently downgrades to
    // a plain K.O. exactly at the low HP you'd go for it. (The cine zeroes hp at its end.)
    if (live && att.flatlinerPrimed && move.canFlatline) { att.flatlinerPrimed = false; beginFlatliner(att, vic, game); return; }
    vic.hp = 0;
    vic.setLaunched(away * 7, -12, true);   // KO: dramatic launch, main takes it from here
    vic.noTech = true;                       // can't tech your own death — set AFTER setLaunched clears it
    return;
  }

  // Flying knee: spacing decides the payoff.
  //   kissing distance (hit barely off the ground) = bonus damage, the hardest
  //   single strike in the game · rising = blast away · tip (falling) = gas-out.
  if (move.kneeSpot && vic.state !== 'downed') {
    if (att.f <= move.pbWindow && !vic.isAirborne()) {
      const bonus = Math.max(1, Math.round(move.pbDamage * dmgScale));
      vic.hp -= bonus;
      att.meter = Math.min(CFG.MAX_METER, att.meter + bonus * CFG.METER_PER_DAMAGE);
      game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER + 6);
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 3);
      spawnSpark(contactPoint.x, contactPoint.y, 'hit');
      spawnSpark(contactPoint.x - 14, contactPoint.y - 16, 'parry');   // gold burst — it's special
      spawnSpark(contactPoint.x + 10, contactPoint.y + 12, 'hit');
      spawnFloatText(vic.x, vic.y - CFG.BODY_H - 40, 'POINT BLANK!', '#ffe082');
      pushFeed(`POINT BLANK KNEE — ${dmg + bonus}!`, '#ffe082');
      playSfx('explosion');
      if (vic.hp <= 0) { vic.hp = 0; vic.setLaunched(away * 8, -12, true); vic.noTech = true; return; }
      vic.setLaunched(away * 8, -12, true);   // violent pop, more up than away
      vic.noTech = true;                       // the point-blank knee is un-techable (set after setLaunched)
    } else if (att.vy < -1 || vic.isAirborne()) {
      vic.setLaunched(away * 14, -7, true);
    } else {
      vic.stamina = 0;
      vic.setState('gassed');
      spawnFloatText(vic.x, vic.y - CFG.BODY_H - 40, 'GASSED!', '#ff5252');
      pushFeed('TIP KNEE — GASSED OUT!', '#ff5252');
    }
    return;
  }

  // Spinning back kick / overhand: the one strike that blasts people across the stage.
  if (move.blast && vic.state !== 'downed') {
    // THE FLATLINER: a just-frame overhand (primed in tryCancel) that lands CLEAN
    // diverts to the one-punch-KO cinematic instead of the blast. The flag only
    // lives on a primed overhand; consume it here so a later overhand can't reuse it.
    if (live && att.flatlinerPrimed && move.canFlatline) {
      att.flatlinerPrimed = false;
      beginFlatliner(att, vic, game);   // shared cine harness (main.js): freeze → crumple → KO
      return;
    }
    if (live) att.flatlinerPrimed = false;
    vic.setLaunched(away * 15, -7, true);
    return;
  }

  // ── CRUMPLE (shared: liver shot / spinning elbow / calf kick) ──
  // One router for all three crumple movers. Fires ONLY on a fresh grounded,
  // non-crumpled body — the `vic.state !== 'crumple'` guard is the SOLE
  // anti-infinite-restun rule: an already-crumpled body falls through to the
  // normal launch/knockdown path so a follow-up ENDS the loop. The stamina drain
  // (liver shot) was already applied by the generic move.staminaDrain line above.
  if (move.crumple && !vic.isAirborne() && vic.state !== 'downed' && vic.state !== 'crumple') {
    const frames = move.crumpleFrames || CFG.CRUMPLE_FRAMES;
    vic.receiveCrumple(frames, move.crumple);   // move.crumple is 'stand' | 'kneel'
    spawnFloatText(vic.x, vic.y - CFG.BODY_H - 30, move.crumple === 'kneel' ? 'BUCKLE!' : 'CRUMPLE!', '#ffe082');
    return;
  }

  if (vic.isAirborne()) {
    // SPIKE (diving elbow): slam an airborne body straight to the floor — untechable,
    // ground-bounce → OTG. Ends the juggle (no airHits++), bounded by MAX_GROUND_HITS.
    if (move.spike != null) {
      vic.receiveSpike(move.spike, away, game);   // shared mechanic — drives vy down, noTech, juice
      return;
    }
    if (move.multihit) {
      // rising multihit carries them up with you; the FINAL hit launches high —
      // but ONLY if the move actually launches (machine-gun blows has no launchVy,
      // so its final airborne hit must NOT pass undefined → NaN → vanished body).
      const finalHit = (att.hitCount || 0) + 1 >= move.multihit.times;
      const lv = finalHit && move.launchVy != null ? move.launchVy : -9;
      vic.setLaunched(away * move.kbx, lv, false);
      return;
    }
    // Juggle — limited lifts, then the body gets heavy and falls.
    vic.airHits++;
    if (vic.airHits <= CFG.MAX_AIR_HITS) vic.setLaunched(away * Math.max(2, move.kbx), Math.min(vic.vy, -7) - 2, false);
    return;
  }

  if (vic.state === 'downed') {
    // The ground game: anything connects (full damage, no kitty gloves).
    // Kicks/heavies POP the body off the floor for a ground juggle; lights thud it.
    // After MAX_GROUND_HITS they rise fast and fully invulnerable.
    vic.groundHits++;
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
    if (move.popsGround) {
      vic.setLaunched(away * 1.5, move.popVy || CFG.GROUND_POP_VY, true);   // fresh: pop → slam → bounce
      playSfx('ground_pop');
    }
    return;
  }

  // ── GROUND BOUNCE (superman punch) ──
  // A grounded, non-downed victim of a `groundBounce` move is popped UP a little so
  // the EXISTING launched→impact bounce path (fighter.js) fires when they crash back
  // down — they rise, slam, and bounce off the floor. Placed before launcher/knockdown
  // so it takes priority for a standing body. (Airborne victims juggled above; the
  // knockdown:true flag is the safe fallback if this branch is ever removed.)
  if (move.groundBounce && !vic.isAirborne() && vic.state !== 'downed') {
    vic.setLaunched(away * move.kbx, CFG.GROUND_BOUNCE_VY, true);
    return;
  }

  if (move.launcher) {
    const finalHit = !move.multihit || (att.hitCount || 0) + 1 >= move.multihit.times;
    vic.setLaunched(away * move.kbx, finalHit ? move.launchVy : -9, true);
    return;
  }

  if (move.knockdown) {
    // Significant grounded strike → drop like a sack of potatoes.
    vic.setState('fallheavy');
    vic.pushVel = away * move.kbx;
    return;
  }

  // Standard hit: hitstun with soft decay — long strings slowly leak frames,
  // same-move repeats leak fast. No hard cap: parry/stamina are the real outs.
  // noStunDecay (machine-gun blows): every rapid hit keeps FULL hitstun so the flurry
  // HOLDS them in place straight through to the overhand, instead of decay freeing them.
  const stunScale = move.noStunDecay ? 1 : Math.max(CFG.MIN_HITSTUN_SCALE, 1 - CFG.HITSTUN_DECAY_PER_HIT * (hits - 1) - CFG.SAME_MOVE_EXTRA_DECAY * sameCount);
  vic.receiveHitstun(Math.round(move.hitstun * stunScale));
  applyPush(att, vic, move.kbx, away);   // kbx 0 ⇒ no push (machine-gun freezes them in place)
}

// `move` is snapshotted by the caller: on a trade frame the first resolution
// can knock the second attacker out of their move before this runs.
function resolveMelee(att, box, move, vic, game) {
  if (!box || !move) return;
  if (vic.hp <= 0) return;   // no corpse-juggling on the K.O. screen
  if (vic.invuln > 0 || vic.state === 'fallheavy') return;
  // multihit (flying uppercut): wait out the rehit interval between hits
  if (move.multihit && (att.hitCount || 0) > 0 && att.f - att.lastHitF < move.multihit.interval) return;
  // (downed victims ARE hittable — solid body = fair game, ghosts are not)
  const hb = vic.hurtbox();
  if (!rectsOverlap(box, hb)) return;
  const cx = Math.max(box.x, hb.x) + (Math.min(box.x + box.w, hb.x + hb.w) - Math.max(box.x, hb.x)) / 2;
  const cy = Math.max(box.y, hb.y) + (Math.min(box.y + box.h, hb.y + hb.h) - Math.max(box.y, hb.y)) / 2;
  landAttack(att, vic, move, game, att.x, { x: cx, y: cy });
  // re-arm the hitbox until the multihit is spent (unless the move was interrupted)
  if (move.multihit && att.move === move) {
    att.hitCount = (att.hitCount || 0) + 1;
    att.lastHitF = att.f;
    if (att.hitCount < move.multihit.times) att.moveHitDone = false;
  }
}

function spawnCannon(owner) {
  Projectiles.push({
    x: owner.x + owner.facing * 70,
    y: CFG.FLOOR_Y - 130,             // chest height: can't be ducked, CAN be jumped or blocked
    vx: owner.facing * CFG.SUPER_SHOT_SPEED,
    w: 130, h: 56,
    owner, dead: false, age: 0,
  });
}

function updateProjectiles(f1, f2, game) {
  for (const p of Projectiles) {
    if (p.dead) continue;
    p.age++;
    p.x += p.vx;
    const vic = p.owner === f1 ? f2 : f1;
    const rect = { x: p.x - p.w / 2, y: p.y, w: p.w, h: p.h };
    if (vic.hp > 0 && vic.invuln <= 0 && vic.state !== 'fallheavy' && rectsOverlap(rect, vic.hurtbox())) {
      landAttack(p.owner, vic, SUPER_MOVE, game, p.x - p.vx * 2, { x: p.x + Math.sign(p.vx) * p.w / 2, y: p.y + p.h / 2 });
      // Override chip: a 20mm shell hurts through a guard.
      if (vic.state === 'blockstun') {
        vic.hp = Math.max(CFG.CHIP_FLOOR, vic.hp - (CFG.SUPER_CHIP - Math.round(CFG.SUPER_DMG * CFG.CHIP_RATIO)));
        vic.pushVel = Math.sign(p.vx) * 14;
      }
      p.dead = true;
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 3);
      spawnSpark(p.x + Math.sign(p.vx) * p.w / 2, p.y + p.h / 2, 'hit');
      playSfx('explosion');
    }
    if (p.x < -200 || p.x > CFG.STAGE_W + 200) p.dead = true;
  }
  for (let i = Projectiles.length - 1; i >= 0; i--) if (Projectiles[i].dead) Projectiles.splice(i, 1);
}

// Grounded bodies can't overlap; airborne fighters may cross over (jump-over is legal).
function separateBodies(f1, f2) {
  if (f1.isAirborne() || f2.isAirborne()) return;
  // Clinched bodies are pinned by the fighter logic — don't push them apart.
  const clinchStates = ['clinchgrab', 'clinch', 'clinched'];
  if (clinchStates.includes(f1.state) || clinchStates.includes(f2.state)) return;
  const b1 = f1.pushbox(), b2 = f2.pushbox();
  if (!b1 || !b2 || !rectsOverlap(b1, b2)) return;
  const overlap = Math.min(b1.x + b1.w, b2.x + b2.w) - Math.max(b1.x, b2.x);
  const dir = f1.x <= f2.x ? -1 : 1;
  f1.x += dir * overlap / 2;
  f2.x -= dir * overlap / 2;
  const minX = CFG.WALL_L + 30, maxX = CFG.WALL_R - 30;
  // Walls don't give: if one body is pinned, the other absorbs the rest.
  if (f1.x < minX) { f2.x += minX - f1.x; f1.x = minX; }
  if (f1.x > maxX) { f2.x -= f1.x - maxX; f1.x = maxX; }
  if (f2.x < minX) { f1.x += minX - f2.x; f2.x = minX; }
  if (f2.x > maxX) { f1.x -= f2.x - maxX; f2.x = maxX; }
}

function combatUpdate(f1, f2, game) {
  // Snapshot both hitboxes AND moves before resolving so simultaneous hits trade fairly.
  const box1 = f1.activeHitbox(), move1 = f1.move;
  const box2 = f2.activeHitbox(), move2 = f2.move;
  resolveMelee(f1, box1, move1, f2, game);
  resolveMelee(f2, box2, move2, f1, game);

  for (const f of [f1, f2]) {
    if (f.spawnShot) {
      f.spawnShot = false;
      // interrupted on the firing frame → no shell from a body mid-flinch
      if (f.state === 'superstart') spawnCannon(f);
    }
  }
  updateProjectiles(f1, f2, game);
  separateBodies(f1, f2);
}
