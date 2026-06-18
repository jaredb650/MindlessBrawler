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
  else if (move.weapon === 'knife') playSfx(move.hitstop >= CFG.HITSTOP_ENDER ? 'stab_heavy' : 'stab_light');   // knife: heavy stab (upper slash) vs little stab (slash/thrust)
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
const BEAM_MOVE = { anim: 'beam', guard: 'mid' };   // only used for canBlock() direction/height checks
// A Bullet-Arts round: tiny gun hit that re-stuns briefly (combo glue), no knockdown/launch.
const BULLET_MOVE = { anim: 'bullet', damage: CFG.BULLET_DMG, guard: 'mid', blockstun: 6, hitstun: CFG.BULLET_HITSTUN, hitstop: 2, kbx: 0, kind: 'gun', label: 'BULLET' };
// ◀P PISTOL SHOT round: one projectile that CRUMPLES a grounded victim (a stagger → free follow-up).
const PISTOL_ROUND_MOVE = { anim: 'bullet', damage: CFG.PISTOL_ROUND_DMG, guard: 'mid', blockstun: 12, hitstun: 0, hitstop: CFG.HITSTOP_MED, kbx: 0, kind: 'gun', crumple: 'stand', pistolCrush: true, label: 'PISTOL' };   // 2 BLOCKED in a row → guard crush (a parry resets the count)
// ↓K RIFLE round: one big, fast round — heavy damage, EXPLODES on impact, BREAKS guards, and SCOOPS a downed body.
const RIFLE_ROUND_MOVE = { anim: 'bullet', damage: CFG.RIFLE_ROUND_DMG, guard: 'mid', blockstun: 14, hitstun: 0, hitstop: CFG.HITSTOP_ENDER, kbx: 9, kind: 'gun', blast: true, popsGround: true, popVy: -11, guardBreak: true, label: 'RIFLE' };
// Uzi spray round (light, hitstun) + assault-rifle round (heavier, LAUNCHES → juggle).
const UZI_BULLET_MOVE = { anim: 'bullet', damage: 8, guard: 'mid', blockstun: 6, hitstun: 11, hitstop: 2, kbx: 0, kind: 'gun', label: 'UZI' };
const AR_BULLET_MOVE = { anim: 'bullet', damage: 16, guard: 'mid', blockstun: 8, hitstun: 0, hitstop: CFG.HITSTOP_MED, kbx: 0, kind: 'gun', launcher: true, launchVy: -9, airHitCap: 10, label: 'RIFLE' };   // raised juggle cap so the upshot column reliably keeps an airborne foe up for a combo
const BURST_MOVES = { uzi: UZI_BULLET_MOVE, ar: AR_BULLET_MOVE };
// Xamora MAGIC: a drifting orb (wisp, her ranged poke) + a low traveling shockwave (tremor). Resolve like a hit.
const WISP_MOVE = { anim: 'bullet', damage: CFG.WISP_DMG, guard: 'mid', blockstun: 12, hitstun: CFG.BULLET_HITSTUN, hitstop: CFG.HITSTOP_MED, kbx: 4, kind: 'magic', label: 'WISP' };
const TREMOR_MOVE = { anim: 'bullet', damage: CFG.TREMOR_DMG, guard: 'low', blockstun: 14, hitstun: 0, hitstop: CFG.HITSTOP_ENDER, kbx: 0, kind: 'magic', launcher: true, launchVy: -9, label: 'TREMOR' };
// SHOCKWAVE — Rising Pole's projectile: behaves EXACTLY like the tremor wave (travels, launches, detonates),
// just rendered as a rolling shock front instead of an orb.
const SHOCKWAVE_MOVE = { anim: 'bullet', damage: CFG.TREMOR_DMG, guard: 'low', blockstun: 14, hitstun: 0, hitstop: CFG.HITSTOP_ENDER, kbx: 0, kind: 'magic', launcher: true, launchVy: -9, label: 'SHOCKWAVE' };
// VACUUM — the gap-closer orb. kbx:0 so the generic knockback never fires; the `pull` reaction (landAttack)
// YANKS the victim toward the caster instead. Low damage on purpose: its job is to drag you into slam range.
const VACUUM_MOVE = { anim: 'bullet', damage: CFG.VACUUM_DMG, guard: 'mid', blockstun: 12, hitstun: CFG.MAGNET_HITSTUN, hitstop: CFG.HITSTOP_MED, kbx: 0, kind: 'magic', pull: true, pullVx: CFG.VACUUM_PULL, label: 'VACUUM' };
// LANTERN — a placed TRAP: hangs stationary in space, detonates on contact, pops them UP (her juggle/grab follow).
// The zoning-with-teeth tool: own a chunk of screen, cover her slow recovery, set oki on a knockdown.
const LANTERN_MOVE = { anim: 'bullet', damage: CFG.LANTERN_DMG, guard: 'mid', blockstun: 14, hitstun: 0, hitstop: CFG.HITSTOP_ENDER, kbx: 0, kind: 'magic', launcher: true, launchVy: -12, lanternBlast: true, label: 'LANTERN' };
function spawnWisp(owner, down) {
  const d = owner.facing;
  Projectiles.push({
    x: owner.x + d * 40, y: owner.isAirborne() ? owner.y - CFG.BODY_H * 0.5 : CFG.FLOOR_Y - 150,
    vx: down ? 0 : d * CFG.WISP_SPEED, vy: down ? CFG.WISP_SPEED : 0, grav: 0,
    w: 30, h: 30, owner, move: WISP_MOVE, kind: 'magic', hue: 'wisp', dead: false, age: 0,
  });
  playSfx('beam_fire');
}
function spawnTremor(owner) {
  const d = owner.facing;
  Projectiles.push({
    x: owner.x + d * 46, y: CFG.FLOOR_Y - 26, vx: d * CFG.TREMOR_SPEED, vy: 0, grav: 0,
    w: 52, h: 50, owner, move: TREMOR_MOVE, kind: 'magic', hue: 'tremor', dead: false, age: 0,
  });
  playSfx('ground_pop');
}
function spawnShockwave(owner) {
  const d = owner.facing;
  Projectiles.push({
    x: owner.x + d * 46, y: CFG.FLOOR_Y - 30, vx: d * CFG.TREMOR_SPEED, vy: 0, grav: 0,
    w: 54, h: 58, owner, move: SHOCKWAVE_MOVE, kind: 'magic', hue: 'shockwave', dead: false, age: 0,
  });
  playSfx('ground_pop');
}
function spawnVacuum(owner) {
  const d = owner.facing;
  Projectiles.push({
    x: owner.x + d * 46, y: owner.isAirborne() ? owner.y - CFG.BODY_H * 0.4 : CFG.FLOOR_Y - 96,
    vx: d * CFG.VACUUM_SPEED, vy: 0, grav: 0,
    w: 40, h: 56, owner, move: VACUUM_MOVE, kind: 'magic', hue: 'wisp', dead: false, age: 0,
  });
  playSfx('beam_fire');
}
function spawnLantern(owner) {
  const d = owner.facing;
  Projectiles.push({
    x: owner.x + d * 74, y: CFG.FLOOR_Y - 92, vx: 0, vy: 0, grav: 0,   // PLANTED: hangs where cast, doesn't travel
    w: 42, h: 76, owner, move: LANTERN_MOVE, kind: 'magic', hue: 'tremor', dead: false, age: 0, armDelay: CFG.LANTERN_ARM,
  });
  playSfx('ground_pop');
}
// Fire ONE round of a STREAMING burst. The fighter fire-hook calls this once every `b.interval`
// frames, passing the running shot index `i` (0..count-1). Every round flies STRAIGHT — the
// trail/line emerges from the time between shots, NOT a per-bullet fan.
//   b = { count, interval, speed, vertical, driftX (vertical lean), up (vy bias, forward), grav, move, y, sfx }
function spawnGunBurst(owner, b, i) {
  const d = owner.facing, mv = BURST_MOVES[b.move] || UZI_BULLET_MOVE;
  let vx, vy;
  if (b.vertical) { vx = d * (b.driftX || 0); vy = -b.speed; }   // straight UP → streamed into a vertical line
  else { vx = d * b.speed; vy = (b.up || 0); }                   // straight FORWARD → streamed into a horizontal line
  Projectiles.push({
    x: owner.x + d * 46,
    y: owner.isAirborne() ? owner.y - CFG.BODY_H * 0.55 : CFG.FLOOR_Y - (b.y || 120),
    vx, vy, grav: b.vertical ? 0 : (b.grav || 0),
    w: 20, h: 8, owner, move: mv, kind: 'bullet', dead: false, age: 0,
  });
  if (!i) playSfx(b.sfx || 'pistol_shot');   // one burst sting at the head of the stream
}

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

  // ELECTROCUTED victims are HITTABLE but UNBREAKABLE: a hit registers damage + a white flash, but it
  // CANNOT pop them out of the seize (the electrified state-update re-locks them every frame). No block.
  if (vic.state === 'electrified' && !move.clinchHit) {
    const edmg = Math.max(1, Math.round(move.damage * (att.char.dmgMult || 1)));
    vic.hp -= edmg;
    vic.hitFlash = CFG.HIT_FLASH;   // light up white for a beat
    game.hitstop = Math.max(game.hitstop, Math.min(move.hitstop || CFG.HITSTOP_LIGHT, CFG.HITSTOP_MED));
    spawnSpark(contactPoint.x, contactPoint.y, 'hit', 1);
    if (live) { att.moveHitDone = true; att.madeContact = true; att.madeHit = true; }
    if (vic.hp <= 0) { vic.hp = 0; vic.electrified = 0; vic.setLaunched(away * 7, -12, true); vic.noTech = true; }
    return;
  }

  // SUPER-ARMOR (Xamora the heavy): she EATS a hit instead of being interrupted — on a flagged
  // commital windup (move.armor:N hits) OR while walking the foe down (stamina-priced). Mirrors the
  // electrified early-out: apply REDUCED damage, juice, return with NO reaction funnel so her move
  // keeps running. COUNTERPLAY is structural: THROWS skip this entirely (a grab overwrites her
  // 'attack' state before it ever reaches here), MULTI-HIT breaks it (the N cap → ARMOR BREAK kneel),
  // and an `armorBreak:true` move blows straight through (clears the tally, falls to the real funnel).
  const armorOnMove = vic.char.id === 'xamora' && vic.state === 'attack' && vic.move && vic.move.armor
    && vic.f <= vic.move.startup + (vic.move.active || 0);
  const armorOnWalk = vic.char.id === 'xamora' && vic.state === 'walk' && vic.stamina > CFG.ARMOR_WALK_STAMINA
    && ((away === 1 && vic.pad.held.left) || (away === -1 && vic.pad.held.right));   // walking INTO the attacker
  if (move.kind && !move.clinchHit && !vic.isAirborne() && (armorOnMove || armorOnWalk)) {
    if (move.armorBreak) { vic.armorHits = 0; vic.armorDamage = 0; }   // armor-breaker: clear the tally + fall through to the full reaction
    else {
      const admg = Math.max(1, Math.round(move.damage * (att.char.dmgMult || 1) * CFG.ARMOR_CHIP));
      vic.hp -= admg;
      vic.hitFlash = CFG.HIT_FLASH;
      vic.armorHits++; vic.armorDamage += admg;
      if (armorOnWalk) vic.stamina = Math.max(0, vic.stamina - CFG.ARMOR_WALK_STAMINA);   // the advance costs gas → self-limits to ~2 hits
      game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_LIGHT);
      game.shake = Math.max(game.shake, CFG.SHAKE_LIGHT);
      spawnSpark(contactPoint.x, contactPoint.y, 'block');   // a guard-clang flare reads "that bounced off"
      spawnFloatText(vic.x, vic.y - CFG.BODY_H - 30, 'ARMOR!', '#ffd54a');
      playSfx('block');
      att.meter = Math.min(CFG.MAX_METER, att.meter + admg * CFG.METER_PER_DAMAGE * (att.char.meterMult || 1));
      if (live) { att.moveHitDone = true; att.madeContact = true; att.madeHit = true; }
      if (vic.hp <= 0) { vic.hp = 0; vic.armorHits = 0; vic.armorDamage = 0; vic.setLaunched(away * 7, -12, true); vic.noTech = true; return; }   // armor can't save you from a lethal blow
      // ARMOR BREAK: she absorbs N hits (move.armor) and KEEPS attacking — the hit that EXCEEDS the
      // budget buckles her to a knee (the punish window). So armor:1 eats one poke and the slam still
      // lands; a 2-hit string blows through. Walk-armor self-limits on stamina, so only moves break here.
      if (armorOnMove && vic.armorHits > vic.move.armor) {
        vic.armorHits = 0; vic.armorDamage = 0;
        spawnFloatText(vic.x, vic.y - CFG.BODY_H - 50, 'ARMOR BREAK!', '#ff5252');
        playSfx('crumple');
        game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_MED);
        game.shake = Math.max(game.shake, CFG.SHAKE_MED);
        vic.receiveCrumple(CFG.CRUMPLE_FRAMES, 'kneel');
      }
      return;
    }
  }

  // Clinch strike: damage + drain + juice, but the victim NEVER leaves 'clinched'.
  // No block/parry, no combo scaling, no knockback — the bodies stay pinned.
  if (move.clinchHit) {
    const dmg = Math.max(1, move.damage);
    vic.hp -= dmg;
    if (move.staminaDrain) vic.stamina = Math.max(0, vic.stamina - move.staminaDrain);
    att.meter = Math.min(CFG.MAX_METER, att.meter + dmg * CFG.METER_PER_DAMAGE);
    if (live) { att.moveHitDone = true; att.madeContact = true; att.madeHit = true; }
    game.hitstop = Math.max(game.hitstop, move.hitstop);
    const cpw = move.hitstop >= CFG.HITSTOP_ENDER ? 2 : move.hitstop >= CFG.HITSTOP_MED ? 1 : 0;
    game.shake = Math.max(game.shake, cpw === 2 ? CFG.SHAKE_HEAVY : cpw === 1 ? CFG.SHAKE_MED : CFG.SHAKE_LIGHT);
    spawnSpark(contactPoint.x, contactPoint.y, 'hit', cpw);
    if (move.hitstop >= CFG.HITSTOP_ENDER) spawnBlood(contactPoint.x, contactPoint.y, away, CFG.HEAVY_BLOOD);   // heavy hit → blood spurt
    hitSfx(move);
    pushFeed(move.label || MOVE_LABELS[move.anim] || move.anim, att.color);
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
      if (move.pistolCrush) vic.blockedPistolRounds = 0;   // a parried pistol round spares the guard → reset the crush counter
      return;
    }
    // GUARD CRUSH — RIFLE round detonates THROUGH the block (still parryable via the fresh-block branch above).
    if (move.guardBreak) {
      vic.hp = Math.max(1, vic.hp - Math.round(move.damage * CFG.CHIP_RATIO));
      spawnFloatText(vic.x, vic.y - CFG.BODY_H - 30, 'GUARD CRUSH!', '#ff5252');
      game.hitstop = Math.max(game.hitstop, move.hitstop);
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
      vic.setLaunched(away * 13, -7, true);   // blasted out of the broken guard (the round's impact FX detonates in updateProjectiles)
      if (live) { att.moveHitDone = true; att.madeContact = true; att.madeHit = true; }
      return;
    }
    // GUARD CRUSH — the SECOND pistol round BLOCKED in a row breaks the guard into a crumple (a parry above resets the count).
    if (move.pistolCrush) {
      vic.blockedPistolRounds = (vic.blockedPistolRounds || 0) + 1;
      if (vic.blockedPistolRounds >= 2) {
        vic.blockedPistolRounds = 0;
        vic.hp = Math.max(1, vic.hp - Math.round(move.damage * CFG.CHIP_RATIO));
        spawnFloatText(vic.x, vic.y - CFG.BODY_H - 30, 'GUARD CRUSH!', '#ff5252');
        playSfx('crumple');
        game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_MED);
        game.shake = Math.max(game.shake, CFG.SHAKE_MED);
        vic.receiveCrumple(move.crumpleFrames || CFG.CRUMPLE_FRAMES, move.crumple || 'stand');
        if (live) { att.moveHitDone = true; att.madeContact = true; att.madeHit = true; }
        return;
      }
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
  else { vic.comboHits = 1; vic.comboMoves = {}; vic.airHits = 0; vic.blockedPistolRounds = 0; }   // a clean hit breaks the consecutive-block chain
  const hits = vic.comboHits;
  const sameCount = vic.comboMoves[move.anim] || 0;
  vic.comboMoves[move.anim] = sameCount + 1;

  // per-character combo scaling: Vesper's many-hit juggles decay gentler + floor higher so her
  // rushdown pressure actually converts (the brawler keeps the global defaults → byte-identical).
  const dmgScale = Math.max(att.char.minDmgScale || CFG.MIN_DMG_SCALE, 1 - (att.char.dmgScalePerHit || CFG.DMG_SCALE_PER_HIT) * (hits - 1));
  const dmg = Math.max(1, Math.round(move.damage * dmgScale * (att.char.dmgMult || 1)));   // per-character damage scaling (Vesper's rushdown hits harder)
  vic.hp -= dmg;
  // a pained grunt on a meaty hit — random, skipped on crumple moves (those already grunt). The
  // grunt is the VICTIM'S voice: female grunts when Vesper is hit, male grunts when the brawler is hit.
  if (dmg >= CFG.GRUNT_DMG && !move.crumple && Math.random() < CFG.GRUNT_CHANCE) {
    const gr = (vic.char && vic.char.grunts) || ['grunt_1', 'grunt_2'];
    playSfx(gr[(Math.random() * gr.length) | 0]);
  }
  // body shots break the will to fight: knee drains the gas tank directly
  if (move.staminaDrain) vic.stamina = Math.max(0, vic.stamina - move.staminaDrain * dmgScale);
  const meterBefore = att.meter;
  att.meter = Math.min(CFG.MAX_METER, att.meter + dmg * CFG.METER_PER_DAMAGE * (att.char.meterMult || 1));   // per-character meter gain (Vesper builds 3x faster)
  if (meterBefore < CFG.MAX_METER && att.meter >= CFG.MAX_METER) playSfx('meter_ready');
  if (live) { att.moveHitDone = true; att.madeContact = true; att.madeHit = true; }   // madeHit = a CLEAN hit (not block) → only this caps recovery (flow cancel)
  game.hitstop = Math.max(game.hitstop, move.hitstop);
  const pw = move.hitstop >= CFG.HITSTOP_ENDER ? 2 : move.hitstop >= CFG.HITSTOP_MED ? 1 : 0;   // hit strength → shake + spark scale (so a cross isn't flat, an ender reads heavy)
  game.shake = Math.max(game.shake, pw === 2 ? CFG.SHAKE_HEAVY : pw === 1 ? CFG.SHAKE_MED : CFG.SHAKE_LIGHT);
  spawnSpark(contactPoint.x, contactPoint.y, 'hit', pw);
  if (move.hitstop >= CFG.HITSTOP_ENDER) spawnBlood(contactPoint.x, contactPoint.y, away, CFG.HEAVY_BLOOD);   // heavy hit → blood spurt
  else if (move.weapon === 'knife') spawnBlood(contactPoint.x, contactPoint.y, away, 7);   // a knife cut always draws blood (the DoT debuff is gone, but the spurts stay)
  hitSfx(move);
  pushFeed(move.label || MOVE_LABELS[move.anim] || move.anim, att.color);

  if (move.gib) vic.gibArmed = 90;   // shotgun — a KO within this window gibs the head (main.js)

  // ── SIGNATURE COMBO-CHAIN payoff (per-character, multi-chain) ──
  // A completed MELEE chain (pendingFinish set in fighter.startMove) hands both bodies to its finish
  // cinematic on the CLEAN hit of the final link. Fired BEFORE the KO check so it plays even on a lethal
  // hit. (Vesper's EXECUTION/SKEET gun-ender chains are command grabs fired at the gun fire-frame, not here.)
  const cf = att.pendingFinish;
  if (live && cf && att.state === 'attack'
      && !['downed', 'fallheavy', 'crumple', 'wallsplat'].includes(vic.state)) {
    if (cf.kind === 'slashcombo') { att.punchChain = 0; att.activeChains = []; att.pendingFinish = null; startSlashCombo(att, vic, game, cf.opts); return; }
    if (cf.kind === 'magiccombo') { att.punchChain = 0; att.activeChains = []; att.pendingFinish = null; startMagicCombo(att, vic, game); return; }
    if (cf.kind === 'kebab') { att.punchChain = 0; att.activeChains = []; att.pendingFinish = null; startKebab(att, vic, game); return; }   // SHISH KEBAB: carry → wall pin
    // execution / skeet are command grabs handled at the gun fire-frame (fighter.js) — not fired here
  }

  // Move-carried slash combos (Vesper's dive grab / slide tackle / tele-slash) → the slash cinematic.
  if (live && move.slashCombo && !['downed', 'fallheavy', 'crumple', 'wallsplat'].includes(vic.state)) {
    startSlashCombo(att, vic, game, move.slashCombo);
    return;
  }

  // Air SCISSOR KICK command grab → the SCISSOR TAKEDOWN cinematic (she holds airborne, spikes them down).
  if (live && move.scissorGrab && !['downed', 'fallheavy', 'crumple', 'wallsplat'].includes(vic.state)) {
    startScissorTake(att, vic, game);
    return;
  }

  // Xamora air ↑K SKY TALON command grab → the SKY TALON cinematic (she snatches a jumping foe, hurls them down).
  if (live && move.skyTalon && !['downed', 'fallheavy', 'crumple', 'wallsplat'].includes(vic.state)) {
    startSkyTalon(att, vic, game);
    return;
  }

  // Auto two-hit ground kicks: a clean gunkick / heelshot triggers its follow-up (heel-spike / side-kick).
  if (live && move.kickFollow && !['downed', 'fallheavy', 'crumple', 'wallsplat'].includes(vic.state)) {
    startKickCombo(att, vic, game, move.kickFollow);
    return;
  }

  // ── SWORD COMBO followup ──
  // A BACK KICK connecting within the swordReady window (opened when the auto-combo ended) hands
  // both bodies to the 2-slash sword cinematic (main.js). Also before the KO check so it always plays.
  if (live && move.anim === 'backkick' && att.swordReady > 0 && att.state === 'attack'
      && !['downed', 'fallheavy', 'crumple', 'wallsplat'].includes(vic.state)) {
    startSwordCombo(att, vic, game);   // clears att.swordReady
    return;
  }

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

  // ── PULL / VACUUM — yank the victim TOWARD the caster (inverse knockback): the slow zoner's "get over here" ──
  // Anchor the direction on the ATTACKER (att.x), NOT the passed sourceX — a projectile's sourceX is the
  // round's position, but we always want "toward the caster". A minGap clamp stops her pulling them PAST her.
  // Grounded → pushVel (auto wall-clamped + separateBodies'd); airborne → vx (separateBodies skips air, so the
  // clamp is the only guard). Blocked hits never reach here (block returns earlier) → block is the counterplay.
  if (move.pull && vic.state !== 'downed') {
    const pAway = Math.sign(vic.x - att.x) || att.facing;          // attacker→victim; -pAway = victim→attacker
    const room = Math.max(0, Math.abs(vic.x - att.x) - CFG.BODY_W);   // never drag them PAST / into her
    if (vic.isAirborne()) {
      // air has NO friction → a persistent vx would fling a juggled foe straight past her. Drag via a ONE-SHOT
      // position snap (clamped to `room` so it can never cross her) and ZERO the residual so there's no drift.
      vic.x += -pAway * Math.min((move.pullVx || 12) * 2, room);
      vic.vx = 0;
    } else {
      vic.receiveHitstun(Math.round(move.hitstun || CFG.MAGNET_HITSTUN));   // lock them so they ride the drag (zeroes vx/vy)
      vic.pushVel = -pAway * Math.min(move.pullVx || 12, room);     // ground channel: pushVel decays + separateBodies clamps
    }
    game.hitstop = Math.max(game.hitstop, move.hitstop || CFG.HITSTOP_MED);
    spawnSpark(contactPoint.x, contactPoint.y, 'hit', 1);
    if (live) { att.moveHitDone = true; att.madeContact = true; att.madeHit = true; }
    return;   // skip the generic away-knockback funnel
  }

  // ── MAGIC PUNCH COMBO starter glue (the middle links: cross @2, uppercut @3) ──
  // These stay GROUNDED and re-stun instead of launching, so the 4-move starter reliably connects
  // all the way to its final cross (which fired the auto-combo above at chain 4). The chain is armed
  // by the INPUT sequence (fighter.js startMove) + the magnet pulls each link into range; honored
  // only on a real CLEAN hit, so blocking the string still defends. chain 4 already returned above.
  if (live && att.punchChain >= 2 && att.state === 'attack'
      && !vic.isAirborne() && !['downed', 'fallheavy', 'crumple', 'wallsplat'].includes(vic.state)) {
    // grounded, normal-state victim only — airborne/downed/special bodies fall through to their
    // own reaction branches (no teleport-snap, juggle/OTG rules intact); flyuppercut (state
    // 'flyattack') keeps its launcher.
    vic.vx = 0; vic.vy = 0;
    vic.receiveHitstun(CFG.MAGNET_HITSTUN);
    vic.pushVel = away * 1.5;                       // barely any push — the magnet stays glued
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

  // EXTEND THRUST sweet-spot (TIPPED): caught on the very tip of the spear → an explosive pop that knocks
  // the wind out of them — they get up with ZERO stamina (held at 0 by staminaLock).
  if (live && move.tipSpot && Math.abs(vic.x - att.x) >= move.tipSpot && !vic.isAirborne() && vic.state !== 'downed') {
    game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER + 6);
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 3);
    game.flash = Math.max(game.flash, 7); game.flashMax = Math.max(game.flashMax, 7);
    spawnBlast(contactPoint.x, contactPoint.y); spawnSpark(contactPoint.x, contactPoint.y, 'hit', 2);
    spawnFloatText(vic.x, vic.y - CFG.BODY_H - 36, 'TIPPED!', '#ffd54f');
    playSfx('explosion');
    vic.stamina = 0; vic.staminaLock = CFG.TIPPED_STAMINA_LOCK;   // winded — no stamina on wakeup
    vic.setLaunched(away * 8, -11, true); vic.noTech = true;
    return;
  }

  // SMITE: the bolt SEIZES them in place — electrocution (a hittable-but-unbreakable stun; see the top of landAttack).
  if (live && move.electrocute && !vic.isAirborne() && vic.state !== 'downed' && vic.state !== 'electrified') {
    vic.electrified = CFG.ELECTRIC_FRAMES;
    vic.setState('electrified');
    spawnElectric(contactPoint.x, contactPoint.y, CFG.ELECTRIC_BURST);
    game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER);
    game.flash = Math.max(game.flash, 6); game.flashMax = Math.max(game.flashMax, 6);
    playSfx('electrocute');
    spawnFloatText(vic.x, vic.y - CFG.BODY_H - 30, 'ZAP!', '#9fe8ff');
    return;
  }

  // CRESCENT SLAM direct hit — the world STOPS, the ground ERUPTS like a wall-spike, then they BOUNCE sky-high.
  // Fires on AIRBORNE victims too (a combo into the slam still devastates — it slams them out of the air).
  if (live && move.crescentSlam && vic.state !== 'downed') {
    vic.hp = Math.max(0, vic.hp - CFG.CRESCENT_BONUS);          // on top of the base damage already applied → devastating
    vic.y = CFG.FLOOR_Y;                                        // SLAMMED to the floor
    game.hitstop = Math.max(game.hitstop, CFG.CRESCENT_FREEZE); // the world stops for a beat
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 8);
    game.flash = Math.max(game.flash, CFG.KO_FLASH); game.flashMax = Math.max(game.flashMax, CFG.KO_FLASH);
    spawnSpike(vic.x, away);                                    // the ground erupts (energy lance + splash)
    spawnRumble(vic.x, CFG.FLOOR_Y - 30, 1); spawnRumble(vic.x, CFG.FLOOR_Y - 30, -1);
    spawnBlast(vic.x, CFG.FLOOR_Y - 50); spawnBlood(vic.x, CFG.FLOOR_Y - 24, away, 28); spawnDust(vic.x, CFG.FLOOR_Y, 22);
    spawnSpark(vic.x, CFG.FLOOR_Y - 60, 'hit', 2);
    playSfx('wall_spike'); playSfx('explosion');
    spawnFloatText(vic.x, CFG.FLOOR_Y - CFG.BODY_H - 30, 'SLAM!!', '#ffd54f');
    pushFeed('CRESCENT SLAM!!', att.color);
    vic.setLaunched(away * 3, CFG.CRESCENT_BOUNCE_VY, true); vic.noTech = true;   // rocket them VERY high off the ground
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
    // ELECTRIC OVERHAND: a horizontal SIDE SPIKE (blasts them dead-flat across the stage)
    // + a lingering electrocution (DoT + seize) that arms now and begins once they LAND.
    if (move.sideSpike) {
      vic.receiveSideSpike(away, game);                          // generic horizontal blast (its own particle + sidespike sfx)
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 6);
      if (move.electric) {                                       // electrocution + the dramatic beat are overhand-specific
        vic.pendingElectric = CFG.ELECTRIC_FRAMES;
        game.hitstop = Math.max(game.hitstop, CFG.OVERHAND_FREEZE);
        game.flash = Math.max(game.flash, CFG.OVERHAND_FLASH); game.flashMax = Math.max(game.flashMax, CFG.OVERHAND_FLASH);
        spawnElectric(contactPoint.x, contactPoint.y, CFG.ELECTRIC_BURST);   // big blue explosion off the fist
        playSfx('overhand_hit');
      }
      return;
    }
    // sideSpikeAir (spinning back kick): a TUMBLING/AERIAL victim gets side-spiked flat
    // across the stage instead of the normal blast. A grounded body takes the blast below.
    if (move.sideSpikeAir && vic.isAirborne()) {
      vic.receiveSideSpike(away, game);
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 4);
      return;
    }
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
    // SIDE SPIKE vs an AIRBORNE/TUMBLING body (spinning back kick): blast them dead-flat
    // across the stage instead of juggling. Generic — no electrocution unless move.electric.
    if (move.sideSpikeAir) {
      vic.receiveSideSpike(away, game);
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 4);
      return;
    }
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
    // a 20mm shell ALWAYS blasts the body — exempt the super from the juggle cap so it
    // never lands as a dud (damage but no reaction) on an already over-juggled body.
    if (move.isSuper || vic.airHits <= (move.airHitCap || CFG.MAX_AIR_HITS)) vic.setLaunched(away * Math.max(2, move.kbx), Math.min(vic.vy, -7) - 2, false);   // per-move juggle cap (AR rounds raise it so the upshot column keeps them up)
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

  // ── SPIKE (elbow drop / axe kick) vs a STANDING body ──
  // Drive them straight into the floor with enough energy to BOUNCE → hard, untechable
  // knockdown + OTG. (Airborne/tumbling victims are spiked in the isAirborne branch above.)
  if (move.spike != null) {
    vic.receiveSpike(move.spike, away, game);
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

// A Bullet-Arts round — small, fast, chest height. Carries BULLET_MOVE for the collision.
function spawnBullet(owner) {
  const d = owner.facing;
  Projectiles.push({
    x: owner.x + d * 46,
    y: CFG.FLOOR_Y - 128 + (Math.random() - 0.5) * 12,
    vx: d * CFG.BULLET_SPEED,
    w: 22, h: 8,
    owner, move: BULLET_MOVE, kind: 'bullet', dead: false, age: 0,
  });
  playSfx('hit_med');   // a gunshot pop (placeholder until a dedicated round sfx)
}

// ◀P PISTOL SHOT — one aimed round downrange. Crumples on hit (PISTOL_ROUND_MOVE).
function spawnPistolRound(owner) {
  const d = owner.facing;
  Projectiles.push({
    x: owner.x + d * 50,
    y: CFG.FLOOR_Y - 128,
    vx: d * CFG.PISTOL_ROUND_SPEED,
    w: 28, h: 12, owner, move: PISTOL_ROUND_MOVE, kind: 'bullet', dead: false, age: 0,
  });
  playSfx('pistol_shot');
}

// ↓K RIFLE — one big, fast round fired from the crouch. Heavy damage + a hard blast knockback.
function spawnRifleRound(owner) {
  const d = owner.facing;
  Projectiles.push({
    x: owner.x + d * 52, y: CFG.FLOOR_Y - 72,   // crouch height
    vx: d * CFG.RIFLE_ROUND_SPEED, w: 42, h: 18,
    owner, move: RIFLE_ROUND_MOVE, kind: 'bullet', dead: false, age: 0,
  });
  playSfx('rifle_shot');
}

// BULLET CLIMAX volley — a few rounds at staggered heights (the barrage wall).
// WRATH OF GOD meteor — a magic rock that falls from the heavens (kind:'magic' so it resolves through landAttack).
const WRATH_MOVE = { anim: 'bullet', damage: CFG.WRATH_DMG, guard: 'mid', blockstun: 10, hitstun: 0, hitstop: 3, kbx: 0, kind: 'magic', launcher: true, launchVy: -8, airHitCap: 12, label: 'WRATH' };   // LOW hitstop so the barrage flows (a storm, not a stutter)
function spawnWrathVolley(owner) {
  const opp = owner.opp;
  const targetX = opp ? opp.x : owner.x;
  for (let i = 0; i < 3; i++) {
    // most meteors CONVERGE on the foe (reliable damage); one scatters wide (the screen-filling wrath look)
    const mx = i === 0
      ? CFG.WALL_L + 40 + Math.random() * (CFG.WALL_R - CFG.WALL_L - 80)
      : targetX + (Math.random() - 0.5) * 170;
    Projectiles.push({
      x: Math.max(CFG.WALL_L + 20, Math.min(CFG.WALL_R - 20, mx)),
      y: -60 - Math.random() * 150, vx: 0, vy: CFG.WRATH_SPEED, grav: CFG.WRATH_GRAV,
      w: 40, h: 54, owner, move: WRATH_MOVE, kind: 'magic', hue: 'tremor', dead: false, age: 0,
    });
  }
  playSfx('explosion');
}
function spawnClimaxVolley(owner) {
  const d = owner.facing;
  for (let i = 0; i < 2; i++) {
    Projectiles.push({
      x: owner.x + d * 50,
      y: CFG.FLOOR_Y - 60 - Math.random() * 120,        // spread across the body height
      vx: d * (CFG.RIFLE_ROUND_SPEED * 0.8 + Math.random() * 8),   // FAST rifle rounds
      w: 34, h: 14, owner, move: AR_BULLET_MOVE, kind: 'bullet', dead: false, age: 0,   // big rifle bullets (juggle)
    });
  }
  playSfx('rifle_shot');
}

// The OVERDRIVE BEAM: while the forward-super fighter is in its firing window, a giant
// hitbox engulfs a big chunk of the screen in front of them, multi-hitting the opponent,
// dragging them to the wall, then DETONATING on the final frame. Driven entirely off the
// firing fighter's state + f — no separate entity to manage. Blockable (chip) if guarded.
function updateBeam(att, vic, game) {
  const FIRE0 = CFG.BEAM_CHARGE;
  const FIRE1 = CFG.BEAM_CHARGE + CFG.BEAM_ACTIVE;
  if (att.f < FIRE0 || att.f >= FIRE1) return;          // charge + recovery: no beam
  game.shake = Math.max(game.shake, CFG.SHAKE_MED);     // the whole screen rumbles while it fires
  if (att.f === FIRE0) { playSfx('explosion'); playSfx('beam_fire'); }   // BLAST-OUT — the beam erupts (layered)

  const dir = att.facing;
  const cy = CFG.FLOOR_Y - 130;
  const ox = att.x + dir * 56;                          // beam origin = the cupped hands
  const beam = { x: dir === 1 ? ox : ox - CFG.BEAM_LEN, y: cy - CFG.BEAM_H / 2, w: CFG.BEAM_LEN, h: CFG.BEAM_H };
  // a downed/fallen body is left alone (don't yank it up into the beam); everyone else can be engulfed
  const engulfed = vic.hp > 0 && vic.invuln <= 0 && vic.state !== 'fallheavy' && vic.state !== 'downed' && rectsOverlap(beam, vic.hurtbox());
  if (!engulfed) return;

  const blocking = canBlock(vic, att.x, BEAM_MOVE);
  const last = att.f === FIRE1 - 1;                      // DETONATE on the final firing frame (once)
  const tick = (att.f - FIRE0) % CFG.BEAM_HIT_INTERVAL === 0;

  if (last) {
    if (blocking) {
      // a clean guard SURVIVES the detonation — heavy chip (still floored, chip can't KO) + a hard shove, no launch
      vic.hp = Math.max(CFG.CHIP_FLOOR, vic.hp - CFG.BEAM_TICK_CHIP * 3);
      vic.receiveBlockstun(16);
      vic.pushVel = dir * CFG.BEAM_BLOCK_PUSH * 1.6;
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
      game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_MED);
      spawnSpark(vic.x - dir * CFG.BODY_W / 2, cy, 'block');
      playSfx('explosion');
      return;
    }
    vic.hp = Math.max(0, vic.hp - CFG.BEAM_FINISH_DMG);
    vic.setLaunched(dir * CFG.BEAM_FINISH_VX, CFG.BEAM_FINISH_VY, true);
    if (vic.hp <= 0) vic.noTech = true;                  // can't tech your own erasure
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 6);
    game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER);
    game.flash = CFG.KO_FLASH; game.flashMax = Math.max(game.flashMax, CFG.KO_FLASH);   // white detonation pop
    spawnBlood(vic.x, cy, dir, CFG.HEAVY_BLOOD + 14);
    spawnSpark(vic.x, cy, 'hit', 2);
    playSfx('explosion');
    return;
  }

  // continuous drag toward the wall (every firing frame → smooth with render interp)
  if (blocking) {
    vic.pushVel = dir * CFG.BEAM_BLOCK_PUSH;
  } else {
    vic.x = Math.max(CFG.WALL_L + CFG.BODY_W / 2, Math.min(CFG.WALL_R - CFG.BODY_W / 2, vic.x + dir * CFG.BEAM_PUSH));
  }

  if (!tick) return;                                      // damage only on the tick cadence
  if (blocking) {
    vic.hp = Math.max(CFG.CHIP_FLOOR, vic.hp - CFG.BEAM_TICK_CHIP);
    vic.receiveBlockstun(CFG.BEAM_HIT_INTERVAL + 3);      // held in guard through the beam
    spawnSpark(vic.x - dir * CFG.BODY_W / 2, cy + (Math.random() - 0.5) * 80, 'block');
    playSfx('block');
  } else {
    vic.hp -= CFG.BEAM_TICK_DMG;
    if (vic.hp <= 0) { vic.hp = 0; vic.setLaunched(dir * 12, -11, true); vic.noTech = true; return; }
    vic.receiveHitstun(CFG.BEAM_HIT_INTERVAL + 4);        // re-stunned each tick → locked in the beam
    spawnSpark(vic.x, cy + (Math.random() - 0.5) * CFG.BEAM_H * 0.5, 'hit', 1);
    playSfx('hit_med');
  }
}

function updateProjectiles(f1, f2, game) {
  for (const p of Projectiles) {
    if (p.dead) continue;
    p.age++;
    p.x += p.vx;
    if (p.vy) p.y += p.vy;          // arced bursts (uzi arc, etc.)
    if (p.grav) p.vy += p.grav;
    const vic = p.owner === f1 ? f2 : f1;
    const move = p.move || SUPER_MOVE;
    const isB = p.kind === 'bullet' || p.kind === 'magic';   // magic orbs get the light bullet FX, not the cannon blast
    const rect = { x: p.x - p.w / 2, y: p.y, w: p.w, h: p.h };
    // armDelay: a placed TRAP (lantern) is inert for its first few frames so it can't be cast AS a melee.
    if (vic.hp > 0 && vic.invuln <= 0 && vic.state !== 'fallheavy' && p.age >= (p.armDelay || 0) && rectsOverlap(rect, vic.hurtbox())) {
      landAttack(p.owner, vic, move, game, p.x - p.vx * 2, { x: p.x + Math.sign(p.vx) * p.w / 2, y: p.y + p.h / 2 });
      // Override chip: a 20mm shell hurts through a guard (cannon only — bullets chip via landAttack).
      if (!isB && vic.state === 'blockstun') {
        vic.hp = Math.max(CFG.CHIP_FLOOR, vic.hp - (CFG.SUPER_CHIP - Math.round(CFG.SUPER_DMG * CFG.CHIP_RATIO)));
        vic.pushVel = Math.sign(p.vx) * 14;
      }
      p.dead = true;
      game.shake = Math.max(game.shake, isB ? CFG.SHAKE_LIGHT : CFG.SHAKE_HEAVY + 3);
      spawnSpark(p.x + Math.sign(p.vx) * p.w / 2, p.y + p.h / 2, 'hit', isB ? 0 : 2);
      if (!isB) playSfx('explosion');
      // the RIFLE round (the only blast-class bullet) DETONATES on impact — a real explosion.
      if (isB && move.blast) {
        const ix = p.x + Math.sign(p.vx) * p.w / 2, iy = p.y + p.h / 2;
        spawnBlast(ix, iy);
        spawnSpark(ix, iy, 'hit', 2);
        game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 2);
        game.flash = Math.max(game.flash, 5); game.flashMax = Math.max(game.flashMax, 5);
        playSfx('explosion');
      }
      // TREMOR (Xamora) DETONATES into a HUGE ground blast — fire + debris + billowing smoke.
      if (p.kind === 'magic' && (move === TREMOR_MOVE || move === SHOCKWAVE_MOVE)) {
        const ix = p.x, dir = Math.sign(p.vx) || 1;
        spawnBlast(ix, CFG.FLOOR_Y - 52); spawnBlast(ix, CFG.FLOOR_Y - 92);
        spawnSpike(ix, dir);
        spawnRumble(ix, CFG.FLOOR_Y - 30, dir); spawnRumble(ix, CFG.FLOOR_Y - 30, -dir);
        spawnDust(ix, CFG.FLOOR_Y, 20); spawnDust(ix - 44, CFG.FLOOR_Y, 10); spawnDust(ix + 44, CFG.FLOOR_Y, 10);   // billowing smoke
        spawnSpark(ix, CFG.FLOOR_Y - 50, 'hit', 2);
        game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 5);
        game.flash = Math.max(game.flash, 9); game.flashMax = Math.max(game.flashMax, 9);
        playSfx('explosion');
      }
      // LANTERN (Xamora) DETONATES where it hangs — a contained magic burst that pops them up.
      if (p.kind === 'magic' && move === LANTERN_MOVE) {
        spawnBlast(p.x, p.y + p.h * 0.4); spawnSpark(p.x, p.y + p.h * 0.3, 'hit', 2);
        game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
        game.flash = Math.max(game.flash, 6); game.flashMax = Math.max(game.flashMax, 6);
        playSfx('explosion');
      }
    }
    // the lantern is STATIONARY (never goes off-screen) — fizzle it on its own timer instead.
    if (p.move === LANTERN_MOVE && p.age > CFG.LANTERN_LIFE) { spawnDust(p.x, p.y + p.h * 0.4, 6); p.dead = true; }
    if (p.x < -200 || p.x > CFG.STAGE_W + 200 || p.y < -260 || p.y > CFG.FLOOR_Y + 60) p.dead = true;
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
  if (game.cine) return;   // a cine spun up mid-fighter-update owns both bodies — no stray melee/projectile this frame
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
  for (const f of [f1, f2]) if (f.state === 'superstart' && f.superKind === 'beam') updateBeam(f, f === f1 ? f2 : f1, game);
  separateBodies(f1, f2);
}
