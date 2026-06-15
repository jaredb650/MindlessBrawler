// ─────────────────────────────────────────────────────────────
// Main: fixed-timestep loop (60 logic fps), hitstop / super-freeze /
// KO slow-mo gating, match flow, system keys (dummy modes, debug).
// ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const pad1 = new Pad(P1_MAP);
const pad2 = new Pad(P2_MAP);

const game = {
  fighters: [
    new Fighter(CFG.STAGE_W * 0.35, 1, pad1, 'PLAYER 1', '#4fc3f7'),
    new Fighter(CFG.STAGE_W * 0.65, -1, pad2, 'PLAYER 2', '#ef5350'),
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
  feed: [],               // strike feed (newest first), drawn by ui.js
  koFreeze: 0,            // KO cinematic: frames the world holds on black + white silhouettes before the launch
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
// canned-cinematic harness (kind:'groundpound'). NON-lethal — the flurry drains the
// victim's STAMINA only (hp is never touched). Sets the attacker's re-mount cooldown.
function startGroundPound(att, vic, game) {
  att.groundpoundCD = CFG.GROUNDPOUND_COOLDOWN;
  att.setState('gpmount');
  vic.setState('gpmounted');
  vic.invuln = 0;            // pinned + owned by the sequencer — no stray hits reach them anyway
  startCine('groundpound', att, vic, game);   // the harness owns both bodies + faces them from here
  playSfx('throw_grab');
  pushFeed('MOUNT!', att.color);
}

// Ground & Pound: mount → 4 hammerfists that DRAIN STAMINA (never HP — non-lethal),
// then dismount and re-seat the victim DOWNED on the floor for oki (true okizeme).
function runGroundPoundCine(game, ex) {
  const { att, vic } = ex;
  if (ex.f <= CFG.GP_MOUNT) {
    // seat onto the body, slow menace (no damage)
    vic.x += (att.x + att.facing * 40 - vic.x) * 0.2;
  } else if (ex.f <= CFG.GP_MOUNT + CFG.GP_FLURRY) {
    const t = ex.f - CFG.GP_MOUNT;
    if (t % CFG.GP_BEAT === 1) {   // 4 hammerfists across the flurry
      vic.stamina = Math.max(0, vic.stamina - CFG.GROUNDPOUND_DRAIN_PER_HIT);   // NON-lethal: stamina only
      spawnSpark(vic.x, CFG.FLOOR_Y - 36 - Math.random() * 14, 'hit');
      game.shake = Math.max(game.shake, 4);
      game.hitstop = Math.max(game.hitstop, CFG.HITSTOP_LIGHT);
      playSfx('hit_med');
      playSfx('body_blow');
    }
  } else if (ex.f >= CFG.GP_MOUNT + CFG.GP_FLURRY + CFG.GP_OUT) {
    // dismount → attacker recovers; victim re-seated DOWNED with a fresh floor timer
    // so the knockdown game continues (true oki). NON-lethal: hp untouched.
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

const CINE_RUN = { suplex: runSuplexCine, groundpound: runGroundPoundCine, flatliner: runFlatlinerCine };

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
  Stains.length = 0;   // fresh arena each fight
  UIState.trail = [CFG.MAX_HP, CFG.MAX_HP];
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
  // SCENE layer (menu.js): the title / mode-select / move-list / pause screens run
  // their own step and never touch the fight. In the fight, a pause keypress (Esc /
  // Enter / P) lifts us to the pause screen before any fight logic runs.
  if (game.scene !== 'fight') { menuStep(game); return; }
  if (consumePauseKey()) { game.scene = 'paused'; game.menu.sel = 0; return; }

  game.frame++;
  handleSystemKeys();
  // KO FREEZE-FRAME: the whole world holds on black with white silhouettes (render.js)
  // for a beat, THEN releases into the launch. Nothing updates — a hard freeze.
  if (game.koFreeze > 0) { game.koFreeze--; return; }
  if (game.banner && game.banner.timer > 0 && game.matchState !== 'ko') game.banner.timer--;
  game.shake = Math.max(0, game.shake - 0.6);
  if (game.flash > 0) game.flash--;
  updateFx();

  // Pads sample EVERY logic frame — taps during freezes get buffered, not eaten.
  // `frozen` keeps the press buffers and tap windows from ticking down mid-freeze.
  const frozen = game.superFreeze > 0 || game.hitstop > 0;
  pad1.update(undefined, frozen);
  pad2.update(game.dummyMode !== 0 ? dummyInputs() : undefined, frozen);

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
        playSfx('super_freeze');
      }
    }
  }

  if (game.matchState === 'fight' && (f1.hp <= 0 || f2.hp <= 0)) {
    game.matchState = 'ko';
    // the freeze-frame beat — but the bespoke finishers (execution / flatliner) already
    // have their own dramatic freeze, so only normal KOs + super get this one.
    if (!game.executionKill && !game.flatlinerKill) game.koFreeze = CFG.KO_FREEZE;
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
      text: game.flatlinerKill ? 'FLATLINED.' : game.executionKill ? 'EXECUTED.' : 'K.O.',
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
  if (game.scene === 'title' || game.scene === 'mode' || game.scene === 'movelist') {
    drawMenu(ctx, game);
  } else {
    render(ctx, game);
    if (game.koFreeze <= 0) drawUI(ctx, game);   // hide the HUD during the KO silhouette freeze
    if (game.scene === 'paused') drawPauseOverlay(ctx, game);   // freeze the fight, overlay the menu
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
