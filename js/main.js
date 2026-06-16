// ─────────────────────────────────────────────────────────────
// Main: fixed-timestep loop (60 logic fps), hitstop / super-freeze /
// KO slow-mo gating, match flow, system keys (dummy modes, debug).
// ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// crisp nearest-neighbor scaling ONLY when the retro filter is on; smooth otherwise
canvas.style.imageRendering = Retro.enabled ? 'pixelated' : 'auto';

const pad1 = new Pad(P1_MAP);
const pad2 = new Pad(P2_MAP);

const game = {
  fighters: [
    new Fighter(CFG.STAGE_W * 0.35, 1, pad1, 'PLAYER 1', '#4fc3f7', CHARACTERS.brawler),
    new Fighter(CFG.STAGE_W * 0.65, -1, pad2, 'PLAYER 2', '#ef5350', CHARACTERS.brawler),
  ],
  hitstop: 0,
  superFreeze: 0,
  superWho: null,
  shake: 0,
  slowmo: 0,
  frame: 0,
  matchState: 'fight',
  banner: { text: 'FIGHT!', sub: '', timer: 70 },
  dummyMode: 0,   // 0 human · 1 idle dummy · 2 auto-block dummy · 3 CPU
  debug: false,
  execution: null,        // { att, vic, f, startHp } while the finisher cinematic runs
  executionKill: false,   // KO banner reads EXECUTED instead of K.O.
  counter: null,          // { att, vic, move, f } while the counter-hit cinematic runs
  flash: 0,               // white screen-flash countdown (counter-hit / KO), decays each frame
  flashMax: 0,            // the seed the live flash started from — render divides by it
  cine: null,             // ONE canned-cinematic slot: { kind:'suplex'|'groundpound'|'flatliner', att, vic, f, data }
  flatlinerKill: false,   // KO banner reads FLATLINED instead of K.O./EXECUTED
  comboKill: false,       // KO banner reads FINISHED — the back-super sword finisher
  feed: [],               // strike feed (newest first), drawn by ui.js
  koFreeze: 0,            // KO cinematic: frames the world holds on black + white silhouettes before the launch
  muted: false,           // mirror of SFX.muted (toggled with M)
  scene: 'title',         // front-end scene: title | mode | movelist | fight | paused (driven by menu.js)
  menu: { sel: 0, scroll: 0, t: 0, returnTo: 'mode' },
};

let cpu = new CPU();

// The Write-Off: grab → 12-hit flurry (escalating) → dead-still wind-up → one
// mega haymaker into a wall splat. Pre-baked; the sequencer drives both bodies.
function startExecution(att, vic, game) {
  game.execution = { att, vic, f: 0, startHp: vic.hp };
  game.executionKill = true;
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  vic.facing = -att.facing;
  att.setState('execute');
  vic.setState('executed');
  pushFeed('EXECUTION…', att.color);
}

const EXEC_GRAB = 20, EXEC_FLURRY = 72, EXEC_WINDUP = 30;

function runExecution(game) {
  const ex = game.execution;
  ex.f++;
  const { att, vic } = ex;
  att.f = ex.f;   // drive both anim clocks from the sequencer
  vic.f = ex.f;
  if (ex.f === 1) playSfx('exec_grab');
  if (ex.f <= EXEC_GRAB) {
    // drag them into range, slow menace
    vic.x += (att.x + att.facing * 78 - vic.x) * 0.15;
  } else if (ex.f <= EXEC_GRAB + EXEC_FLURRY) {
    const t = ex.f - EXEC_GRAB;
    if (t % 6 === 0) {
      spawnSpark(vic.x - vic.facing * 12, CFG.FLOOR_Y - 100 - Math.random() * 50, 'hit');
      game.shake = Math.max(game.shake, 2 + t / 12);
      vic.hp = Math.max(1, Math.round(ex.startHp * (1 - t / EXEC_FLURRY)));
      playSfx('exec_punch');
    }
  } else if (ex.f === EXEC_GRAB + EXEC_FLURRY + 1) {
    playSfx('exec_riser');
  } else if (ex.f === EXEC_GRAB + EXEC_FLURRY + EXEC_WINDUP) {
    // the release
    vic.hp = 0;
    vic.setLaunched(att.facing * 16, -11, true);
    vic.noTech = true;                       // the finisher launch is un-techable (set after setLaunched)
    att.setState('idle');
    game.execution = null;
    game.hitstop = 14;
    game.shake = CFG.SHAKE_HEAVY + 4;
    spawnSpark(vic.x, CFG.FLOOR_Y - 120, 'hit');
    playSfx('exec_blast');
    pushFeed('EXECUTED.', '#ff5252');
  }
}

// The Counter: catch them mid-startup → flash, slip the shot, then one hard
// blow (their weapon's kind decides punch/kick) into a knockdown. Pre-baked;
// the sequencer drives both bodies, exactly like the execution above.
function startCounter(att, vic, move, game) {
  game.counter = { att, vic, move, f: 0 };
  game.flash = CFG.COUNTER_FLASH; game.flashMax = CFG.COUNTER_FLASH;
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  vic.facing = -att.facing;
  att.counterKind = move.kind;       // render.js strikeTo reads this on the blow
  att.counterCD = CFG.COUNTER_COOLDOWN;
  att.setState('slipcounter');
  vic.setState('countered');
  spawnFloatText(att.x, att.y - CFG.BODY_H - 30, 'COUNTER!', '#ffe082');
  pushFeed('COUNTER!', att.color);
  playSfx('counter_slip');
}

function runCounter(game) {
  const ex = game.counter;
  ex.f++;
  const { att, vic, move } = ex;
  att.f = ex.f;   // drive both anim clocks from the sequencer
  vic.f = ex.f;
  if (ex.f <= CFG.COUNTER_SLIP) {
    // hold the victim pinned in front through the slip windup
    vic.x += (att.x + att.facing * 70 - vic.x) * 0.2;
  } else if (ex.f === CFG.COUNTER_IMPACT) {
    // the blow: a scaled-up version of the move they got caught throwing
    const dmg = Math.round(move.damage * CFG.COUNTER_DMG_MULT + CFG.COUNTER_BONUS);
    vic.hp = Math.max(0, vic.hp - dmg);
    game.hitstop = 12;
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 3);
    spawnSpark(vic.x - att.facing * 16, CFG.FLOOR_Y - 110, 'hit');
    spawnSpark(vic.x - att.facing * 4, CFG.FLOOR_Y - 130, 'parry');   // gold accent — it's special
    playSfx('counter_hit');
    playSfx('hit_heavy');
    pushFeed(`COUNTER ${MOVE_LABELS[move.anim] || move.anim} — ${dmg}!`, '#ffe082');
    vic.setLaunched(att.facing * CFG.COUNTER_LAUNCH_VX, CFG.COUNTER_LAUNCH_VY, true);
    vic.noTech = vic.hp <= 0;                 // a non-lethal counter IS techable (back-roll/kip-up on landing); only a LETHAL counter can't be teched out of
  } else if (ex.f >= CFG.COUNTER_END) {
    // the release — attacker recovers, KO (if any) resolves next frame in logicStep
    att.setState('idle');
    game.counter = null;
  }
}

// ── Cinematic harness (ONE slot for ALL canned moves) ──────────
// Modeled on execution/counter above. Each canned move (suplex / ground&pound /
// flatliner) registers a per-kind run callback in CINE_RUN; the harness drives
// both fighters' anim clocks and the body of the move clears game.cine when done.
function startCine(kind, att, vic, game, data) {
  game.cine = { kind, att, vic, f: 0, data: data || {} };
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  vic.facing = -att.facing;
}

// Empty per-kind run stubs — filled in by the canned-move steps (suplex / G&P /
// flatliner). Each MUST eventually set both bodies' states and clear game.cine.
// The fallback clear here keeps a half-built kind from soft-locking the game.
// GERMAN SUPLEX: backward over-the-head bridge that SPIKES the victim head-first
// on the FAR side (side switch), hard untechable knockdown, big damage. Owns BOTH
// bodies AND the throw-tech read (the fighters' update() is skipped under the cine
// gate). The lethal spike leaves vic.hp possibly 0 → logicStep's KO block fires the
// shared slow-mo + flash next frame, once game.cine is cleared.
function runSuplexCine(game, ex) {
  const { att, vic } = ex;
  // THROW TECH: mash P+K in the opening frames → break the bridge, both reset.
  if (vic.techWindow > 0) {
    vic.techWindow--;
    if (vic.pad.pressed.punch && vic.pad.pressed.kick) {
      vic.pad.consume('punch'); vic.pad.consume('kick');
      const away = Math.sign(vic.x - att.x) || -vic.facing;
      vic.pushVel = away * CFG.THROW_TECH_PUSHBACK; att.pushVel = -away * CFG.THROW_TECH_PUSHBACK;
      vic.y = CFG.FLOOR_Y; vic.thrower = null;
      vic.setState(vic.stamina <= 0 ? 'gassed' : 'idle');
      att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
      game.cine = null; game.hitstop = Math.max(game.hitstop, 6);
      spawnDust(vic.x, CFG.FLOOR_Y, 8); playSfx('throw_grab');
      pushFeed('SUPLEX TECH!', vic.color);
      return;
    }
  }
  // backward over-the-head BRIDGE: interp from→to, sin arc up & over, spike behind.
  const t = Math.min(1, ex.f / CFG.SUPLEX_FRAMES);
  vic.x = vic.thrownFrom + (vic.thrownTo - vic.thrownFrom) * t;
  vic.y = CFG.FLOOR_Y - Math.sin(Math.pow(t, 0.85) * Math.PI) * CFG.SUPLEX_ARC_H;
  // the thrower side-switches with the bridge: flip to the OPPOSITE side at the apex
  if (ex.f === Math.round(CFG.SUPLEX_FRAMES * 0.5)) att.facing = -att.facing;
  if (ex.f >= CFG.SUPLEX_FRAMES) {
    vic.y = CFG.FLOOR_Y;
    vic.hp = Math.max(0, vic.hp - CFG.SUPLEX_DMG);
    vic.setState('fallheavy'); vic.noTech = true; vic.thrower = null;   // spiked — untechable hard knockdown
    att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
    game.cine = null;
    game.hitstop = Math.max(game.hitstop, 14);
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 5);
    spawnSpark(vic.x, CFG.FLOOR_Y - 24, 'hit'); spawnDust(vic.x, CFG.FLOOR_Y, 16);
    playSfx('throw_slam'); playSfx('body_slam');
    // lethal spike → logicStep's existing KO block fires slow-mo + flash next frame
  }
}
// GROUND & POUND entry: mount a DOWNED opponent and hand BOTH bodies to the shared
// canned-cinematic harness (kind:'groundpound'). The flurry drains the victim's
// STAMINA and deals HP (can KO). Sets the attacker's re-mount cooldown.
function startGroundPound(att, vic, game) {
  att.groundpoundCD = CFG.GROUNDPOUND_COOLDOWN;
  att.setState('gpmount');
  vic.setState('gpmounted');
  vic.invuln = 0;            // pinned + owned by the sequencer — no stray hits reach them anyway
  startCine('groundpound', att, vic, game);   // the harness owns both bodies + faces them from here
  playSfx('throw_grab');
  pushFeed('MOUNT!', att.color);
}

// Ground & Pound: mount → 4 hammerfists that DRAIN STAMINA + deal HP (can KO),
// then dismount and re-seat the victim DOWNED on the floor for oki (true okizeme).
function runGroundPoundCine(game, ex) {
  const { att, vic } = ex;
  if (ex.f <= CFG.GP_MOUNT) {
    // seat onto the body, slow menace (no damage)
    vic.x += (att.x + att.facing * 40 - vic.x) * 0.2;
  } else if (ex.f <= CFG.GP_MOUNT + CFG.GP_FLURRY) {
    const t = ex.f - CFG.GP_MOUNT;
    if (t % CFG.GP_BEAT === 1) {   // 4 hammerfists across the flurry
      vic.stamina = Math.max(0, vic.stamina - CFG.GROUNDPOUND_DRAIN_PER_HIT);
      vic.hp -= CFG.GROUNDPOUND_DMG_PER_HIT;                                     // now it HURTS
      vic.hitFlash = CFG.HIT_FLASH;                                             // white pop per hammerfist
      spawnSpark(vic.x, CFG.FLOOR_Y - 36 - Math.random() * 14, 'hit', 1);
      spawnBlood(vic.x, CFG.FLOOR_Y - 40, att.facing, 4);
      game.shake = Math.max(game.shake, 4);
      game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_LIGHT);
      playSfx('hit_med');
      playSfx('body_blow');
      if (vic.hp <= 0) {   // a hammerfist FINISHED them → dismount + KO (logicStep's KO block fires next frame)
        vic.hp = 0;
        att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
        vic.setLaunched(att.facing * 4, -7, true); vic.noTech = true;
        spawnBlood(vic.x, CFG.FLOOR_Y - 70, att.facing, 22);
        game.cine = null;
      }
    }
  } else if (ex.f >= CFG.GP_MOUNT + CFG.GP_FLURRY + CFG.GP_OUT) {
    // dismount → attacker recovers; victim re-seated DOWNED with a fresh floor timer
    // so the knockdown game continues (true oki) — if they survived the flurry.
    att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
    vic.setState(vic.stamina <= 0 ? 'gassed' : 'downed');
    spawnDust(vic.x, CFG.FLOOR_Y, 8);
    game.cine = null;
    pushFeed('GROUND & POUND!', att.color);
  }
}
// THE FLATLINER entry: a just-frame overhand connected clean (combat.js diverted here
// out of the blast branch). Hand BOTH bodies to the shared cine harness (kind:'flatliner').
// White flash + a SMALL impact hitstop ONLY — runFlatlinerCine OWNS the full freeze via
// its own ex.f<=FLATLINER_FREEZE branch (setting game.hitstop=FLATLINER_FREEZE here too
// would double-count: logicStep returns early while hitstop>0, so ex.f wouldn't advance).
function beginFlatliner(att, vic, game) {
  game.flash = CFG.FLATLINER_FLASH; game.flashMax = CFG.FLATLINER_FLASH;
  vic.noTech = true;
  game.hitstop = Math.max(game.hitstop, 6);   // small impact pop — NOT the full freeze (that's runFlatlinerCine's job)
  game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 4);
  spawnSpark(vic.x - att.facing * 10, CFG.FLOOR_Y - 150, 'hit');
  spawnSpark(vic.x - att.facing * 2, CFG.FLOOR_Y - 130, 'parry');   // gold accent — it's special
  spawnFloatText(vic.x, vic.y - CFG.BODY_H - 30, 'FLATLINE!', '#fff59d');
  startCine('flatliner', att, vic, game);   // faces both bodies; sets att/vic states below
  att.setState('attack'); att.move = MOVES.overhand; att.moveName = 'overhand';   // hold the overhand connect; sequencer drives att.f
  vic.setState('hitstun');                                                        // snapped-back recoil, frozen on the fist — then BLASTED flying on release
  playSfx('flatliner_freeze');
  pushFeed('THE FLATLINER!!', att.color);
}

// THE FLATLINER cinematic: dead-still freeze on the connected fist, then the body
// folds straight down into a heap — one-punch KO. The release drops vic.hp to 0 and
// re-seats both bodies; logicStep's KO block fires the shared slow-mo + flash next frame.
function runFlatlinerCine(game, ex) {
  const { att, vic } = ex;
  if (ex.f === 1) { playSfx('flatliner_hit'); spawnBlood(vic.x, CFG.FLOOR_Y - 150, att.facing, 16); }   // spurt on the connect
  if (ex.f <= CFG.FLATLINER_FREEZE) {
    // frozen on the connected fist — keep the victim pinned where the punch met them
    vic.x += (att.x + att.facing * 60 - vic.x) * 0.12;
  } else if (ex.f === CFG.FLATLINER_FREEZE + 1) {
    playSfx('flatliner_drop');
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
  } else if (ex.f >= CFG.FLATLINER_END) {
    // the release — one-punch KO: the body is BLASTED clean off its feet in a spray
    // of blood and flies. Un-techable; logicStep's KO block fires the slow-mo + flash.
    vic.hp = 0;
    const away = att.facing;
    vic.setLaunched(away * 18, -13.5, true); vic.noTech = true;   // sent FLYING, can't tech death
    spawnBlood(vic.x, CFG.FLOOR_Y - 130, away, 48);               // the money gout, trails behind the body
    spawnBlood(vic.x, CFG.FLOOR_Y - 80, away, 20);
    spawnSpark(vic.x, CFG.FLOOR_Y - 130, 'blood');
    att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
    game.flatlinerKill = true;                // KO banner reads 'FLATLINED.'
    game.cine = null;
    game.slowmo = CFG.FLATLINER_SLOWMO;       // ride out into the KO slow-mo
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 5);
    game.hitstop = Math.max(game.hitstop, 8);
    playSfx('flatliner_ko');
  }
}

// SUPER COMBO (back+super): the starter punch landed → an inescapable, accelerating
// 16-hit teleport flurry (the attacker zips around the victim hitting from all angles),
// then a 3-swipe SWORD finisher that KILLS. Owns both bodies via the shared cine harness.
function startSuperCombo(att, vic, game) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  // pin the victim off the walls so BOTH orbit sides always have room (no on-top-of-them clamp in the corner)
  const vicX = Math.max(CFG.WALL_L + 40 + CFG.COMBO_RADIUS, Math.min(CFG.WALL_R - 40 - CFG.COMBO_RADIUS, vic.x));
  startCine('supercombo', att, vic, game, {
    startHp: vic.hp, vicX, hits: 0, phase: 'flurry',
    nextHit: CFG.COMBO_START_DELAY, interval: CFG.COMBO_START_INTERVAL, poseF0: 0,
    swipe: 0, swordAt: 0,
  });
  att.setState('supercombo'); att.comboStrike = 'punch';
  vic.setState('executed');
  // unblockable command-grab (by design) — clear any lingering side-spike/electric/wall arming on the
  // grabbed body so it can't leak (mirrors beginClinch/beginThrown), and drop a stale noTech.
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.hitstop = Math.max(game.hitstop, 6);
  game.flash = Math.max(game.flash, 8); game.flashMax = Math.max(game.flashMax, 8);
  spawnSpark(vic.x, CFG.FLOOR_Y - 110, 'hit', 2);
  playSfx('hit_heavy');
  pushFeed('SUPER COMBO!!', att.color);
}

function runSuperComboCine(game, ex) {
  const { att, vic, data } = ex;
  vic.x = data.vicX; vic.y = CFG.FLOOR_Y;   // pin the victim; the attacker orbits them
  att.f = Math.max(0, ex.f - data.poseF0);  // strike/swipe pose animates from each teleport/swipe

  if (data.phase === 'flurry') {
    if (data.hits < CFG.COMBO_HITS && ex.f >= data.nextHit) {
      data.hits++;
      const side = (data.hits % 2 === 0) ? 1 : -1;
      const aerial = (data.hits % 3 === 0);
      const r = CFG.COMBO_RADIUS * (0.62 + (data.hits % 4) * 0.13);
      const ghostX = att.x, ghostY = att.y;                          // afterimage from the vacated spot
      att.x = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, vic.x + side * r));
      att.y = aerial ? CFG.FLOOR_Y - 64 - (data.hits % 2) * 42 : CFG.FLOOR_Y;
      att.facing = Math.sign(vic.x - att.x) || att.facing;
      att.comboStrike = (data.hits % 2 === 0) ? 'kick' : 'punch';
      data.poseF0 = ex.f;
      vic.hp = Math.max(1, Math.round(data.startHp * (1 - data.hits / (CFG.COMBO_HITS + 5))));   // chunk them low (sword finishes)
      spawnSpark(vic.x + (Math.random() - 0.5) * 44, CFG.FLOOR_Y - 80 - Math.random() * 70, 'hit', 1);
      spawnElectric(ghostX, ghostY - CFG.BODY_H * 0.5, 5);           // teleport streak off the old spot
      spawnDust(att.x, CFG.FLOOR_Y, 4);
      game.shake = Math.max(game.shake, 3 + data.hits * 0.4);
      playSfx(data.hits % 2 === 0 ? 'hit_heavy2' : 'hit_med');
      data.interval = Math.max(CFG.COMBO_MIN_INTERVAL, data.interval - CFG.COMBO_ACCEL);
      data.nextHit = ex.f + Math.round(data.interval);
    } else if (data.hits >= CFG.COMBO_HITS && ex.f >= data.nextHit) {
      // → the SWORD finisher: reappear beside them and draw the blade
      data.phase = 'sword'; data.poseF0 = ex.f; data.swipe = 0; data.swordAt = ex.f + CFG.SWORD_WINDUP;
      att.x = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, vic.x - att.facing * 80));
      att.y = CFG.FLOOR_Y; att.facing = Math.sign(vic.x - att.x) || att.facing;
      att.setState('swordfinish'); att.swordWind = true;   // blade RAISED through the windup (the slash only plays on a real swipe)
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
      game.hitstop = Math.max(game.hitstop, 8);
      playSfx('whoosh_heavy');
    }
  } else {   // sword: 3 slashes, the last one KILLS
    if (data.swipe < CFG.SWORD_SWIPES && ex.f >= data.swordAt) {
      data.swipe++; data.poseF0 = ex.f; att.swordWind = false;   // a real swipe → the slash sweep
      const last = data.swipe >= CFG.SWORD_SWIPES;
      // TELEPORT to a fresh angle for each slash (left, right, then the killing blow from ABOVE)
      const side = data.swipe % 2 === 1 ? -1 : 1;
      att.x = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, data.vicX + side * 84));
      att.y = last ? CFG.FLOOR_Y - 52 : CFG.FLOOR_Y;
      att.facing = Math.sign(data.vicX - att.x) || att.facing;
      spawnElectric(att.x, CFG.FLOOR_Y - CFG.BODY_H * 0.5, 5);   // teleport streak off the new spot
      spawnDust(att.x, CFG.FLOOR_Y, 4);
      const cy = CFG.FLOOR_Y - 110;
      spawnSpark(vic.x, cy + (Math.random() - 0.5) * 70, 'parry');   // bright slash flash
      spawnBlood(vic.x, cy, att.facing, last ? 44 : 14);
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + (last ? 6 : 2));
      game.hitstop = Math.max(game.hitstop, last ? CFG.HITSTOP_ENDER : 8);
      playSfx('hit_heavy');
      if (!last) {
        vic.hp = Math.max(1, vic.hp - Math.round(data.startHp * 0.12));
        data.swordAt = ex.f + CFG.SWORD_SWIPE_FRAMES;
      } else {
        // FINISH HIM — DECAPITATION: the head flies off as a physics object, body goes headless
        vic.hp = 0;
        vic.setLaunched(att.facing * 9, -8, true); vic.noTech = true;
        vic.decapitated = true;
        const hx = vic.x, hy = CFG.FLOOR_Y - CFG.BODY_H + 14;
        spawnHead(hx, hy, att.facing * (10 + Math.random() * 7), -14 - Math.random() * 4, '#e8c39e', vic.color);
        spawnBlood(hx, hy + 14, att.facing, 54);    // the neck geyser
        spawnBlood(hx, hy + 14, -att.facing, 26);
        spawnSpark(hx, hy, 'parry');
        att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
        game.comboKill = true;
        game.cine = null;
        pushFeed('DECAPITATED!!', att.color);
      }
    }
  }
}

// MAGIC PUNCH COMBO payoff: the player's jab→cross→uppercut→cross STARTER (fighter.js + combat.js)
// lands its final cross, which hands both bodies here. A short automatic teleport flurry — the
// attacker blinks around the locked victim landing MAGIC_COMBO_HITS, then LEAVES them standing in
// hitstun (no launch) so the player can immediately flow into another combo. No KO finisher: if the
// flurry's damage happens to be lethal it just resolves as a normal launch K.O.
function startMagicCombo(att, vic, game) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const vicX = Math.max(CFG.WALL_L + 40 + CFG.MAGIC_COMBO_RADIUS, Math.min(CFG.WALL_R - 40 - CFG.MAGIC_COMBO_RADIUS, vic.x));
  startCine('magiccombo', att, vic, game, {
    vicX, hits: 0, nextHit: CFG.MAGIC_COMBO_DELAY, interval: CFG.MAGIC_COMBO_INTERVAL, poseF0: 0,
  });
  att.setState('magiccombo'); att.comboStrike = 'punch'; att.punchChain = 0;
  vic.setState('executed');
  // locked body (cinematic) — clear any lingering side-spike/electric/wall arming so it can't leak
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.hitstop = Math.max(game.hitstop, 6);
  game.flash = Math.max(game.flash, 8); game.flashMax = Math.max(game.flashMax, 8);
  spawnSpark(vic.x, CFG.FLOOR_Y - 110, 'hit', 2);
  playSfx('hit_heavy');
  pushFeed('AUTO-COMBO!!', att.color);
}

function runMagicComboCine(game, ex) {
  const { att, vic, data } = ex;
  vic.x = data.vicX; vic.y = CFG.FLOOR_Y;   // pin the victim; the attacker orbits + teleports
  att.f = Math.max(0, ex.f - data.poseF0);

  if (data.hits < CFG.MAGIC_COMBO_HITS && ex.f >= data.nextHit) {
    data.hits++;
    const last = data.hits >= CFG.MAGIC_COMBO_HITS;
    const side = (data.hits % 2 === 0) ? 1 : -1;          // alternate flanks
    const aerial = (data.hits % 2 === 0);                 // every other hit from above
    const r = CFG.MAGIC_COMBO_RADIUS * (0.72 + (data.hits % 2) * 0.2);
    const ghostX = att.x, ghostY = att.y;                 // afterimage off the vacated spot
    att.x = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, vic.x + side * r));
    att.y = aerial ? CFG.FLOOR_Y - 68 : CFG.FLOOR_Y;
    att.facing = Math.sign(vic.x - att.x) || att.facing;
    att.comboStrike = (data.hits % 2 === 0) ? 'kick' : 'punch';
    data.poseF0 = ex.f;
    vic.hp -= CFG.MAGIC_COMBO_DMG;
    spawnSpark(vic.x + (Math.random() - 0.5) * 44, CFG.FLOOR_Y - 80 - Math.random() * 70, 'hit', 1);
    spawnElectric(ghostX, ghostY - CFG.BODY_H * 0.5, 5);  // teleport streak off the old spot
    spawnDust(att.x, CFG.FLOOR_Y, 4);
    spawnBlood(vic.x, CFG.FLOOR_Y - 100, att.facing, last ? 22 : 8);
    game.shake = Math.max(game.shake, 4 + data.hits);
    game.hitstop = Math.max(game.hitstop, last ? CFG.HITSTOP_ENDER : 4);
    playSfx(data.hits % 2 === 0 ? 'hit_heavy2' : 'hit_med');
    data.interval = Math.max(CFG.MAGIC_COMBO_MIN_INTERVAL, data.interval - CFG.MAGIC_COMBO_ACCEL);
    data.nextHit = ex.f + Math.round(data.interval);
    if (vic.hp <= 0) {   // flurry was lethal → plain launch K.O. (no special finisher)
      vic.hp = 0;
      vic.setLaunched(att.facing * 7, -11, true); vic.noTech = true;
      att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
      game.cine = null;
    }
  } else if (data.hits >= CFG.MAGIC_COMBO_HITS && ex.f >= data.nextHit) {
    // DONE — reappear beside them and LEAVE them standing in hitstun (no launch) → set up more combos
    att.x = Math.max(CFG.WALL_L + CFG.BODY_W / 2, Math.min(CFG.WALL_R - CFG.BODY_W / 2, vic.x - att.facing * CFG.MAGNET_DIST));
    att.y = CFG.FLOOR_Y; att.facing = Math.sign(vic.x - att.x) || att.facing;
    att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
    att.swordReady = CFG.SWORD_FOLLOWUP_WINDOW;   // open the back-kick → sword-combo window
    vic.setState('hitstun'); vic.stunFrames = CFG.MAGIC_COMBO_END_HITSTUN; vic.vx = 0; vic.vy = 0;
    vic.comboHits = 0;   // a fresh combo opportunity opens
    game.hitstop = Math.max(game.hitstop, 4);
    game.cine = null;
  }
}

// SWORD COMBO followup: a BACK KICK thrown out of the auto-combo (combat.js, swordReady window) hands
// both bodies here — a snappy 2-slash sword combo drenched in blood whose FINAL slash SIDE-SPIKES the
// victim flat across the stage (a wall splat there can finish them). Owns both bodies via the harness.
function startSwordCombo(att, vic, game) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const vicX = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, vic.x));
  startCine('swordcombo', att, vic, game, { vicX, swipe: 0, swordAt: CFG.SWORD_COMBO_WINDUP, poseF0: 0 });
  att.setState('swordfinish'); att.swordWind = true; att.swordReady = 0;
  vic.setState('executed');
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.hitstop = Math.max(game.hitstop, 8);
  game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY);
  game.flash = Math.max(game.flash, 8); game.flashMax = Math.max(game.flashMax, 8);
  playSfx('whoosh_heavy');
  pushFeed('SWORD COMBO!!', att.color);
}

function runSwordComboCine(game, ex) {
  const { att, vic, data } = ex;
  vic.x = data.vicX; vic.y = CFG.FLOOR_Y;
  att.f = Math.max(0, ex.f - data.poseF0);

  if (data.swipe < CFG.SWORD_COMBO_SWIPES && ex.f >= data.swordAt) {
    data.swipe++; data.poseF0 = ex.f; att.swordWind = false;   // a real swipe → the slash sweep
    const last = data.swipe >= CFG.SWORD_COMBO_SWIPES;
    const side = data.swipe % 2 === 1 ? -1 : 1;   // teleport to alternating flanks for each slash
    att.x = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, data.vicX + side * 84));
    att.y = CFG.FLOOR_Y; att.facing = Math.sign(data.vicX - att.x) || att.facing;
    spawnElectric(att.x, CFG.FLOOR_Y - CFG.BODY_H * 0.5, 5);   // teleport streak off the new spot
    spawnDust(att.x, CFG.FLOOR_Y, 4);
    const cy = CFG.FLOOR_Y - 110;
    spawnSpark(vic.x, cy + (Math.random() - 0.5) * 70, 'parry');         // bright slash flash
    // A LOT of blood splatter — gouts from both sides of the cut
    spawnBlood(vic.x, cy, att.facing, last ? 60 : 42);
    spawnBlood(vic.x, cy + 22, -att.facing, last ? 40 : 26);
    spawnBlood(vic.x, cy - 18, att.facing, 22);
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + (last ? 6 : 2));
    game.hitstop = Math.max(game.hitstop, last ? CFG.HITSTOP_ENDER : 8);
    playSfx('hit_heavy');
    if (!last) {
      vic.hp = Math.max(1, vic.hp - CFG.SWORD_COMBO_DMG);
      data.swordAt = ex.f + CFG.SWORD_SWIPE_FRAMES;
    } else {
      // FINAL slash → SIDE SPIKE: blast them dead-flat across the stage (a wall splat there can finish)
      vic.hp = Math.max(1, vic.hp - CFG.SWORD_COMBO_DMG);   // floored so the side-spike always plays
      att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
      const away = Math.sign(vic.x - att.x) || att.facing;
      vic.receiveSideSpike(away, game);   // sets 'launched' + the flat-flight window
      game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER);
      game.shake = Math.max(game.shake, CFG.SIDESPIKE_WALL_SHAKE);
      game.cine = null;
      pushFeed('SIDE SPIKE!!', att.color);
    }
  }
}

const CINE_RUN = { suplex: runSuplexCine, groundpound: runGroundPoundCine, flatliner: runFlatlinerCine, supercombo: runSuperComboCine, magiccombo: runMagicComboCine, swordcombo: runSwordComboCine };

function runCine(game) {
  const ex = game.cine;
  ex.f++;
  ex.att.f = ex.f; ex.vic.f = ex.f;   // drive both anim clocks from the sequencer
  CINE_RUN[ex.kind](game, ex);        // per-kind body sets states/dmg + clears game.cine when done
}

function resetMatch() {
  for (const f of game.fighters) f.reset();
  Projectiles.length = 0;
  Particles.length = 0;
  FloatTexts.length = 0;
  clearStains();   // fresh arena each fight (clears decals + the ring-buffer cursor)
  Heads.length = 0;   // clear severed heads
  Shells.length = 0;  // clear ejected shotgun shells
  UIState.trail = [game.fighters[0].stats.maxHp, game.fighters[1].stats.maxHp];
  game.hitstop = 0;
  game.superFreeze = 0;
  game.superWho = null;
  game.shake = 0;
  game.slowmo = 0;
  game.execution = null;
  game.executionKill = false;
  game.counter = null;
  game.flash = 0;
  game.flashMax = 0;
  game.cine = null;
  game.flatlinerKill = false;
  game.comboKill = false;
  game.koFreeze = 0;
  game.feed = [];
  cpu = new CPU();
  game.matchState = 'fight';
  game.banner = { text: 'FIGHT!', sub: '', timer: 70 };
  playSfx('fight_start');
}

function handleSystemKeys() {
  while (KeyQueue.length) {
    const code = KeyQueue.shift();
    if (code === 'Digit0') game.debug = !game.debug;
    if (code === 'Digit1') game.dummyMode = 0;
    if (code === 'Digit2') game.dummyMode = 1;
    if (code === 'Digit3') game.dummyMode = 2;
    if (code === 'Digit4') { game.dummyMode = 3; cpu = new CPU(); }
    if (code === 'Digit5') for (const f of game.fighters) f.meter = CFG.MAX_METER;
  }
}

function dummyInputs() {
  const [f1, f2] = game.fighters;
  if (game.dummyMode === 1) return {};   // stands there and takes it
  if (game.dummyMode === 3) return cpu.update(f2, f1, game);   // it fights back
  // auto-block: hold away from P1 (stand-block — lows still land, by design)
  const away = Math.sign(f2.x - f1.x) || 1;
  return away === 1 ? { right: true } : { left: true };
}

function logicStep() {
  // global: M toggles mute, V toggles the 16-bit filter — in ANY scene (pulled
  // before the scene branch drains the queue so the menu doesn't eat them)
  for (let i = KeyQueue.length - 1; i >= 0; i--) {
    if (KeyQueue[i] === 'KeyM') { KeyQueue.splice(i, 1); game.muted = toggleMute(); }
    else if (KeyQueue[i] === 'KeyV') { KeyQueue.splice(i, 1); retroToggle(); canvas.style.imageRendering = Retro.enabled ? 'pixelated' : 'auto'; }
  }
  // RENDER INTERP: capture each body's position at the START of this tick (unconditionally,
  // so it stays correct through freezes AND cinematics where update() doesn't run) — render()
  // lerps prev→current between logic ticks for smooth motion on >60Hz displays.
  for (const f of game.fighters) { f.prevX = f.x; f.prevY = f.y; }
  // SCENE layer (menu.js): the title / mode-select / move-list / pause screens run
  // their own step and never touch the fight. In the fight, a pause keypress (Esc /
  // Enter / P) lifts us to the pause screen before any fight logic runs.
  if (game.scene !== 'fight') { menuStep(game); return; }
  if (consumePauseKey()) { game.scene = 'paused'; game.menu.sel = 0; return; }

  game.frame++;
  handleSystemKeys();

  // Pads sample EVERY logic frame — including DURING the freezes — so taps register
  // their edges and fill the buffers instead of being eaten. `frozen` keeps the press
  // buffers and tap windows from ticking down mid-freeze (KO freeze is a freeze too).
  const frozen = game.superFreeze > 0 || game.hitstop > 0 || game.koFreeze > 0;
  pad1.update(undefined, frozen);
  pad2.update(game.dummyMode !== 0 ? dummyInputs() : undefined, frozen);

  // KO FREEZE-FRAME: the whole world holds on black with white silhouettes (render.js)
  // for a beat, THEN releases into the launch. Nothing updates — a hard freeze (but pads
  // were already sampled above, so a tap inside the beat survives it).
  if (game.koFreeze > 0) { game.koFreeze--; return; }
  if (game.banner && game.banner.timer > 0 && game.matchState !== 'ko') game.banner.timer--;
  game.shake = Math.max(0, game.shake - 0.6);
  if (game.flash > 0) game.flash--;
  updateFx();

  // cinematic super flash: world holds its breath
  if (game.superFreeze > 0) {
    game.superFreeze--;
    if (game.superFreeze === 0) game.superWho = null;
    return;
  }
  // hitstop: the time-freeze beat on contact (clamped — nothing legit exceeds the super freeze)
  if (game.hitstop > 0) {
    game.hitstop = Math.min(game.hitstop, CFG.SUPER_FREEZE);
    game.hitstop--;
    return;
  }
  // KO slow-mo: run logic every other frame
  if (game.slowmo > 0) {
    game.slowmo--;
    if (game.frame % 2 === 0) return;
  }

  // execution cinematic: the world stops for the kill
  if (game.execution) {
    runExecution(game);
    return;
  }
  // counter-hit cinematic: same deal — the slip and the blow own both bodies
  if (game.counter) {
    runCounter(game);
    return;
  }
  // canned cinematic (suplex / ground&pound / flatliner): one gate, the harness
  // drives both bodies. MUST sit after the freeze/execution/counter gates and
  // before f1/f2.update so the fighters' own update() can't fight the sequencer.
  if (game.cine) {
    runCine(game);
    return;
  }

  const [f1, f2] = game.fighters;
  f1.update(f2, game);
  f2.update(f1, game);
  combatUpdate(f1, f2, game);

  // super flash trigger (set by Fighter.tryActions) — only if the activator is
  // still winding up (a same-frame counter-hit cancels the cinematic, not just the shot)
  for (const f of game.fighters) {
    if (f.superFlash) {
      f.superFlash = false;
      if (f.state === 'superstart') {
        game.superFreeze = CFG.SUPER_FREEZE;
        game.superWho = f;
        playSfx(f.superKind === 'beam' ? 'beam_activate' : 'super_freeze');   // electric twinkle for the beam charge
      }
    }
  }

  if (game.matchState === 'fight' && (f1.hp <= 0 || f2.hp <= 0)) {
    game.matchState = 'ko';
    // the freeze-frame beat — but the bespoke finishers (execution / flatliner) already
    // have their own dramatic freeze, so only normal KOs + super get this one.
    if (!game.executionKill && !game.flatlinerKill && !game.comboKill) { game.koFreeze = CFG.KO_FREEZE; playSfx('ko_freeze'); }   // electric stinger on the silhouette freeze (finishers own their own climax)
    game.slowmo = CFG.KO_SLOWMO_FRAMES;
    game.flash = CFG.KO_FLASH; game.flashMax = CFG.KO_FLASH;   // EVERY KO flashes — shared KO juice, zero per-move wiring
    // blood on EVERY kill — a gout from each downed fighter, in their launch direction
    for (const f of [f1, f2]) if (f.hp <= 0) {
      const dir = Math.sign(f.vx) || f.facing;
      spawnBlood(f.x, CFG.FLOOR_Y - 110, dir, 42);
      spawnSpark(f.x, CFG.FLOOR_Y - 110, 'blood');
    }
    const winner = f1.hp <= 0 ? (f2.hp <= 0 ? null : f2) : f1;
    game.banner = {
      // a double KO is a DRAW — the finisher's owner died too, so don't crown it FLATLINED/EXECUTED
      text: !winner ? 'DOUBLE K.O.' : game.comboKill ? 'FINISHED!!' : game.flatlinerKill ? 'FLATLINED.' : game.executionKill ? 'EXECUTED.' : 'K.O.',
      sub: winner ? `${winner.name} WINS — press jump to rematch` : 'DOUBLE K.O. — press jump to rematch',
      timer: 999999,
    };
    playSfx('ko');
  }

  if (game.matchState === 'ko' && game.slowmo <= 0 && (pad1.pressed.jump || pad2.pressed.jump)) {
    resetMatch();
    pad1.consume('jump');   // don't let the rematch press also jump round two
    pad2.consume('jump');
  }
}

// fixed timestep with panic cap (background tabs etc.)
let last = performance.now();
let acc = 0;
const STEP = 1000 / 60;

function frame(now) {
  acc += Math.min(now - last, 250);
  last = now;
  while (acc >= STEP) {
    logicStep();
    acc -= STEP;
  }
  // music: fight loop in a match, menu loop everywhere else (idempotent — also retries
  // play() once the browser autoplay gate opens on the first keypress)
  playMusic((game.scene === 'fight' || game.scene === 'paused') ? 'music_fight' : 'music_menu');
  // RETRO: everything draws into the low-res buffer (rctx), then retroEnd pixelates
  // + palette-quantizes + upscales it onto the real canvas. Passthrough when off.
  const rctx = retroBegin(ctx);
  // how far (0..1) we are between the last logic tick and the next → render interpolation factor
  const alpha = CFG.RENDER_INTERP ? Math.max(0, Math.min(1, acc / STEP)) : 1;
  if (game.scene === 'title' || game.scene === 'mode' || game.scene === 'select' || game.scene === 'movelist') {
    drawMenu(rctx, game);
  } else {
    render(rctx, game, alpha);
    if (game.koFreeze <= 0) drawUI(rctx, game);   // hide the HUD during the KO silhouette freeze
    if (game.scene === 'paused') drawPauseOverlay(rctx, game);   // freeze the fight, overlay the menu
  }
  retroEnd(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
