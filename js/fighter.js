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
// ─────────────────────────────────────────────────────────────

// Entering any of these means the defender escaped — combo bookkeeping resets.
const NEUTRAL_RESET = new Set(['idle', 'walk', 'crouch', 'run', 'blockstun', 'getup', 'downed']);

// States where this.move stays live (everything else clears it on entry).
const MOVE_STATES = new Set(['attack', 'airattack', 'flyattack']);

// Execution window: they're gassed, nearly dead, and you're close enough.
function canExecute(att, opp) {
  return opp.state === 'gassed' && opp.hp > 0 && opp.hp <= CFG.MAX_HP * CFG.EXECUTE_HP_FRAC
    && Math.abs(opp.x - att.x) <= CFG.EXECUTE_RANGE;
}

class Fighter {
  constructor(x, facing, pad, name, color) {
    this.pad = pad;
    this.name = name;
    this.color = color;
    this.spawnX = x;
    this.spawnFacing = facing;
    this.reset();
  }

  reset() {
    this.x = this.spawnX;
    this.y = CFG.FLOOR_Y;
    this.vx = 0; this.vy = 0;
    this.pushVel = 0;
    this.facing = this.spawnFacing;
    this.hp = CFG.MAX_HP;
    this.meter = 0;
    this.stamina = CFG.MAX_STAMINA;
    this.state = 'idle';
    this.f = 0;
    this.move = null; this.moveName = null;
    this.moveHitDone = false; this.madeContact = false;
    this.stunFrames = 0;
    this.invuln = 0;
    this.backHeldFrames = 0;
    this.comboHits = 0; this.comboMoves = {}; this.airHits = 0;
    this.bounced = false;
    this.groundHits = 0;       // hits eaten while downed this knockdown (cap → invuln getup)
    this.attackDrift = 0;      // momentum carried into/through strikes
    this.hitCount = 0;         // multihit bookkeeping (flying uppercut)
    this.lastHitF = -99;
    this.thrownFrom = 0;       // clinch-throw arc endpoints
    this.thrownTo = 0;
    this.usedAirAttack = false;
    this.runDir = 0; this.bdDir = 0;
    this.landFrames = CFG.LAND_FRAMES;
    this.superFlash = false;   // main consumes → triggers cinematic freeze
    this.spawnShot = false;    // combat consumes → spawns the cannon round
  }

  // ── bookkeeping ────────────────────────────────────────────
  setState(name) {
    const prev = this.state;
    this.state = name;
    this.f = 0;
    if (!MOVE_STATES.has(name)) { this.move = null; this.moveName = null; }
    if (NEUTRAL_RESET.has(name)) { this.comboHits = 0; this.comboMoves = {}; this.airHits = 0; }
    if (name === 'getup') { this.invuln = CFG.GETUP_FRAMES + CFG.GETUP_INVULN_EXTRA; this.groundHits = 0; playSfx('getup'); }
    if (name === 'downed') { this.vx = 0; this.bounced = false; }   // groundHits PERSISTS across pops within one knockdown
    if (name === 'gassed') playSfx('gassed');
    if (name === 'backdash' || name === 'run') playSfx('dash');
    // Leaving gassed by ANY route (including getting hit) grants the recovery
    // refill — otherwise hitting a gassed fighter denies it and re-gas loops.
    if (prev === 'gassed' && name !== 'gassed') this.stamina = Math.max(this.stamina, CFG.GASSED_RECOVER_STAMINA);
  }

  animKey() { return this.move ? this.move.anim : this.state; }
  isAirborne() { return this.state === 'air' || this.state === 'airattack' || this.state === 'flyattack' || this.state === 'launched'; }
  isCrouched() { return this.state === 'crouch' || !!(this.move && this.move.crouching); }
  inHitState() { return this.state === 'hitstun' || this.state === 'launched'; }

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
    if (['downed', 'fallheavy', 'getup', 'thrown'].includes(this.state)) return null;
    return { x: this.x - CFG.PUSHBOX_W / 2, y: this.y - CFG.BODY_H, w: CFG.PUSHBOX_W, h: CFG.BODY_H };
  }

  activeHitbox() {
    if (MOVE_STATES.has(this.state) && this.move && !this.moveHitDone) {
      const mv = this.move;
      // flying uppercut only strikes on the way UP — the fall is the commitment
      if (this.moveName === 'flyuppercut' && this.vy > 2) return null;
      if (this.f > mv.startup && this.f <= mv.startup + mv.active) {
        const hb = mv.hitbox;
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
    const mv = MOVES[name];
    this.stamina = Math.max(0, this.stamina - mv.stamina);
    // No dead-stops: strikes carry a chunk of your locomotion into them.
    // Chains ('attack' → 'attack') keep whatever flow is already going.
    if (!isAir) {
      const heldDir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
      if (this.state === 'run') this.attackDrift = this.runDir * CFG.RUN_SPEED * CFG.MOMENTUM_KEEP;
      else if (this.state === 'walk') this.attackDrift = heldDir * CFG.WALK_SPEED * CFG.MOMENTUM_KEEP;
      else if (this.state !== 'attack') this.attackDrift = 0;
    }
    this.setState(isAir ? 'airattack' : 'attack');
    this.move = mv;
    this.moveName = name;
    this.moveHitDone = false;
    this.madeContact = false;
    this.hitCount = 0;
    this.lastHitF = -99;
    playSfx(mv.heavy ? 'whoosh_heavy' : 'whoosh_light');
  }

  endMove() {
    const mv = this.move;
    // Whiff tax: HEAVIES only. A whiffed jab is a shrug; a whiffed raw
    // backfist/uppercut/sweep is how you gas out and die.
    if (mv && mv.heavy && !this.madeContact) this.stamina = Math.max(0, this.stamina - mv.stamina * CFG.WHIFF_STAMINA_PENALTY);
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
    if (p.pressed.super && this.meter >= CFG.SUPER_COST) {
      p.consume('super');
      this.meter = 0;
      this.setState('superstart');
      this.superFlash = true;
      return true;
    }
    const btn = p.pressed.punch ? 'punch' : p.pressed.kick ? 'kick' : null;
    if (btn && this.stamina > 0) {
      const name = resolveNeutralMove(btn, this.dirCategory(opp, p.snap[btn]), opp.state === 'downed' || opp.state === 'fallheavy', Math.abs(opp.x - this.x) < 160);
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
    if (!mv || !mv.cancels || !this.madeContact) return;
    if (this.f < mv.startup || this.f > mv.startup + mv.active + 8) return;
    const btn = this.pad.pressed.punch ? 'punch' : this.pad.pressed.kick ? 'kick' : null;
    if (!btn || this.stamina <= 0) return;
    let cand = resolveNeutralMove(btn, this.dirCategory(opp, this.pad.snap[btn]), opp.state === 'downed' || opp.state === 'fallheavy', Math.abs(opp.x - this.x) < 160);
    // "Cross, then forward+punch again → hook": inside a chain, forward+P resolves to hook.
    if (cand === 'cross' && mv.cancels.includes('hook')) cand = 'hook';
    if (cand && mv.cancels.includes(cand)) { this.pad.consume(btn); this.startMove(cand); }
  }

  // ── reactions (combat.js calls these) ──────────────────────
  receiveBlockstun(frames) { this.setState('blockstun'); this.stunFrames = frames; }
  receiveHitstun(frames) { this.setState('hitstun'); this.stunFrames = frames; this.vx = 0; this.vy = 0; }
  receiveParriedStagger() { this.setState('parried'); this.stunFrames = CFG.PARRY_ATTACKER_STAGGER; }

  beginThrown(thrower) {
    this.setState('thrown');
    this.invuln = CFG.THROW_FRAMES + 10;
    this.thrownFrom = this.x;
    const to = thrower.x - thrower.facing * 85;
    this.thrownTo = Math.max(CFG.WALL_L + 40, Math.min(CFG.WALL_R - 40, to));
    playSfx('throw_grab');
    pushFeed('JUDO TOSS!', thrower.color);
  }

  setLaunched(vx, vy, freshLaunch) {
    if (freshLaunch) this.bounced = false;
    this.setState('launched');
    this.vx = vx;
    this.vy = vy;
    if (this.y >= CFG.FLOOR_Y) this.y = CFG.FLOOR_Y - 1;
  }

  // ── per-frame update (skipped during hitstop/superfreeze) ──
  update(opp, game) {
    this.f++;
    if (this.invuln > 0) this.invuln--;

    const NO_REGEN = new Set(['attack', 'airattack', 'flyattack', 'superstart', 'gassed', 'hitstun', 'blockstun', 'parried', 'launched', 'fallheavy', 'downed', 'throwgrab', 'throwanim', 'thrown', 'execute', 'executed']);
    if (!NO_REGEN.has(this.state)) this.stamina = Math.min(CFG.MAX_STAMINA, this.stamina + CFG.STAMINA_REGEN);

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
          this.x += dir * CFG.WALK_SPEED;
          // walking them down refuels faster than turtling — aggression is rewarded
          if (dir === this.facing) this.stamina = Math.min(CFG.MAX_STAMINA, this.stamina + CFG.ADVANCE_REGEN_BONUS);
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
        if (this.tryActions(opp, game)) break;
        const heldDir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
        if (heldDir !== this.runDir) { this.setState('idle'); break; }
        this.x += this.runDir * CFG.RUN_SPEED;
        break;
      }
      case 'backdash': {
        this.x += this.bdDir * CFG.BACKDASH_SPEED * Math.max(0, 1 - this.f / CFG.BACKDASH_FRAMES);
        if (this.f >= CFG.BACKDASH_FRAMES) this.setState('idle');
        break;
      }
      case 'prejump': {
        if (this.f >= CFG.PREJUMP_FRAMES) {
          const dir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
          const toward = Math.sign(opp.x - this.x) || this.facing;
          this.vx = dir === 0 ? 0 : dir * (dir === toward ? CFG.JUMP_DRIFT_FWD : CFG.JUMP_DRIFT_BACK);
          this.vy = CFG.JUMP_VEL;
          this.usedAirAttack = false;
          this.setState('air');
          playSfx('jump');
        }
        break;
      }
      case 'air': {
        if (!this.usedAirAttack && (this.pad.pressed.punch || this.pad.pressed.kick) && this.stamina > 0) {
          this.pad.consume(this.pad.pressed.punch ? 'punch' : 'kick');
          this.usedAirAttack = true;
          this.startMove('jumpkick', true);
        }
        break;
      }
      case 'airattack':
        break;   // physics carries it; lands into 'land' below
      case 'land': {
        if (this.f >= this.landFrames) this.setState(this.stamina <= 0 ? 'gassed' : 'idle');
        break;
      }
      case 'attack': {
        const mv = this.move;
        // P+K mid-string: execution if available, otherwise the clinch throw
        if (this.madeContact && this.pad.pressed.punch && this.pad.pressed.kick
            && this.f >= mv.startup && this.f <= mv.startup + mv.active + 8) {
          this.pad.consume('punch');
          this.pad.consume('kick');
          if (canExecute(this, opp)) startExecution(this, opp, game);
          else this.setState('throwgrab');
          break;
        }
        // tap JUMP during knee/uppercut startup (in range) → flying version
        if (mv.flyConvert && this.f <= mv.startup && this.pad.pressed.jump) {
          const fm = MOVES[mv.flyConvert];
          const range = mv.flyConvert === 'flyknee' ? CFG.FLY_KNEE_RANGE : CFG.FLY_UPPERCUT_RANGE;
          if (Math.abs(opp.x - this.x) <= range && this.stamina > 0) {
            this.pad.consume('jump');
            this.stamina = Math.max(0, this.stamina - fm.stamina);
            const toward = Math.sign(opp.x - this.x) || this.facing;
            this.facing = toward;
            this.setState('flyattack');
            this.move = fm;
            this.moveName = mv.flyConvert;
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
        if (mv.lungeVx && this.f <= mv.startup) this.x += this.facing * mv.lungeVx;
        // momentum glides through the strike…
        this.x += this.attackDrift;
        this.attackDrift *= 0.92;
        // …and holding toward keeps you advancing — pressing the attack sips stamina
        const toward = Math.sign(opp.x - this.x) || this.facing;
        const heldDir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
        if (heldDir === toward && this.stamina > 0) {
          this.x += toward * CFG.PRESS_DRIFT;
          this.stamina = Math.max(0, this.stamina - CFG.PRESS_DRIFT_STAMINA);
        }
        this.tryCancel(opp);   // may swap this.move mid-string
        if (this.state === 'attack') {
          const m = this.move;
          const total = m.startup + m.active + m.recovery;
          // FLOW CANCEL: contact (hit OR block) caps recovery — land something
          // and you're moving again. Whiff and you eat every recovery frame.
          const flowEnd = m.startup + m.active + CFG.FLOW_CANCEL_RECOVERY;
          if (this.f >= total || (this.madeContact && this.f >= flowEnd)) this.endMove();
        }
        break;
      }
      case 'blockstun':
      case 'hitstun':
      case 'parried': {
        if (this.f >= this.stunFrames) this.setState('idle');
        break;
      }
      case 'flyattack':
      case 'launched':
        break;   // physics + landing logic below
      case 'throwgrab': {
        // the grab reaches on frame 5; miss = long, punishable whiff
        if (this.f === 5) {
          const ok = !opp.isAirborne() && opp.invuln <= 0
            && !['downed', 'fallheavy', 'thrown', 'getup'].includes(opp.state)
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
      case 'execute':
      case 'executed':
        break;   // the execution sequencer in main.js drives both bodies
      case 'fallheavy': {
        if (this.f >= CFG.FALL_FRAMES) this.setState('downed');
        break;
      }
      case 'downed': {
        // Dead fighters stay down. Live ones get a FAST invulnerable get-up —
        // immediately once they've eaten their ground-hit budget.
        if (this.hp > 0 && (this.groundHits >= CFG.MAX_GROUND_HITS || this.f >= CFG.KNOCKDOWN_FRAMES)) this.setState('getup');
        break;
      }
      case 'getup': {
        if (this.f >= CFG.GETUP_FRAMES) this.setState('idle');
        break;
      }
      case 'gassed': {
        // Wide open: no attacks, no block, no jump — just a slow desperate shuffle.
        const dir = this.pad.held.right ? 1 : this.pad.held.left ? -1 : 0;
        this.x += dir * CFG.WALK_SPEED * 0.4;
        if (this.f % 14 === 1) {   // sweat drips (logic-rate, freeze-gated — not in render)
          Particles.push({ x: this.x, y: this.y - CFG.BODY_H * 0.9, vx: this.facing, vy: -1.5, life: 16, maxLife: 16, color: '#4fc3f7', size: 3, grav: 0.2 });
        }
        if (this.f >= CFG.GASSED_FRAMES) this.setState('idle');   // refill happens in setState
        break;
      }
      case 'superstart': {
        if (this.f === CFG.SUPER_STARTUP) this.spawnShot = true;
        if (this.f >= CFG.SUPER_STARTUP + CFG.SUPER_RECOVERY) this.setState('idle');
        break;
      }
    }

    // ── shared physics ──
    if (this.isAirborne()) {
      this.vy += CFG.GRAVITY;
      this.x += this.vx;
      this.y += this.vy;
      if (this.y >= CFG.FLOOR_Y && this.vy >= 0) {
        this.y = CFG.FLOOR_Y;
        const impact = this.vy;
        this.vy = 0;
        if (this.state === 'launched') {
          if (!this.bounced && impact >= CFG.BOUNCE_MIN_VY) {
            // Hit the ground HARD and bounce — never a flat no-impact landing.
            this.bounced = true;
            this.vy = -impact * CFG.GROUND_BOUNCE;
            this.y = CFG.FLOOR_Y - 1;
            game.shake = Math.max(game.shake, 5);
            spawnDust(this.x, CFG.FLOOR_Y, 10);
            playSfx('bounce');
          } else {
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
    if (!this.isAirborne() && this.state !== 'thrown' && this.y < CFG.FLOOR_Y) { this.y = CFG.FLOOR_Y; this.vy = 0; }

    // Walls — the phone booth has hard edges. Launched bodies splat and rebound.
    const minX = CFG.WALL_L + 30, maxX = CFG.WALL_R - 30;
    if (this.x < minX) {
      this.x = minX;
      if (this.state === 'launched' && this.vx < -4) { this.vx = -this.vx * 0.35; game.shake = Math.max(game.shake, 4); }
      else if (this.vx < 0) this.vx = 0;
    }
    if (this.x > maxX) {
      this.x = maxX;
      if (this.state === 'launched' && this.vx > 4) { this.vx = -this.vx * 0.35; game.shake = Math.max(game.shake, 4); }
      else if (this.vx > 0) this.vx = 0;
    }
  }
}
