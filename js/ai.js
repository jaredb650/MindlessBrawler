// ─────────────────────────────────────────────────────────────
// CPU opponent (dummy mode 4). Drives P2's Pad with synthetic
// held-states — it plays by exactly the same input rules you do.
//
// Personality: walks you down, throws real strings, guards with a
// human-ish reaction delay (sometimes its fresh guard lands inside
// the parry window — emergent parries), soccer-kicks knockdowns,
// smells blood when you're gassed, and will absolutely execute you.
// ─────────────────────────────────────────────────────────────
class CPU {
  constructor() {
    this.queue = [];       // plan steps: {wait:n} or {tap:[btns], dir}
    this.hold = {};        // btn -> frames remaining held
    this.guard = 0;
    this.guardLow = false;
    this.reactT = -1;      // reaction-delay countdown after spotting a threat
    this.cool = 40;        // breath between offensive decisions
  }

  press(btns, dir) { this.queue.push({ tap: btns, dir }); }
  delay(n) { this.queue.push({ wait: n }); }
  string(steps, gap) {
    for (const s of steps) { this.press(s.btns, s.dir); this.delay(gap); }
  }

  update(self, opp, game) {
    const synth = {};
    if (self.hp <= 0) return synth;
    const dx = opp.x - self.x;
    const dist = Math.abs(dx);
    const toward = dx >= 0 ? 'right' : 'left';
    const away = dx >= 0 ? 'left' : 'right';
    if (this.cool > 0) this.cool--;

    // throw-tech mash (it's not a free escape — only sometimes commits)
    if (self.state === 'thrown' && self.techWindow > 0) { if (Math.random() < 0.5) { synth.punch = true; synth.kick = true; } return synth; }
    // occasionally roll on wakeup to reposition out of the corner
    if (self.state === 'downed' && self.f === 3 && Math.random() < 0.3) { synth[away] = true; return synth; }

    // run the queued plan (one step at a time)
    if (this.queue.length) {
      const step = this.queue[0];
      if (step.wait > 0) {
        step.wait--;
      } else {
        if (step.dir === 'forward') this.hold[toward] = 4;
        if (step.dir === 'back') this.hold[away] = 4;
        if (step.dir === 'down') this.hold.down = 4;
        if (step.dir === 'up') this.hold.up = 4;
        if (step.tap) for (const b of step.tap) this.hold[b] = 2;
        this.queue.shift();
      }
    }

    // tick held buttons into the synthetic pad
    for (const b in this.hold) {
      if (this.hold[b] > 0) { synth[b] = true; this.hold[b]--; }
    }

    // ── defense: see a swing coming, react late like a person ──
    const threat = ['attack', 'flyattack', 'airattack', 'throwgrab'].includes(opp.state) && dist < 240;
    if (threat && this.guard <= 0 && this.reactT < 0) this.reactT = 8 + ((Math.random() * 9) | 0);
    if (this.reactT > 0) this.reactT--;
    else if (this.reactT === 0) {
      this.reactT = -1;
      if (Math.random() < 0.55) {   // sometimes it just eats the hit
        this.guard = 22 + Math.random() * 26;
        this.guardLow = !!(opp.move && opp.move.guard === 'low');
      }
    }
    if (this.guard > 0) {
      this.guard--;
      synth[away] = true;
      if (this.guardLow) synth.down = true;
      return synth;
    }

    const actionable = ['idle', 'walk', 'crouch', 'run'].includes(self.state);
    if (this.queue.length || !actionable) return synth;

    // ── blood in the water ──
    if (canExecute(self, opp)) { this.press(['punch', 'kick']); return synth; }
    if ((opp.state === 'downed' || opp.state === 'fallheavy') && dist < 150 && this.cool <= 0) {
      this.press(['kick'], 'forward');   // soccer kick
      this.cool = 35;
      return synth;
    }
    if (opp.state === 'gassed' && dist > 130) { synth[toward] = true; return synth; }   // RUN at them

    // ── self-preservation ──
    if (self.stamina < 18) { synth[away] = true; return synth; }   // back off, breathe

    // ── anti-air ──
    if (opp.isAirborne() && dist < 150 && this.cool <= 0) {
      this.press(['punch'], 'up');
      this.cool = 45;
      return synth;
    }

    // ── approach: get INSIDE jab range before swinging ──
    if (dist > 112) {
      synth[toward] = true;
      if (dist > 380 && this.cool <= 0 && Math.random() < 0.02) {
        // dash in: double-tap toward
        this.queue.push({ tap: [], dir: 'forward' }, { wait: 3 }, { tap: [], dir: 'forward' }, { wait: 8 });
        this.cool = 25;
      }
      return synth;
    }

    // ── the pocket: pick a string and commit ──
    if (this.cool <= 0 && opp.invuln <= 0) {
      const r = Math.random();
      const gap = 8;
      if (r < 0.28) {
        this.string([{ btns: ['punch'] }, { btns: ['punch'], dir: 'forward' }, { btns: ['punch'], dir: 'forward' }], gap);   // jab→cross→hook
      } else if (r < 0.48) {
        this.string([{ btns: ['punch'] }, { btns: ['punch'], dir: 'forward' }, { btns: ['kick'], dir: 'forward' }], gap);    // jab→cross→legkick
      } else if (r < 0.62) {
        this.string([{ btns: ['punch'], dir: 'down' }, { btns: ['kick'], dir: 'down' }], gap);                               // crouchjab→sweep
      } else if (r < 0.78) {
        this.string([{ btns: ['punch'] }, { btns: ['kick'], dir: 'up' }, { btns: ['kick'], dir: 'forward' }], gap);          // jab→knee→legkick
      } else if (r < 0.9) {
        this.press(['kick'], 'up');                                                                                          // knee (gas you out)
      } else {
        this.press(['punch'], 'up');                                                                                         // uppercut gamble
      }
      this.cool = 45 + Math.random() * 65;
    }
    return synth;
  }
}
