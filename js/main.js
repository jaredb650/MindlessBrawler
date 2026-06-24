// ─────────────────────────────────────────────────────────────
// Main: fixed-timestep loop (60 logic fps), hitstop / super-freeze /
// KO slow-mo gating, match flow, system keys (dummy modes, debug).
// ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// ALWAYS nearest-neighbor on the canvas→screen upscale: sprites are pixel art (incl. True Pixel
// sheets), so a bilinear screen-scale (or Retina DPR upscale) softens their chunky pixels → blur.
canvas.style.imageRendering = 'pixelated';

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
  witchTime: 0,        // Witch Time countdown (the slow-mo window)
  witchWho: null,      // the fighter who stays FULL speed during Witch Time
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
  // total → the gpmount/gpmounted sprite sheets scale start→finish across the whole sequence
  // (mount → flurry → dismount), so a looped stab segment plays out in sync with the hits.
  startCine('groundpound', att, vic, game, { total: CFG.GP_MOUNT + CFG.GP_FLURRY + CFG.GP_OUT });   // the harness owns both bodies + faces them from here
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

// KILLER TANGO (Vesper forward-super): a teleport knife-slash rush around the locked victim, then
// she reappears in front and unloads a point-blank double-pistol blast that SIDE-SPIKES them flat.
function startTango(att, vic, game) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const vicX = Math.max(CFG.WALL_L + 40 + CFG.TANGO_RADIUS, Math.min(CFG.WALL_R - 40 - CFG.TANGO_RADIUS, vic.x));
  startCine('tango', att, vic, game, { vicX, hits: 0, nextHit: CFG.TANGO_DELAY, interval: CFG.TANGO_INTERVAL, poseF0: 0 });
  att.setState('magiccombo'); att.comboStrike = 'punch';   // reuse the teleport-strike pose
  vic.setState('executed');
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.hitstop = Math.max(game.hitstop, 6);
  game.flash = Math.max(game.flash, 8); game.flashMax = Math.max(game.flashMax, 8);
  spawnSpark(vic.x, CFG.FLOOR_Y - 110, 'parry', 2); playSfx('hit_heavy');
  pushFeed('KILLER TANGO!!', att.color);
}
function runTangoCine(game, ex) {
  const { att, vic, data } = ex;
  vic.x = data.vicX; vic.y = CFG.FLOOR_Y;
  att.f = Math.max(0, ex.f - data.poseF0);
  if (data.hits < CFG.TANGO_HITS && ex.f >= data.nextHit) {
    data.hits++;
    const last = data.hits >= CFG.TANGO_HITS;
    const side = (data.hits % 2 === 0) ? 1 : -1;
    const aerial = (data.hits % 2 === 0);
    const r = CFG.TANGO_RADIUS * (0.7 + (data.hits % 2) * 0.22);
    const ghostX = att.x, ghostY = att.y;
    att.x = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, vic.x + side * r));
    att.y = aerial ? CFG.FLOOR_Y - 64 : CFG.FLOOR_Y;
    att.facing = Math.sign(vic.x - att.x) || att.facing;
    att.comboStrike = (data.hits % 2 === 0) ? 'kick' : 'punch';
    data.poseF0 = ex.f;
    vic.hp = Math.max(1, vic.hp - 22);
    const cy = CFG.FLOOR_Y - 100;
    spawnSpark(vic.x, cy + (Math.random() - 0.5) * 60, 'parry');
    spawnBlood(vic.x, cy, att.facing, last ? 30 : 12);          // knife slashes draw blood
    spawnElectric(ghostX, ghostY - CFG.BODY_H * 0.5, 4);        // teleport streak
    spawnDust(att.x, CFG.FLOOR_Y, 4);
    game.shake = Math.max(game.shake, 4 + data.hits);
    game.hitstop = Math.max(game.hitstop, last ? CFG.HITSTOP_ENDER : 4);
    playSfx(data.hits % 2 === 0 ? 'hit_heavy2' : 'hit_med');
    data.interval = Math.max(2, data.interval - 0.5);
    data.nextHit = ex.f + Math.round(data.interval);
  } else if (data.hits >= CFG.TANGO_HITS && ex.f >= data.nextHit) {
    // FINISHER — point-blank double-pistol blast → SIDE SPIKE flat across the stage.
    att.x = Math.max(CFG.WALL_L + CFG.BODY_W / 2, Math.min(CFG.WALL_R - CFG.BODY_W / 2, vic.x - att.facing * 70));
    att.y = CFG.FLOOR_Y; att.facing = Math.sign(vic.x - att.x) || att.facing;
    att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
    vic.hp = Math.max(1, vic.hp - 30);
    const away = Math.sign(vic.x - att.x) || att.facing;
    spawnSpark(vic.x, CFG.FLOOR_Y - 120, 'parry', 2); spawnBlood(vic.x, CFG.FLOOR_Y - 110, away, 26);
    vic.receiveSideSpike(away, game);
    game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER); game.shake = Math.max(game.shake, CFG.SIDESPIKE_WALL_SHAKE);
    game.cine = null;
    pushFeed('PERFECTO!!', att.color);
  }
}

// Generic VESPER slash-flurry cinematic — used by the dive-grab (3 slashes), slide tackle (2,
// launches high), tele-slash (2), and the slash→thrust→rising aerial rave (3). opts =
// { hits, launchVy, aerial, label }. She blinks around the locked victim slashing, last hit LAUNCHES.
// per-combo visual identity so each auto-combo reads as a DISTINCT move (slash-line colour + signature burst).
const SLASH_STYLES = {
  rave:    { slash: 'rgba(150,230,255,0.95)', spark: 'parry', extra: 'electric' },   // AERIAL RAVE — icy cyan + blue crackle
  skyhook: { slash: 'rgba(255,196,110,0.95)', spark: 'hit',   extra: 'blast' },      // SKYHOOK — orange fireball
  triple:  { slash: 'rgba(206,160,255,0.95)', spark: 'parry', extra: 'electric' },   // TRIPLE SLASH — violet
  iaido:   { slash: 'rgba(255,244,196,0.95)', spark: 'parry', extra: 'gold' },       // IAIDO — gold katana flash
  rising:  { slash: 'rgba(255,150,170,0.95)', spark: 'hit',   extra: 'blast' },      // RISING SLASH — hot pink
};
function startSlashCombo(att, vic, game, opts) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const vicX = Math.max(CFG.WALL_L + 70, Math.min(CFG.WALL_R - 70, vic.x));
  startCine('slashcombo', att, vic, game, { vicX, hits: 0, total: opts.hits || 3, launchVy: opts.launchVy || -13, aerial: !!opts.aerial, overhead: !!opts.overhead, style: opts.style || 'rave', nextHit: 4, interval: 5, poseF0: 0 });
  att.setState('magiccombo'); att.comboStrike = 'punch';
  vic.setState('executed');
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.hitstop = Math.max(game.hitstop, 5); game.flash = Math.max(game.flash, 6); game.flashMax = Math.max(game.flashMax, 6);
  spawnSpark(vic.x, CFG.FLOOR_Y - 110, 'parry', 1); playSfx('knife_combo');   // the knife-combo activation sting
  if (opts.label) pushFeed(opts.label + '!!', att.color);
}
function runSlashComboCine(game, ex) {
  const { att, vic, data } = ex;
  const vy0 = data.aerial ? CFG.FLOOR_Y - 96 - data.hits * 16 : CFG.FLOOR_Y;
  vic.x = data.vicX; vic.y = vy0;
  att.f = Math.max(0, ex.f - data.poseF0);
  if (data.hits < data.total && ex.f >= data.nextHit) {
    data.hits++;
    const last = data.hits >= data.total;
    const side = (data.hits % 2 === 0) ? 1 : -1;
    const ghostX = att.x, ghostY = att.y;
    att.x = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, vic.x + side * (88 + (data.hits % 2) * 26)));
    att.y = data.aerial ? vy0 : CFG.FLOOR_Y;
    att.facing = Math.sign(vic.x - att.x) || att.facing;
    data.poseF0 = ex.f;
    vic.hp = Math.max(1, vic.hp - 40);   // rushdown buff: the auto-combo cuts hit harder too
    const cy = vy0 - 80;
    const st = SLASH_STYLES[data.style] || SLASH_STYLES.rave;
    spawnSpark(vic.x, cy, st.spark); spawnBlood(vic.x, cy, att.facing, last ? 28 : 12);
    // ONE slash crescent PER HIT (sequenced by the per-hit interval), in this combo's signature colour;
    // the finisher's is bigger. Alternating diagonal so a multi-hit string reads as separate strokes.
    const sa = (data.hits % 2 === 0) ? 0.7 : -0.7;
    spawnSlashFx(vic.x, cy, sa, last ? 184 : 150, st.slash);
    if (st.extra === 'electric') spawnElectric(vic.x, cy, 5);
    else if (st.extra === 'blast') spawnBlast(vic.x, cy);
    else spawnSpark(vic.x, cy, 'parry', 2);   // gold flash (iaido)
    spawnElectric(ghostX, ghostY - CFG.BODY_H * 0.5, 3); spawnDust(att.x, CFG.FLOOR_Y, 3);
    game.shake = Math.max(game.shake, 4 + data.hits);
    game.hitstop = Math.max(game.hitstop, last ? CFG.HITSTOP_ENDER : 3);
    playSfx('slash_combo_' + (1 + (data.hits - 1) % 3));   // cycle the 3 sword-combo swings across the flurry
    if (last) playSfx('stab_heavy');                        // the launching cut rips deep
    data.nextHit = ex.f + data.interval;
    if (last) {
      if (data.overhead) {
        // SKYHOOK: drag them DIRECTLY ABOVE her and pop straight up so the ↑K up-uzi catches them.
        att.x = Math.max(CFG.WALL_L + CFG.BODY_W / 2, Math.min(CFG.WALL_R - CFG.BODY_W / 2, vic.x));
        att.y = CFG.FLOOR_Y;
        vic.x = att.x;
        att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
        vic.setLaunched(0, data.launchVy, true);   // straight up, directly overhead
      } else {
        // FINISHER: launch them up for the juggle, hand control back.
        att.x = Math.max(CFG.WALL_L + CFG.BODY_W / 2, Math.min(CFG.WALL_R - CFG.BODY_W / 2, vic.x - att.facing * 64));
        att.y = CFG.FLOOR_Y; att.facing = Math.sign(vic.x - att.x) || att.facing;
        att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
        vic.setLaunched(att.facing * 3, data.launchVy, true);
      }
      game.cine = null;
    }
  }
}

// clamp an x into the playable arena (body-center bounds)
function cineClampX(x) { return Math.max(CFG.WALL_L + CFG.BODY_W / 2, Math.min(CFG.WALL_R - CFG.BODY_W / 2, x)); }

// ── #2 SCISSOR TAKEDOWN (air ↑K command grab): Vesper stays FROZEN AIRBORNE while the victim is
// thrown straight DOWN into a hard ground spike, then she drops.
function startScissorTake(att, vic, game) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const vicX = Math.max(CFG.WALL_L + 70, Math.min(CFG.WALL_R - 70, vic.x));
  startCine('scissortake', att, vic, game, { vicX });
  vic.setState('executed');
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.hitstop = Math.max(game.hitstop, 5); game.flash = Math.max(game.flash, 6); game.flashMax = Math.max(game.flashMax, 6);
  spawnSpark(vic.x, CFG.FLOOR_Y - 120, 'parry', 1); playSfx('throw_grab');
  pushFeed('SCISSOR TAKEDOWN!!', att.color);
}
function runScissorTakeCine(game, ex) {
  const { att, vic, data } = ex;
  // Vesper is held FROZEN airborne the entire takedown (she only drops once the victim is slammed).
  att.x = cineClampX(data.vicX - att.facing * 30); att.y = CFG.FLOOR_Y - CFG.SCISSOR_AIR_H; att.vx = 0; att.vy = 0;
  if (ex.f < CFG.SCISSOR_FRAMES) {
    vic.x = data.vicX; vic.y = CFG.FLOOR_Y - 132; vic.vx = 0; vic.vy = 0;   // gripped UP in the scissor
    if (ex.f === 2) playSfx('whoosh_heavy');
  } else if (ex.f < CFG.SCISSOR_FRAMES + CFG.SCISSOR_HANG) {
    const t = (ex.f - CFG.SCISSOR_FRAMES) / CFG.SCISSOR_HANG;   // 0..1 — he FLIES into the ground while she hangs
    vic.x = data.vicX; vic.y = (CFG.FLOOR_Y - 132) + 132 * (t * t); vic.vx = 0; vic.vy = 0;
    if (ex.f === CFG.SCISSOR_FRAMES) spawnSlashFx(vic.x, CFG.FLOOR_Y - 132, Math.PI / 2, 150);
  } else {
    vic.hp = Math.max(0, vic.hp - CFG.SCISSOR_DMG);
    vic.y = CFG.FLOOR_Y;
    const away = Math.sign(vic.x - att.x) || att.facing;
    vic.setState('fallheavy'); vic.noTech = true;   // hard untechable slam (matches the suplex spike)
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 5); game.hitstop = Math.max(game.hitstop, 12);
    spawnSpark(vic.x, CFG.FLOOR_Y - 20, 'hit', 2); spawnDust(vic.x, CFG.FLOOR_Y, 16); spawnBlood(vic.x, CFG.FLOOR_Y - 30, away, 18);
    playSfx('body_slam'); playSfx('throw_slam');
    att.setState(att.stamina <= 0 ? 'gassed' : 'idle');   // she drops now (the floor-snap lands her next frame)
    game.cine = null;
  }
}

// ── TALON SNATCH — Xamora's winged command grab (P+K): she hoists the foe overhead on the staff,
// holds them at the apex, then SLAMS them straight down into an untechable ground spike. The unblockable
// that cracks a turtle. Mirrors the scissor takedown harness; reuses receiveSpike for the slam.
function startTalonSnatch(att, vic, game) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const vicX = Math.max(CFG.WALL_L + 70, Math.min(CFG.WALL_R - 70, vic.x));
  startCine('talonsnatch', att, vic, game, { vicX });
  att.setState('idle');         // frozen grab pose (placeholder — a winged-hoist pose can be authored later)
  vic.setState('executed');     // gripped/locked
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.hitstop = Math.max(game.hitstop, 5); game.flash = Math.max(game.flash, 6); game.flashMax = Math.max(game.flashMax, 6);
  spawnSpark(vic.x, CFG.FLOOR_Y - 130, 'parry', 1); playSfx('throw_grab');
  pushFeed('TALON SNATCH!!', att.color);
}
function runTalonSnatchCine(game, ex) {
  const { att, vic, data } = ex;
  // she stays planted a staff-length back, holding them up; pinned each frame (physics is gated off)
  att.x = cineClampX(data.vicX - att.facing * 56); att.y = CFG.FLOOR_Y; att.vx = 0; att.vy = 0;
  const PEAK = CFG.TALON_LIFT_H;
  if (ex.f < CFG.TALON_FRAMES) {
    // LIFT: haul the victim up off the floor toward the apex (ease-out)
    const t = ex.f / CFG.TALON_FRAMES;
    vic.x = data.vicX; vic.y = CFG.FLOOR_Y - PEAK * (1 - (1 - t) * (1 - t)); vic.vx = 0; vic.vy = 0;
    if (ex.f === 2) playSfx('whoosh_heavy');
  } else if (ex.f < CFG.TALON_FRAMES + CFG.TALON_HANG) {
    // HANG: gripped at the apex, just before the slam
    vic.x = data.vicX; vic.y = CFG.FLOOR_Y - PEAK; vic.vx = 0; vic.vy = 0;
    if (ex.f === CFG.TALON_FRAMES) spawnSlashFx(vic.x, CFG.FLOOR_Y - PEAK, Math.PI / 2, 150);
  } else {
    // SLAM: untechable ground spike. receiveSpike drives vy DOWN + sets noTech + bounce + FX (calls setLaunched).
    vic.hp = Math.max(0, vic.hp - CFG.TALON_DMG);
    const away = Math.sign(vic.x - att.x) || att.facing;
    vic.receiveSpike(CFG.TALON_SPIKE_VY, away, game);
    vic.noTech = true;   // re-assert (receiveSpike already set it; explicit, matches the KO/scissor path)
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 5); game.hitstop = Math.max(game.hitstop, 12);
    spawnSpark(vic.x, CFG.FLOOR_Y - 20, 'hit', 2); spawnDust(vic.x, CFG.FLOOR_Y, 16); spawnBlood(vic.x, CFG.FLOOR_Y - 30, away, 18);
    playSfx('body_slam'); playSfx('throw_slam');
    att.setState(att.stamina <= 0 ? 'gassed' : 'idle');   // she regains control
    game.cine = null;                                     // RELEASE the gate (required, or soft-lock)
    pushFeed('SLAMMED!!', vic.color);
  }
}

// ── SKY TALON — Xamora's AIR command grab (air ↑K): she snatches a jumping foe at her talons, hangs a beat
// (winged), then HURLS them straight into the ground (untechable). Mirrors the scissor-takedown harness.
function startSkyTalon(att, vic, game) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const vicX = Math.max(CFG.WALL_L + 70, Math.min(CFG.WALL_R - 70, vic.x));
  startCine('skytalon', att, vic, game, { vicX });
  vic.setState('executed');
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.hitstop = Math.max(game.hitstop, 5); game.flash = Math.max(game.flash, 6); game.flashMax = Math.max(game.flashMax, 6);
  spawnSpark(vic.x, CFG.FLOOR_Y - CFG.SKYTALON_GRIP_H, 'parry', 1); playSfx('throw_grab');
  pushFeed('SKY TALON!!', att.color);
}
function runSkyTalonCine(game, ex) {
  const { att, vic, data } = ex;
  // she hovers (winged) the whole grab, holding the foe up at her talons — frozen airborne, zeroed velocity.
  att.x = cineClampX(data.vicX - att.facing * 36); att.y = CFG.FLOOR_Y - CFG.SKYTALON_AIR_H; att.vx = 0; att.vy = 0;
  if (ex.f < CFG.SKYTALON_FRAMES) {
    vic.x = data.vicX; vic.y = CFG.FLOOR_Y - CFG.SKYTALON_GRIP_H; vic.vx = 0; vic.vy = 0;   // gripped up at her talons
    if (ex.f === 2) playSfx('whoosh_heavy');
  } else if (ex.f < CFG.SKYTALON_FRAMES + CFG.SKYTALON_HANG) {
    const t = (ex.f - CFG.SKYTALON_FRAMES) / CFG.SKYTALON_HANG;   // 0..1 — HURLED into the ground while she hangs
    vic.x = data.vicX; vic.y = (CFG.FLOOR_Y - CFG.SKYTALON_GRIP_H) + CFG.SKYTALON_GRIP_H * (t * t); vic.vx = 0; vic.vy = 0;
    if (ex.f === CFG.SKYTALON_FRAMES) spawnSlashFx(vic.x, CFG.FLOOR_Y - CFG.SKYTALON_GRIP_H, Math.PI / 2, 150);
  } else {
    vic.hp = Math.max(0, vic.hp - CFG.SKYTALON_DMG);
    vic.y = CFG.FLOOR_Y;
    const away = Math.sign(vic.x - att.x) || att.facing;
    vic.setState('fallheavy'); vic.noTech = true;   // hard untechable slam (matches the scissor takedown)
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 5); game.hitstop = Math.max(game.hitstop, 12);
    spawnSpark(vic.x, CFG.FLOOR_Y - 20, 'hit', 2); spawnDust(vic.x, CFG.FLOOR_Y, 16); spawnBlood(vic.x, CFG.FLOOR_Y - 30, away, 18);
    playSfx('body_slam'); playSfx('throw_slam');
    att.y = CFG.FLOOR_Y; att.vx = 0; att.vy = 0;
    att.setState(att.stamina <= 0 ? 'gassed' : 'idle');   // she drops to the floor + regains control
    game.cine = null;
    pushFeed('SLAMMED!!', vic.color);
  }
}

// ── #7 EXECUTION (thrust→hamstring→pistol): Vesper steps back and fires 3 shots into the LOCKED
// kneeling victim; the last shot tumbles him.
function startExecution3(att, vic, game) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const vicX = Math.max(CFG.WALL_L + 90, Math.min(CFG.WALL_R - 90, vic.x));
  startCine('exec3', att, vic, game, { vicX, shots: 0, nextShot: CFG.EXEC3_DELAY });
  att.x = cineClampX(vicX - att.facing * CFG.EXEC3_STEPBACK); att.y = CFG.FLOOR_Y;
  att.setState('execpistol');   // stepped-back, pistol leveled
  vic.setState('execkneel');    // locked kneeling
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.flash = Math.max(game.flash, 6); game.flashMax = Math.max(game.flashMax, 6);
  pushFeed('EXECUTION...', att.color);
}
function runExecution3Cine(game, ex) {
  const { att, vic, data } = ex;
  vic.x = data.vicX; vic.y = CFG.FLOOR_Y; vic.vx = 0; vic.vy = 0;   // pinned kneeling
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  if (ex.f >= data.nextShot && data.shots < 3) {
    data.shots++;
    const last = data.shots >= 3;
    const mx = att.x + att.facing * 42, my = CFG.FLOOR_Y - 118;
    spawnSpark(mx, my, 'hit', 1);
    spawnBlood(vic.x, CFG.FLOOR_Y - 92, att.facing, last ? 22 : 9);
    game.shake = Math.max(game.shake, last ? CFG.SHAKE_HEAVY + 2 : CFG.SHAKE_MED);
    game.hitstop = Math.max(game.hitstop, last ? CFG.HITSTOP_ENDER : CFG.HITSTOP_MED);
    playSfx('pistol_shot');
    if (!last) { vic.hp = Math.max(1, vic.hp - CFG.EXEC3_DMG); data.nextShot = ex.f + CFG.EXEC3_INTERVAL; }
    else {
      vic.hp = Math.max(1, vic.hp - CFG.EXEC3_DMG);   // floor at 1 — the WALL SPIKE impact is the kill, not the shot
      vic.receiveSideSpike(att.facing, game);          // the last shot BLASTS him flat into the wall (wall-spike)
      att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
      game.cine = null;
      pushFeed('EXECUTED.', att.color);
    }
  }
}

// ── #8 SKEET (thrust→hamstring→back-K): kick the victim UP into the air, then blast the 'clay' with the shotgun.
function startSkeet(att, vic, game) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const vicX = Math.max(CFG.WALL_L + 80, Math.min(CFG.WALL_R - 80, vic.x));
  startCine('skeet', att, vic, game, { vicX });
  att.x = cineClampX(vicX - att.facing * 80); att.y = CFG.FLOOR_Y;
  att.setState('skeetkick');
  vic.setState('executed');
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.flash = Math.max(game.flash, 6); game.flashMax = Math.max(game.flashMax, 6);
  pushFeed('SKEET!!', att.color);
}
function runSkeetCine(game, ex) {
  const { att, vic, data } = ex;
  att.x = cineClampX(data.vicX - att.facing * 80); att.y = CFG.FLOOR_Y;
  const h = ex.f < CFG.SKEET_KICK_FRAME ? 0 : CFG.SKEET_AIR_H0 + (ex.f - CFG.SKEET_KICK_FRAME) * CFG.SKEET_RISE;
  vic.x = data.vicX; vic.y = CFG.FLOOR_Y - h; vic.vx = 0; vic.vy = 0;
  if (ex.f === CFG.SKEET_KICK_FRAME) {
    vic.hp = Math.max(1, vic.hp - CFG.SKEET_KICK_DMG);
    spawnSpark(vic.x, CFG.FLOOR_Y - 70, 'hit', 1); game.shake = Math.max(game.shake, CFG.SHAKE_MED); game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_MED);
    playSfx('hit_heavy'); att.setState('shotgun');   // pull the shotgun, aim up at the clay
  }
  if (ex.f >= CFG.SKEET_BLAST_FRAME) {
    vic.hp = Math.max(0, vic.hp - CFG.SKEET_BLAST_DMG);
    vic.gibArmed = 90;   // a lethal shotgun blast GIBS (the shared KO block decapitates)
    vic.setLaunched(att.facing * CFG.SKEET_BLAST_VX, CFG.SKEET_BLAST_VY, true); vic.noTech = true;
    spawnBlast(vic.x, vic.y - CFG.BODY_H * 0.4); spawnSpark(vic.x, vic.y - 40, 'hit', 2); spawnBlood(vic.x, vic.y - 40, att.facing, 22);
    spawnShell(att.x - att.facing * 4, CFG.FLOOR_Y - CFG.BODY_H * 0.62, -att.facing * 2.4, -6);
    game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 4); game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER);
    game.flash = Math.max(game.flash, 8); game.flashMax = Math.max(game.flashMax, 8);
    playSfx('shotgun_blast');
    att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
    game.cine = null;
    pushFeed('SKEET SHOOT!!', att.color);
  }
}

// Which raw sprite frame (excluded cells counted) a cine sheet is showing now — mirrors drawSpritePose's
// cine mapping so gameplay can sync a hit to the visible frame. Returns null if there's no ready sheet.
function cineRawFrame(charType, key, cineF, total) {
  const e = (typeof SPRITES !== 'undefined') && SPRITES.chars[charType];
  const sh = e && e.sheets[key];
  if (!sh || !sh.ready) return null;
  const nf = sh.frames || 1;
  const inc = (typeof spriteIncluded === 'function') ? spriteIncluded(sh, nf) : null;
  const nfe = inc ? (inc.length || 1) : nf;
  const idx = Math.min(nfe - 1, Math.max(0, (cineF / (total || 1) * nfe) | 0));
  return inc ? (inc.length ? inc[idx] : 0) : idx;
}

// ── #5/#6 AUTO 2-HIT KICKS: gunkick → front-flip HEEL SPIKE (down); heelshot → SIDE KICK (shove back).
function startKickCombo(att, vic, game, opts) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const vicX = Math.max(CFG.WALL_L + 60, Math.min(CFG.WALL_R - 60, vic.x));
  startCine('kickcombo', att, vic, game, { vicX, kind: opts.kind, dmg: opts.dmg, pushVx: opts.pushVx, total: CFG.KICKFOLLOW_WINDUP });   // total → lets a sprite play its full sheet across the cine
  vic.setState('executed');
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  if (opts.kind === 'heelspike') { att.setState('flipheel'); att.x = cineClampX(vicX - att.facing * 16); }
  else { att.setState('sidekick'); att.x = cineClampX(vicX - att.facing * 60); }
  att.y = CFG.FLOOR_Y;
  if (opts.label) pushFeed(opts.label + '!', att.color);
}
function runKickComboCine(game, ex) {
  const { att, vic, data } = ex;
  if (!data.spiked) { vic.x = data.vicX; vic.vx = 0; vic.vy = 0; }   // pin the victim only until the hit lands
  if (data.kind === 'heelspike') {
    att.y = CFG.FLOOR_Y;   // stay grounded & planted — the sprite carries the whole flip/kick now (no engine arc or reposition)
    const total = data.total || CFG.KICKFOLLOW_WINDUP;
    // Spike lands mid-animation, synced to the flip-heel sprite's contact frame (raw frame >= HEEL_SPIKE_FRAME,
    // counting excluded cells). Falls back to a frame count if no sheet. Fires ONCE; the animation then plays out.
    const HEEL_SPIKE_FRAME = 12;
    const raw = cineRawFrame(att.charType, 'flipheel', ex.f, total);
    const spikeNow = raw != null ? raw >= HEEL_SPIKE_FRAME : ex.f >= HEEL_SPIKE_FRAME;
    const doSpike = () => {
      data.spiked = true;
      vic.hp = Math.max(0, vic.hp - data.dmg);
      const away = att.facing;
      vic.receiveSpike(CFG.AXEKICK_SPIKE_VY, away, game);
      spawnSpike(vic.x, away); spawnSpark(vic.x, CFG.FLOOR_Y - 30, 'hit', 2); spawnDust(vic.x, CFG.FLOOR_Y, 12);
      game.shake = Math.max(game.shake, CFG.SHAKE_HEAVY + 2); game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER);
      playSfx('spike');
    };
    if (!data.spiked) { vic.y = CFG.FLOOR_Y; if (spikeNow) doSpike(); }
    if (ex.f >= total) { if (!data.spiked) doSpike(); att.setState(att.stamina <= 0 ? 'gassed' : 'idle'); game.cine = null; }   // animation finished → release
  } else {
    att.x = cineClampX(data.vicX - att.facing * 56); att.y = CFG.FLOOR_Y; vic.y = CFG.FLOOR_Y;
    if (ex.f >= CFG.KICKFOLLOW_WINDUP) {
      vic.hp = Math.max(0, vic.hp - data.dmg);
      const away = att.facing;
      spawnSpark(vic.x, CFG.FLOOR_Y - 92, 'hit', 1); game.shake = Math.max(game.shake, CFG.SHAKE_MED); game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_MED);
      playSfx('hit_heavy2');
      vic.setLaunched(away * (data.pushVx || 14), -3, true);   // a flat shove back
      att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
      game.cine = null;
    }
  }
}

// ── SHISH KEBAB (slash→slash→thrust): the thrust impales the victim and CARRIES them into the wall, pinning them.
function startKebab(att, vic, game) {
  att.facing = Math.sign(vic.x - att.x) || att.facing;
  const wallX = att.facing === 1 ? CFG.WALL_R - CFG.BODY_W / 2 : CFG.WALL_L + CFG.BODY_W / 2;
  startCine('kebab', att, vic, game, { wallX, vicX0: vic.x, into: -att.facing });   // into = direction the pinned body faces (into the stage)
  vic.setState('executed');
  vic.sideSpikeFrames = 0; vic.pendingElectric = 0; vic.electrified = 0; vic.wallSpiked = false; vic.noTech = false;
  game.hitstop = Math.max(game.hitstop, 5); game.flash = Math.max(game.flash, 6); game.flashMax = Math.max(game.flashMax, 6);
  spawnSpark(vic.x, CFG.FLOOR_Y - 110, 'hit', 1); playSfx('stab_light');
  pushFeed('SHISH KEBAB!!', att.color);
}
function runKebabCine(game, ex) {
  const { att, vic, data } = ex;
  if (ex.f < CFG.KEBAB_CARRY_FRAMES) {
    // CARRY: drag the impaled victim toward the wall; Vesper stays a blade-length behind, thrust held.
    const t = ex.f / CFG.KEBAB_CARRY_FRAMES;
    vic.x = data.vicX0 + (data.wallX - data.vicX0) * t; vic.y = CFG.FLOOR_Y - 36; vic.vx = 0; vic.vy = 0;
    att.x = cineClampX(vic.x - att.facing * CFG.KEBAB_REACH); att.y = CFG.FLOOR_Y;
    if (ex.f % 3 === 0) spawnBlood(vic.x, CFG.FLOOR_Y - CFG.BODY_H * 0.5, att.facing, 4);
  } else {
    // PIN: slam them into the wall — a manual WALL SPIKE (the cine owns the bodies, so set it directly).
    vic.x = data.wallX; vic.facing = data.into; vic.vx = 0; vic.vy = 0;
    vic.y = CFG.FLOOR_Y - CFG.SIDESPIKE_LIFT;
    vic.hp = Math.max(0, vic.hp - CFG.KEBAB_DMG);
    vic.setState('wallsplat'); vic.f = 0; vic.wallSpiked = true;   // → the slow blood-slide down the wall
    game.shake = Math.max(game.shake, CFG.SIDESPIKE_WALL_SHAKE); game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_ENDER);
    game.flash = Math.max(game.flash, 8); game.flashMax = Math.max(game.flashMax, 8);
    spawnRumble(data.wallX + data.into * 12, vic.y - CFG.BODY_H * 0.3, data.into);
    spawnBlood(data.wallX + data.into * 14, vic.y - CFG.BODY_H * 0.2, data.into, 38);
    for (let i = 0; i < 5; i++) spawnStain(data.wallX + data.into * 6, CFG.FLOOR_Y - CFG.BODY_H * (0.25 + i * 0.12), true);
    playSfx('wall_spike'); playSfx('stab_heavy');
    att.x = cineClampX(data.wallX - att.facing * CFG.KEBAB_REACH); att.y = CFG.FLOOR_Y;
    att.setState(att.stamina <= 0 ? 'gassed' : 'idle');
    game.cine = null;
    pushFeed('PINNED!!', vic.color);
  }
}

const CINE_RUN = { suplex: runSuplexCine, groundpound: runGroundPoundCine, flatliner: runFlatlinerCine, supercombo: runSuperComboCine, magiccombo: runMagicComboCine, swordcombo: runSwordComboCine, tango: runTangoCine, slashcombo: runSlashComboCine, scissortake: runScissorTakeCine, exec3: runExecution3Cine, skeet: runSkeetCine, kickcombo: runKickComboCine, kebab: runKebabCine, talonsnatch: runTalonSnatchCine, skytalon: runSkyTalonCine };

function runCine(game) {
  const ex = game.cine;
  ex.f++;
  ex.att.f = ex.f; if (!ex.data || !ex.data.spiked) ex.vic.f = ex.f;   // drive both anim clocks; once a mid-cine hit has landed, let the victim's clock run on its own
  CINE_RUN[ex.kind](game, ex);        // per-kind body sets states/dmg + clears game.cine when done
}

function resetMatch() {
  for (const f of game.fighters) f.reset();
  Projectiles.length = 0;
  Particles.length = 0;
  Slashes.length = 0;
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
  game.witchTime = 0;
  game.witchWho = null;
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
    else if (KeyQueue[i] === 'KeyV') { KeyQueue.splice(i, 1); retroToggle(); }   // canvas stays pixelated either way
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
  // WITCH TIME: the world crawls — the SLOW fighter updates every other frame while the witch
  // (Vesper) stays full speed → her free-punish window. Combat runs every frame so her hits land.
  if (game.witchTime > 0) {
    game.witchTime--;
    if (game.witchTime === 0) game.witchWho = null;
  }
  const wtFast = game.witchTime > 0 ? game.witchWho : null;
  const wtSkip = wtFast && (game.frame % 2 === 0);   // on these frames the slow fighter is frozen
  if (!(wtSkip && f1 !== wtFast)) f1.update(f2, game);
  if (!(wtSkip && f2 !== wtFast)) f2.update(f1, game);
  combatUpdate(f1, f2, game);

  // afterimage trail: log each settled position (only on real logic frames — not during freezes/cines)
  for (const f of game.fighters) { (f.trailHist || (f.trailHist = [])).push({ x: f.x, y: f.y }); if (f.trailHist.length > 14) f.trailHist.shift(); }

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
      // SHOTGUN KO → GIB: the head flies off as a physics object, body goes headless.
      if (f.gibArmed > 0 && !f.decapitated) {
        f.decapitated = true;
        const hy = f.y - CFG.BODY_H + 14;
        spawnHead(f.x, hy, dir * (9 + Math.random() * 7), -13 - Math.random() * 4, '#f0d2bc', f.color);
        spawnBlood(f.x, hy + 14, dir, 52); spawnBlood(f.x, hy + 14, -dir, 28);
        spawnSpark(f.x, hy, 'parry');
      }
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
