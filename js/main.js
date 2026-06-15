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
  flash: 0,               // white screen-flash countdown (counter-hit), decays with shake
  feed: [],               // strike feed (newest first), drawn by ui.js
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
  game.flash = CFG.COUNTER_FLASH;
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

function resetMatch() {
  for (const f of game.fighters) f.reset();
  Projectiles.length = 0;
  Particles.length = 0;
  FloatTexts.length = 0;
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
  game.frame++;
  handleSystemKeys();
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
    game.slowmo = CFG.KO_SLOWMO_FRAMES;
    const winner = f1.hp <= 0 ? (f2.hp <= 0 ? null : f2) : f1;
    game.banner = {
      text: game.executionKill ? 'EXECUTED.' : 'K.O.',
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
  render(ctx, game);
  drawUI(ctx, game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
