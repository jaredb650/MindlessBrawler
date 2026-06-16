// ─────────────────────────────────────────────────────────────
// Render v2: procedural ARTICULATED fighters — two-bone IK limbs,
// real stances, outlines + two-tone shading, swing trails.
// Still the file a sprite pass replaces: it keys off
// (fighter.animKey(), f, facing, x, y) and physics state only.
// ─────────────────────────────────────────────────────────────
const Particles = [];
const FloatTexts = [];
const Stains = [];       // persistent blood decals on floor/walls (cleared on rematch)

// `power` (hits only): 0 light · 1 med · 2 heavy → scales the burst so heavies READ heavy.
// Callers that omit it default to med, so existing spark calls look ~unchanged.
function spawnSpark(x, y, kind, power) {
  const palettes = {
    hit:   ['#ffffff', '#ffb74d', '#ff7043'],
    block: ['#80deea', '#4dd0e1'],
    parry: ['#fff59d', '#ffe082', '#ffffff'],
    blood: ['#c0392b', '#e74c3c', '#7b241c'],
  };
  const colors = palettes[kind] || palettes.hit;
  const p = (power == null) ? 1 : power;
  const n = kind === 'parry' ? 14 : kind === 'hit' ? (6 + p * 5) : 6;   // light 6 / med 11 / heavy 16
  const spMax = kind === 'block' ? 3 : kind === 'hit' ? (4 + p * 3) : 6;
  const szMax = kind === 'hit' ? (2 + p * 1.5) : 3;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * spMax;
    Particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
      life: 14 + Math.random() * 10, maxLife: 24,
      color: colors[(Math.random() * colors.length) | 0],
      size: 2 + Math.random() * szMax, grav: 0.15,
      blood: kind === 'blood',
    });
  }
}

// Blood gout — a directional spray (mostly along `dir`) that arcs and falls fast.
// The Flatliner's money shot; also a light spurt on the connecting blow.
function spawnBlood(x, y, dir, n) {
  const reds = ['#c0392b', '#e74c3c', '#a93226', '#922b21', '#7b241c'];
  for (let i = 0; i < n; i++) {
    const sp = 3 + Math.random() * 10;
    Particles.push({
      x, y: y + (Math.random() - 0.5) * 36,
      vx: dir * sp * (0.5 + Math.random()) + (Math.random() - 0.5) * 4,
      vy: -Math.random() * 8 - 1,                      // sprays up, then gravity drags it down
      life: 22 + Math.random() * 20, maxLife: 42,
      color: reds[(Math.random() * reds.length) | 0],
      size: 2 + Math.random() * 4.5, grav: 0.34,       // heavier than sparks — blood drops
      blood: true,                                     // stains the floor/wall where it lands
    });
  }
}

// A persistent blood decal where a drop hit the floor (pool) or a wall (drip).
const STAIN_CAP = 240;   // the arena can only hold so much
let stainWrite = 0;      // ring-buffer cursor — overwrite oldest in O(1) (was Array.shift, O(n) per drop)
function spawnStain(x, y, vertical) {
  const s = {
    x, y, r: 3 + Math.random() * 7, vertical: !!vertical,
    color: ['#7b241c', '#922b21', '#641e16'][(Math.random() * 3) | 0],
    a: 0.4 + Math.random() * 0.4,
  };
  if (Stains.length < STAIN_CAP) Stains.push(s);
  else { Stains[stainWrite % STAIN_CAP] = s; stainWrite++; }   // recycle the oldest slot, no shift/reindex
}

// rematch: drop the decals AND reset the ring cursor (else the next match recycles a
// non-oldest slot once it refills). resetMatch() calls this instead of Stains.length = 0.
function clearStains() { Stains.length = 0; stainWrite = 0; }

function drawStains(ctx) {
  for (const s of Stains) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    if (s.vertical) ctx.ellipse(s.x, s.y, s.r * 0.6, s.r * 1.4, 0, 0, Math.PI * 2);   // wall drip
    else ctx.ellipse(s.x, s.y, s.r * 1.5, s.r * 0.45, 0, 0, Math.PI * 2);             // floor pool
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function spawnDust(x, y, n) {
  for (let i = 0; i < n; i++) {
    Particles.push({
      x: x + (Math.random() - 0.5) * 50, y: y - Math.random() * 8,
      vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 2.5,
      life: 18 + Math.random() * 14, maxLife: 32,
      color: '#6b6b78', size: 3 + Math.random() * 4, grav: 0.02,
    });
  }
}

function spawnFloatText(x, y, text, color) {
  FloatTexts.push({ x, y, text, color, life: 50 });
}

// Downward ENERGY SPIKE — a lance of bright energy driving a body into the floor,
// then splashing outward along the ground. (elbow drop / axe kick spikes.)
function spawnSpike(x, dir) {
  const cols = ['#ffffff', '#b3e5fc', '#80deea', '#ffd54f'];
  for (let i = 0; i < 18; i++) {           // streaks raining DOWN from chest height into the floor
    Particles.push({
      x: x + (Math.random() - 0.5) * 46, y: CFG.FLOOR_Y - 150 + Math.random() * 60,
      vx: (Math.random() - 0.5) * 3 + (dir || 0) * 1.5, vy: 9 + Math.random() * 12,
      life: 9 + Math.random() * 7, maxLife: 16,
      color: cols[(Math.random() * cols.length) | 0], size: 2 + Math.random() * 3.5, grav: 0.4,
    });
  }
  for (let i = 0; i < 14; i++) {           // ground-impact burst splashing out along the floor
    const sp = 3 + Math.random() * 8;
    Particles.push({
      x, y: CFG.FLOOR_Y - 4,
      vx: (Math.random() - 0.5) * 2 * sp, vy: -Math.random() * 4,
      life: 10 + Math.random() * 8, maxLife: 18,
      color: cols[(Math.random() * cols.length) | 0], size: 2 + Math.random() * 3, grav: 0.25,
    });
  }
}

// Blue ELECTRIC burst — fast, gravity-less crackle sparks. (charged overhand explosion + the seize.)
function spawnElectric(x, y, n) {
  const cols = ['#4fc3f7', '#81d4fa', '#b3e5fc', '#ffffff', '#e1f5fe'];
  for (let i = 0; i < (n || 16); i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 3 + Math.random() * 7;
    Particles.push({
      x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 24,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 5 + Math.random() * 8, maxLife: 13,
      color: cols[(Math.random() * cols.length) | 0], size: 1.5 + Math.random() * 2.5, grav: 0,
    });
  }
}

// Jagged lightning arcs radiating from (x,y) — drawn (not particles), flickers every frame.
function drawElectricArcs(ctx, x, y, r, count) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.9;
  for (let a = 0; a < (count || 3); a++) {
    ctx.strokeStyle = ['#4fc3f7', '#81d4fa', '#ffffff'][(Math.random() * 3) | 0];
    ctx.lineWidth = 1.4 + Math.random() * 1.6;
    const ang = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 3 + ((Math.random() * 2) | 0);
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      ctx.lineTo(x + Math.cos(ang) * r * t + (Math.random() - 0.5) * r * 0.55,
                 y + Math.sin(ang) * r * t + (Math.random() - 0.5) * r * 0.55);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Horizontal SPEED / action lines streaking off a fast-moving fist. (machine-gun blows.)
function drawActionLines(ctx, x, y, dir) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const oy = y + (Math.random() - 0.5) * 44;
    const len = 26 + Math.random() * 40;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x - dir * 6, oy);
    ctx.lineTo(x - dir * (6 + len), oy);
    ctx.stroke();
  }
  ctx.restore();
}

// FX run even during hitstop — the freeze is for bodies, not sparks.
function updateFx() {
  for (let i = Particles.length - 1; i >= 0; i--) {
    const p = Particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.life--;
    // blood that reaches a surface leaves a permanent stain, then pools out
    if (p.blood) {
      if (p.y >= CFG.FLOOR_Y) { spawnStain(p.x, CFG.FLOOR_Y + 1, false); Particles.splice(i, 1); continue; }
      if (p.x <= CFG.WALL_L + 2 || p.x >= CFG.WALL_R - 2) {
        spawnStain(Math.max(CFG.WALL_L + 2, Math.min(CFG.WALL_R - 2, p.x)), p.y, true); Particles.splice(i, 1); continue;
      }
    }
    if (p.life <= 0) Particles.splice(i, 1);
  }
  for (let i = FloatTexts.length - 1; i >= 0; i--) {
    const t = FloatTexts[i];
    t.y -= 0.8; t.life--;
    if (t.life <= 0) FloatTexts.splice(i, 1);
  }
  for (let i = game.feed.length - 1; i >= 0; i--) {
    if (--game.feed[i].life <= 0) game.feed.splice(i, 1);
  }
}

// ── drawing primitives ───────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * amt) | 0;
  const g = Math.min(255, ((n >> 8) & 255) * amt) | 0;
  const b = Math.min(255, (n & 255) * amt) | 0;
  return `rgb(${r},${g},${b})`;
}

const OUTLINE = 'rgba(10,10,16,0.85)';

function capsule(ctx, x1, y1, x2, y2, w, fill) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w + 4.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function ball(ctx, x, y, r, fill) {
  ctx.fillStyle = OUTLINE;
  ctx.beginPath(); ctx.arc(x, y, r + 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// Two-bone IK limb: anchor → joint → end. bend = ±1 picks elbow/knee side.
// Segments stretch a little when the target is far (cartoon snap > T-pose clamp).
function limbIK(ctx, ax, ay, bx, by, segLen, bend, w, fill, endR, endFill) {
  let dx = bx - ax, dy = by - ay;
  let d = Math.hypot(dx, dy) || 0.001;
  const l = Math.max(segLen, d / 2 + 1.5);   // stretch to reach
  const a = d / 2;
  const h = Math.sqrt(Math.max(0, l * l - a * a));
  const mx = ax + dx / 2, my = ay + dy / 2;
  const jx = mx - (dy / d) * h * bend;
  const jy = my + (dx / d) * h * bend;
  capsule(ctx, ax, ay, jx, jy, w, fill);
  capsule(ctx, jx, jy, bx, by, w * 0.9, fill);
  if (endR) ball(ctx, bx, by, endR, endFill || fill);
}

// 0→1 limb extension across startup / active / recovery.
function attackExt(f) {
  const mv = f.move;
  if (!mv) return 0;
  if (f.f <= mv.startup) return 0.25 + 0.45 * (f.f / mv.startup);
  if (f.f <= mv.startup + mv.active) return 1;
  return Math.max(0, 1 - (f.f - mv.startup - mv.active) / Math.max(1, mv.recovery));   // retract fully by end of recovery so the limb is already home when state flips to idle (no snap)
}

// ── the fighter ──────────────────────────────────────────────
// Cross / uppercut / overhand are REAR-hand straights; jab / hook stay lead-hand.
const REAR_HAND_PUNCH = new Set(['cross', 'uppercut', 'overhand']);

// Skeleton in local space: feet at y=0, +x = forward.
function drawFighter(ctx, f, game) {
  const key = f.animKey();
  const flash = (f.hitFlash > 0)   // universal: every clean contact (hit/block/crumple/OTG/launch) flashes white, frame-locked to the hit
    || (f.state === 'executed' && f.f > 20 && f.f % 6 < 2)
    || game.koFreeze > 0;   // KO freeze-frame → solid white silhouette

  const body = flash ? '#ffffff' : f.color;
  const dark = flash ? '#dddddd' : shade(f.color, 0.62);
  const glove = flash ? '#ffffff' : '#f2f2f5';
  const boot = flash ? '#eeeeee' : shade(f.color, 0.45);
  const skin = flash ? '#ffffff' : '#e8c39e';

  // RENDER INTERP: glide the body between logic ticks (smooth on >60Hz). Snap (no glide)
  // on a teleport-sized jump (reset / wall-snap). Visual only — never affects logic.
  let rx = f.x, ry = f.y;
  const ra = game.renderAlpha;
  if (ra != null && ra < 1 && f.prevX != null) {
    const dx = f.x - f.prevX, dy = f.y - f.prevY;
    if (Math.abs(dx) <= CFG.INTERP_SNAP && Math.abs(dy) <= CFG.INTERP_SNAP) { rx = f.prevX + dx * ra; ry = f.prevY + dy * ra; }
  }

  // ground shadow
  const air = Math.max(0, CFG.FLOOR_Y - ry);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(rx, CFG.FLOOR_Y + 6, Math.max(18, 44 - air * 0.08), 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  // hit vibration: jitter the freshly-hit body during the hitstop freeze so the
  // frozen beat reads as a violent impact, not a dropped frame.
  const vib = (game.hitstop > 0 && f.hitFlash > 0) ? (Math.random() - 0.5) * CFG.HIT_VIB : 0;
  ctx.translate(rx + vib, ry);
  if (f.facing === -1) ctx.scale(-1, 1);
  // Spinning moves (back kick / backfist): a VISUAL 360 — flip away during the
  // wind-up, whip back around as the strike extends. Gameplay facing is untouched.
  if ((key === 'backkick' || key === 'backfist' || key === 'spinelbow' || key === 'tornado') && f.move) {
    const sm = f.move, a = Math.min(1, f.f / (sm.startup + sm.active));
    let sx = Math.cos(a * Math.PI * 2);
    sx = sx >= 0 ? Math.max(0.12, sx) : Math.min(-0.12, sx);
    ctx.scale(sx, 1);
  }
  // HARD RULE: unhittable ⇔ flashing transparent. Solid body = fair game.
  if ((f.invuln > 0 || f.state === 'fallheavy') && game.koFreeze <= 0) ctx.globalAlpha = game.frame % 6 < 3 ? 0.25 : 0.6;

  const dead = f.hp <= 0;

  // ── tumbling bodies (launched / thrown): curled ragdoll ──
  if (key === 'launched' || key === 'thrown') {
    ctx.translate(0, -(CFG.FLOOR_Y - f.y > 4 ? 70 : 45));
    ctx.rotate(f.f * (key === 'thrown' ? 0.3 : 0.2));
    capsule(ctx, -16, 14, -34, 30, 13, dark);          // rear leg
    capsule(ctx, -20, -10, -38, 6, 11, dark);          // rear arm
    capsule(ctx, -14, 8, 16, -8, 30, body);            // torso
    capsule(ctx, 12, 14, 30, 28, 13, body);            // front leg
    ball(ctx, 28, -16, 15, skin);                       // head
    drawFace(ctx, 28, -16, 0.6, dead, flash);
    capsule(ctx, 8, -14, 28, 4, 11, body);             // front arm
    ctx.restore();
    return;
  }

  // ── SUPLEX victim: inverted head-first bridge → spike. The arc lifts y above the
  // floor, so it gets a dedicated INVERTED ragdoll (head DOWN, leading the drop).
  // Rotation tips past vertical as the bridge progresses. ──
  if (key === 'suplexed') {
    const a = Math.min(1, f.f / CFG.SUPLEX_FRAMES);
    ctx.translate(0, -(CFG.FLOOR_Y - f.y > 4 ? 70 : 40));
    ctx.rotate(Math.PI * (0.55 + 0.6 * a) * f.facing);   // tip past inverted as it falls
    capsule(ctx, -16, 14, -34, 30, 13, dark);            // rear leg flailing up
    capsule(ctx, -20, -10, -38, 6, 11, dark);            // rear arm
    capsule(ctx, -14, 8, 16, -8, 30, body);              // torso
    capsule(ctx, 12, 14, 30, 28, 13, body);              // front leg up
    ball(ctx, 28, -16, 15, skin);                         // head — now leading downward
    drawFace(ctx, 28, -16, -1, dead, flash);              // hurt face
    capsule(ctx, 8, -14, 28, 4, 11, body);               // front arm
    ctx.restore();
    return;
  }

  // ── lying flat ──
  if (key === 'downed') {
    capsule(ctx, -26, -16, -54, -8, 13, dark);          // far leg sprawled
    capsule(ctx, -22, -18, 26, -20, 28, body);          // torso
    capsule(ctx, -24, -14, -48, -22, 12, body);         // near leg bent up
    ball(ctx, 44, -24, 15, skin);
    drawFace(ctx, 44, -24, 0.2, dead, flash);
    capsule(ctx, 14, -24, 34, -6, 10, body);            // arm flopped
    ctx.restore();
    return;
  }

  // ── rotating to/from the floor ──
  if (key === 'fallheavy' || key === 'getup') {
    const t = key === 'fallheavy' ? Math.min(1, f.f / CFG.FALL_FRAMES) : 1 - Math.min(1, f.f / CFG.GETUP_FRAMES);
    ctx.rotate(t * Math.PI / 2 * 0.92);
    capsule(ctx, 0, -8, 4, -76, 30, body);
    capsule(ctx, 2, -76, 6, -132, 32, body);
    ball(ctx, 8, -150, 15, skin);
    drawFace(ctx, 8, -150, 0.4, dead, flash);
    capsule(ctx, 4, -120, 26, -86, 11, body);
    capsule(ctx, 2, -120, -18, -88, 11, dark);
    ctx.restore();
    return;
  }

  // ── ground tech: rolling tuck / spring-up (wakeup roll shares the backroll look) ──
  if (key === 'backroll' || key === 'wakeuproll') {
    ctx.translate(0, -34);
    ctx.rotate(-f.facing * f.f * 0.34);                 // tumble in the roll direction
    capsule(ctx, -16, 14, -34, 28, 13, dark);           // tucked rear leg
    capsule(ctx, -18, -8, -34, 6, 11, dark);            // tucked rear arm
    capsule(ctx, -12, 8, 14, -6, 28, body);             // curled torso
    capsule(ctx, 12, 12, 28, 24, 13, body);             // tucked front leg
    ball(ctx, 26, -14, 15, skin);                        // head tucked in
    drawFace(ctx, 26, -14, 0.6, dead, flash);
    capsule(ctx, 8, -12, 24, 2, 11, body);              // tucked front arm
    ctx.restore();
    return;
  }
  if (key === 'kipup') {
    const t = 1 - Math.min(1, f.f / CFG.KIPUP_FRAMES);  // 1 = still down, 0 = upright
    ctx.rotate(t * Math.PI / 2 * 0.8);
    capsule(ctx, 0, -6, 6, -70, 30, body);              // legs kicking under
    capsule(ctx, 4, -70, 8, -128, 32, body);            // torso springing up
    ball(ctx, 12, -146, 15, skin);
    drawFace(ctx, 12, -146, 1, dead, flash);            // fierce — fighting back up
    capsule(ctx, 6, -110, 30, -76, 11, body);           // arms thrown for the spring
    capsule(ctx, 4, -110, -16, -78, 11, dark);
    ctx.restore();
    return;
  }

  // ── THE FLATLINER victim: fold straight down into a heap ──
  // Frozen upright through the freeze beat, then the knees buckle, the torso pitches
  // forward and the head drops as the body collapses to the floor. Driven off f.f (the
  // cine sequencer drives vic.f); leaves the standing skeleton like fallheavy/getup do.
  if (key === 'crumpled') {
    const t = Math.min(1, Math.max(0, (f.f - CFG.FLATLINER_FREEZE) / CFG.FLATLINER_CRUMPLE));   // 0 frozen → 1 collapsed
    ctx.rotate(t * Math.PI / 2 * 0.95);                  // tip toward the floor
    const sag = 1 - t * 0.5;                             // legs buckle under
    capsule(ctx, 0, -8, 4, -76 * sag, 30, body);         // buckling legs
    capsule(ctx, 2, -76 * sag, 6, -132 * sag, 32, body); // torso pitching down
    ball(ctx, 8, -150 * sag, 15, skin);                  // head drops with it
    drawFace(ctx, 8, -150 * sag, -1, dead, flash);       // hurt face (KO'd)
    capsule(ctx, 4, -120 * sag, 26, -86 * sag, 11, body);  // arm flops forward
    capsule(ctx, 2, -120 * sag, -18, -88 * sag, 11, dark); // far arm flops
    ctx.restore();
    return;
  }

  // ── standing family: build a skeleton pose, then draw it ──
  // defaults: relaxed fighting stance
  const P = {
    hip: { x: 0, y: -76 },
    sho: { x: 4, y: -138 },
    head: { x: 8, y: -156 },
    handF: { x: 34, y: -112 }, handR: { x: 20, y: -126 },
    footF: { x: 22, y: 0 }, footR: { x: -18, y: 0 },
    armBendF: 1, armBendR: 1, legBendF: -1, legBendR: -1,
    faceMood: 0,   // -1 hurt · 0 neutral · 1 fierce
    trail: null,   // {from, to, isLeg} swing ghosts
  };
  const bob = Math.sin(f.animClock * 0.09) * 2;   // animClock (not f.f) → breathing stays continuous across idle/walk/state changes
  P.sho.y += bob; P.head.y += bob; P.handF.y += bob; P.handR.y += bob;

  const ext = attackExt(f);
  const mv = f.move;
  const target = mv && !Array.isArray(mv.hitbox) ? { x: (mv.hitbox.x + mv.hitbox.w * 0.72) * ext, y: (mv.hitbox.y + mv.hitbox.h / 2) + (1 - ext) * 18 } : null;
  // every striking move now carries `kind` (moves.js) — derive the swing pose
  // straight off the live move; no live move ⇒ neither (relaxed stance).
  const isPunch = !!mv && mv.kind === 'punch';
  const isKick = !!mv && mv.kind === 'kick';

  switch (key) {
    case 'walk': {
      const s = Math.sin(f.animClock * 0.28);
      // stride amplitude (17) ≈ WALK_SPEED/0.28, so peak foot speed ~matches body travel → far less ice-skating
      P.footF.x = 22 + s * 17; P.footR.x = -18 - s * 17;
      P.footF.y = -Math.max(0, s) * 7; P.footR.y = -Math.max(0, -s) * 7;
      break;
    }
    case 'run': {
      const s = Math.sin(f.animClock * 0.42);
      lean(P, 0.28);
      P.footF.x = 26 + s * 24; P.footR.x = -22 - s * 24;
      P.footF.y = -Math.max(0, s) * 14; P.footR.y = -Math.max(0, -s) * 14;
      P.handF = { x: 30 + s * 10, y: -118 }; P.handR = { x: 14 - s * 10, y: -118 };
      P.faceMood = 1;
      break;
    }
    case 'backdash': lean(P, -0.2); P.footF.x = 30; P.footR.x = -28; break;
    case 'crouch': case 'crouchjab': case 'sweep': {
      crouchPose(P);
      if (target) strikeTo(P, target, key === 'crouchjab' ? 'punch' : 'kick');
      P.faceMood = 1;
      break;
    }
    case 'livershot': {
      crouchPose(P);
      lean(P, 0.22);                              // deep forward lean — a tight, low liver hook
      if (target) strikeTo(P, target, 'punch');   // lead hand digs into the body
      P.faceMood = 1;
      break;
    }
    case 'calfkick': {
      lean(P, 0.22);                              // STANDING low chop — drive weight into it
      if (target) strikeTo(P, target, 'kick');    // lead leg scythes low across the shin
      else strikeTo(P, { x: 60, y: -30 }, 'kick');
      P.handF = { x: -14, y: -118 }; P.handR = { x: 16, y: -130 };   // arms counterbalance the low swing
      P.faceMood = 1;
      break;
    }
    case 'prejump': case 'land': squash(P, 0.85); break;
    case 'air': {
      P.footF = { x: 10, y: -34 }; P.footR = { x: -10, y: -28 };
      P.legBendF = -1; P.legBendR = -1;   // knees bow FORWARD with the feet tucked (was +1 = backward/bird-knee)
      break;
    }
    case 'blockstun': {
      lean(P, -0.08);
      guardUp(P);
      P.faceMood = -1;
      break;
    }
    case 'hitstun': {
      lean(P, -0.26);
      P.handF = { x: -26, y: -120 }; P.handR = { x: -10, y: -96 };
      P.armBendF = -1; P.armBendR = -1;
      P.footF.x = 30;
      P.faceMood = -1;
      break;
    }
    case 'parried': {
      lean(P, 0.34);
      const w = Math.sin(f.f * 0.55) * 5;
      P.sho.x += w; P.head.x += w + 6; P.head.y += 8;
      P.handF = { x: 44, y: -64 }; P.handR = { x: 30, y: -58 };
      P.faceMood = -1;
      break;
    }
    case 'gassed': {
      slump(P, f.f);
      P.faceMood = -1;
      break;
    }
    case 'crumple': {
      const t = Math.min(1, f.f / Math.max(1, f.stunFrames || 1));
      if (f.crumpleKind === 'kneel') {       // buckle — drop to one knee
        crouchPose(P); P.hip.y = -40; P.footR = { x: -18, y: 0 }; P.legBendR = -1;
        P.head.y += 16; P.faceMood = -1;
      } else {                                // doubled-over stand-stun (body shot)
        lean(P, 0.3); P.hip.y = -76 + 14 * t;
        P.head.y += 16; P.head.x += 6;
        P.handF = { x: 20, y: -90 }; P.handR = { x: 10, y: -84 };
        P.armBendF = -1; P.armBendR = -1; P.faceMood = -1;
      }
      break;
    }
    case 'superstart': {
      if (f.superKind === 'beam') {
        if (f.f >= CFG.BEAM_CHARGE) {              // FIRING: thrust both palms forward, the beam pours out
          lean(P, 0.32);
          P.handF = { x: 56, y: -130 }; P.handR = { x: 46, y: -120 };
          P.armBendF = 1; P.armBendR = 1;
          P.head.x += 4;
        } else {                                   // CHARGING: cup both hands back at the hip
          lean(P, -0.2);
          P.handF = { x: -22, y: -108 }; P.handR = { x: -32, y: -122 };
          P.armBendF = -1; P.armBendR = -1;
          P.head.x -= 4;
        }
        P.footF.x = 28; P.footR.x = -26;
        P.faceMood = 1;
      } else {
        lean(P, 0.12); guardUp(P); P.faceMood = 1;
      }
      break;
    }
    case 'throwgrab': {
      lean(P, 0.3);
      P.handF = { x: 56, y: -108 }; P.handR = { x: 52, y: -124 };
      P.faceMood = 1;
      break;
    }
    case 'throwanim': {
      lean(P, -0.18);
      P.handF = { x: -14, y: -178 }; P.handR = { x: 2, y: -184 };
      P.armBendF = -1; P.armBendR = -1;
      P.faceMood = 1;
      break;
    }
    case 'clinchgrab': {
      lean(P, 0.34);
      P.handF = { x: 58, y: -120 }; P.handR = { x: 50, y: -108 };
      P.armBendF = 1; P.armBendR = 1;
      P.footF.x = 30;
      P.faceMood = 1;
      break;
    }
    case 'clinch': {
      lean(P, 0.22);
      P.handF = { x: 46, y: -128 }; P.handR = { x: 42, y: -116 };
      P.armBendF = 1; P.armBendR = 1;
      P.head.x += 6; P.head.y += 4;
      P.footF.x = 26; P.footR.x = -20;
      P.faceMood = 1;
      break;
    }
    case 'clinched': {
      lean(P, 0.12);
      const j = Math.sin(f.f * 0.6) * 3;
      P.head.x += 4 + j; P.head.y += 8;
      P.handF = { x: 26, y: -96 }; P.handR = { x: 14, y: -88 };
      P.armBendF = -1; P.armBendR = -1;
      P.footF.x = 24;
      P.faceMood = -1;
      break;
    }
    case 'clinchpunch': {
      lean(P, 0.2);
      if (target) { P.handF = { x: target.x, y: target.y }; }
      P.handR = { x: 40, y: -118 };   // rear hand still gripping
      P.armBendR = 1;
      P.faceMood = 1;
      P.trail = target ? { to: target, isLeg: false } : null;
      break;
    }
    case 'clinchknee': {
      lean(P, 0.18);
      if (target) { P.footF = { x: target.x, y: target.y }; P.legBendF = 1; }
      P.handF = { x: 40, y: -150 }; P.handR = { x: 30, y: -142 };   // pulling the head down
      P.armBendF = -1; P.armBendR = -1;
      P.faceMood = 1;
      P.trail = target ? { to: target, isLeg: true } : null;
      break;
    }
    case 'execute': {
      lean(P, 0.2);
      const alt = f.f % 12 < 6;
      P.handF = alt ? { x: 62, y: -116 } : { x: 26, y: -104 };
      P.handR = alt ? { x: 22, y: -120 } : { x: 58, y: -102 };
      P.faceMood = 1;
      break;
    }
    case 'executed': {
      lean(P, -0.3);
      P.handF = { x: -22, y: -86 }; P.handR = { x: -12, y: -110 };
      P.armBendF = -1; P.armBendR = -1;
      P.faceMood = -1;
      break;
    }
    // SUPLEX thrower: arching BACKWARD into the bridge — hips thrust, shoulders drop
    // back, both hands locked overhead gripping the victim's waist as they go over the
    // top. Arch hardest at the apex (sin), recover into the spike.
    case 'suplexthrow': {
      const a = Math.min(1, f.f / CFG.SUPLEX_FRAMES);
      lean(P, -0.1 - 0.4 * Math.sin(a * Math.PI));   // arch back hardest at the apex
      P.hip.y += 6 * Math.sin(a * Math.PI);          // hip thrust through the bridge
      P.handF = { x: -8 - 18 * a, y: -188 - 14 * Math.sin(a * Math.PI) };   // gripping overhead/back
      P.handR = { x: 6 - 16 * a, y: -196 - 14 * Math.sin(a * Math.PI) };
      P.armBendF = -1; P.armBendR = -1;
      P.head.y += 10 * Math.sin(a * Math.PI);        // head tips back with the arch
      P.footF.x = 26; P.footR.x = -22;               // wide base for the bridge
      P.faceMood = 1;
      break;
    }
    // ATTACKER — mounted, raining hammerfists down onto the floored body in front,
    // body pitched forward over them, knees planted wide. Fists piston down/cock back.
    case 'gpmount': {
      lean(P, 0.34);                                   // hunched forward over the body
      P.hip.y = -54; P.sho.y += 26; P.head.y += 30; P.head.x += 8;   // dropped low, mounting
      const alt = f.f % 8 < 4;                          // fists piston down, rapid hammerfists
      const down = { x: 40, y: -44 };                   // low & out front — onto the downed torso
      P.handF = alt ? down : { x: 24, y: -96 };         // lead fist hammers / cocks back
      P.handR = alt ? { x: 28, y: -92 } : down;         // rear fist hammers / cocks back
      P.armBendF = 1; P.armBendR = 1;
      P.footF = { x: 30, y: 0 }; P.footR = { x: -22, y: 0 };   // knees planted wide
      P.faceMood = 1;
      P.trail = (f.f > CFG.GP_MOUNT) ? { to: down, isLeg: false } : null;   // swing ghost on the hammers
      break;
    }
    // VICTIM — pinned flat under the mount, taking it. Laid out flat with arms thrown
    // up defensively and a hurt face (its own case, NOT the early-return 'downed' block,
    // so it lives in the standing-family path the sequencer animates).
    case 'gpmounted': {
      P.hip.y = -30; P.sho = { x: -8, y: -40 }; P.head = { x: -28, y: -44 };   // flat on the floor
      const flinch = Math.sin(f.f * 0.6) * 3;
      P.head.x += flinch;
      P.handF = { x: -34, y: -58 }; P.handR = { x: -20, y: -64 };   // arms up, covering
      P.armBendF = -1; P.armBendR = -1;
      P.footF = { x: 30, y: -18 }; P.footR = { x: 52, y: -10 };      // legs sprawled out
      P.legBendF = -1; P.legBendR = -1;
      P.faceMood = -1;
      break;
    }
    // (Flatliner victim 'crumpled' is handled by an EARLY-RETURN fold block above the
    //  standing-family skeleton — it folds straight to the floor, leaving this stance.)
    case 'slipcounter': {
      if (f.f <= CFG.COUNTER_SLIP) {
        // the slip: weave back and off the centerline, coiling
        lean(P, -0.22);
        const w = Math.sin(f.f * 0.5) * 6;
        P.head.x -= 10; P.head.y += 6; P.sho.x += w;
        P.handF = { x: 18, y: -120 }; P.handR = { x: 8, y: -108 };
        P.armBendF = -1;
      } else {
        // the blow: hard strike, weapon by the caught move's kind
        lean(P, 0.3);
        const kick = f.counterKind === 'kick';
        strikeTo(P, kick ? { x: 74, y: -96 } : { x: 70, y: -150 }, kick ? 'kick' : 'punch');
      }
      P.faceMood = 1;
      break;
    }
    case 'countered': {
      // caught cold — head snaps back, arms fly open
      lean(P, -0.4);
      P.handF = { x: -28, y: -96 }; P.handR = { x: -16, y: -120 };
      P.armBendF = -1; P.armBendR = -1;
      P.head.x -= 8; P.head.y += 4;
      P.footF.x = 32;
      P.faceMood = -1;
      break;
    }
    case 'airpunch': {
      lean(P, 0.18);
      P.footF = { x: 10, y: -34 }; P.footR = { x: -10, y: -28 };   // legs tucked, airborne
      P.legBendF = -1; P.legBendR = -1;   // knees bow forward (was backward)
      if (target) strikeTo(P, target, 'punch');
      P.faceMood = 1;
      break;
    }
    case 'divekick': {
      lean(P, 0.42);                                                // pitched forward into the dive
      P.footR = { x: -6, y: -30 }; P.legBendR = -1;                 // trailing leg tucked (knee forward)
      if (target) strikeTo(P, target, 'kick');                     // lead leg spears down-forward
      P.handF = { x: 24, y: -120 }; P.handR = { x: 4, y: -132 };
      P.faceMood = 1;
      break;
    }
    case 'elbowdrop': {
      lean(P, 0.4);                                                // pitched forward into the dive
      P.footF = { x: 12, y: -34 }; P.footR = { x: -8, y: -28 };     // legs tucked, airborne
      P.legBendF = -1; P.legBendR = -1;                            // knees bow forward
      if (target) {                                                // rear elbow drives the point down-forward
        P.handR = { x: target.x, y: target.y };
        P.armBendR = 1;                                            // elbow bent INTO the strike — a point, not a straight
        P.handF = { x: 18, y: -118 };                             // lead hand braces across
        P.trail = { to: target, isLeg: false };
      }
      P.faceMood = 1;
      break;
    }
    case 'jumpkick': case 'flyknee': {
      lean(P, key === 'flyknee' ? 0.35 : 0.2);
      P.footR = { x: -8, y: -36 }; P.legBendR = -1;         // trailing leg tucked (knee forward)
      if (target) strikeTo(P, target, 'kick');
      P.handF = { x: 26, y: -120 }; P.handR = { x: 6, y: -130 };
      P.faceMood = 1;
      break;
    }
    case 'superman': {
      lean(P, 0.5);                                              // SUPERMAN: body fully pitched forward, flying
      P.footF = { x: -10, y: -30 }; P.footR = { x: -30, y: -22 };// both legs trailing behind, airborne dive
      P.legBendF = -1; P.legBendR = -1;
      const o = target ? { x: target.x, y: target.y } : { x: 60, y: -96 };
      P.handR = o; P.armBendR = 1;                               // rear fist drives the overhand down-forward
      P.handF = { x: 24, y: -118 };                              // lead arm thrown back for the dive line
      P.head.x += 8;                                             // head leads the dive
      P.trail = target ? { to: o, isLeg: false } : null;         // overhand swing ghost
      P.faceMood = 1;
      break;
    }
    case 'flyuppercut': {
      lean(P, -0.1);
      P.footF = { x: 10, y: -26 }; P.footR = { x: -12, y: -18 };
      P.legBendF = -1; P.legBendR = -1;   // knees bow forward (was backward)
      if (target) strikeTo(P, target, 'punch');
      P.faceMood = 1;
      break;
    }
    case 'axekick': {
      lean(P, 0.26);
      // CRESCENT axe kick: the leg swings UP and OVER on the wind-up, then the
      // heel arcs DOWN and FORWARD, chopping well out in front. Two beats:
      //   startup  = raise the leg up the front into the cocked-overhead position
      //   active+  = sweep it down-and-forward, heel landing low out front
      const su = mv ? mv.startup : 14, ac = mv ? mv.active : 8, rec = mv ? mv.recovery : 16;
      let fx, fy;
      if (mv && f.f <= su) {                 // RAISE: draw the foot up & over the top
        const u = f.f / su;                  // 0 → 1
        fx = -10 + 32 * u;                   // sweeps up the front (-10 → 22)
        fy = -36 - 188 * u;                  // rises overhead (-36 → -224)
        P.legBendF = 1;                      // knee cocked on the lift
      } else if (mv && f.f <= su + ac) {     // CHOP: arc DOWN and FORWARD, heel out front
        const c = (f.f - su) / ac;           // 0 → 1
        fx = 22 + 48 * c;                    // reaches well forward (22 → 70)
        fy = -224 + 196 * c;                 // chops down near the floor (-224 → -28)
        P.legBendF = -1;                     // leg snaps straight through the chop
      } else {                               // RECOVER: pull the leg back under into stance (no frozen hang)
        const r = mv ? Math.min(1, (f.f - su - ac) / Math.max(1, rec)) : 1;   // 0 → 1
        fx = 70 + (18 - 70) * r;             // slide the foot back under (70 → 18)
        fy = -28 + (0 - (-28)) * r;          // and settle it to the floor (-28 → 0)
        P.legBendF = -1 + 1.6 * r;           // straighten → re-bend into the planted stance
      }
      strikeTo(P, { x: fx, y: fy }, 'kick');
      P.handF = { x: -12, y: -152 }; P.handR = { x: 14, y: -134 };   // arms thrown up & over for the swing
      P.faceMood = 1;
      break;
    }
    case 'tornado': {
      // a HIGH spinning heel hook: the lead leg whips out front to head height
      // while the body counter-rotates (the scale-flip above spins the 360).
      lean(P, 0.3);                                   // torque into the spin
      const su = mv ? mv.startup : 11, ac = mv ? mv.active : 5;
      const c = mv ? Math.max(0, Math.min(1, (f.f - su) / ac)) : 1;   // 0 wind → 1 extended
      const fx = 26 + 60 * c;                         // sweeps forward (26 → 86)
      const fy = -150 - 26 * c;                       // rises to head height (-150 → -176)
      strikeTo(P, { x: fx, y: fy }, 'kick');          // sets footF + leg trail
      P.legBendF = 1;                                 // knee cocked high for the hook
      P.handF = { x: -14, y: -150 }; P.handR = { x: 18, y: -134 };   // arms flung out for the whip
      P.faceMood = 1;
      break;
    }
    case 'dashpunch': case 'dashkick': {
      lean(P, 0.42);   // committed — leaning hard into the lunge
      if (target) strikeTo(P, target, key === 'dashpunch' ? 'punch' : 'kick');
      P.faceMood = 1;
      break;
    }
    case 'wallsplat': {
      // crushed flat against the wall: arms splayed, head snapped back, sliding
      lean(P, -0.34);
      P.sho.y += 10; P.head.x -= 4; P.head.y += 14;
      P.handF = { x: -30, y: -150 }; P.handR = { x: -34, y: -120 };
      P.armBendF = -1; P.armBendR = -1;
      P.footF.x = 24; P.footR.x = -22;
      P.faceMood = -1;
      break;
    }
    case 'slip': {
      // deep weave under the whiffed high — the read before the counter lands
      crouchPose(P);
      lean(P, 0.22);
      P.head.x += 10; P.head.y += 10;
      P.faceMood = 1;
      break;
    }
    case 'machinegun': {
      lean(P, 0.18);
      const alt = f.f % 2 < 1;                    // hands piston in and out, rapid-fire (2x = twice as fast)
      P.handF = alt ? { x: 60, y: -128 } : { x: 22, y: -118 };
      P.handR = alt ? { x: 20, y: -116 } : { x: 58, y: -130 };
      P.faceMood = 1;
      break;
    }
    case 'electrified': {
      // seizing from the shock — stiff, arms jolting open, head snapping with a high-freq jitter
      const j = Math.sin(f.f * 1.7) * 4 + (Math.random() - 0.5) * 5;
      lean(P, -0.12);
      P.sho.x += j * 0.5; P.head.x += j; P.head.y += 4;
      P.handF = { x: -24 + j, y: -150 }; P.handR = { x: 22 - j, y: -150 };
      P.armBendF = -1; P.armBendR = -1;
      P.footF.x = 26; P.footR.x = -24;
      P.faceMood = -1;
      break;
    }
    case 'overhand': {
      lean(P, 0.42);                               // commit hard into the haymaker
      // rear fist cocked HIGH & back → loops OVER THE TOP → drops down onto their head.
      // y dips up over the peak (the -40·sin bump) then lands high (~head height), so it
      // reads as an overhand right, not a straight body shot.
      const e = ext;
      const o = { x: -14 + 80 * e, y: (-198 + 50 * e) - 40 * Math.sin(e * Math.PI) };
      P.handR = o; P.armBendR = 1;                 // rear elbow up & over
      P.handF = { x: 18, y: -120 };                // lead hand guards
      P.head.x += 6 * e;                           // head follows the punch over
      P.trail = { to: o, isLeg: false };
      P.faceMood = 1;
      break;
    }
    case 'spinelbow': {
      // the Buzzsaw: rear ELBOW leads — fist tucked high & in, the joint is the
      // weapon. Shoulder whips across with the spin (the scale-flip above does the 360).
      lean(P, 0.3);
      const e = ext;
      P.handR = { x: 8 + 30 * e, y: -150 }; P.armBendR = -1;   // folded arm — elbow points OUT front
      P.handF = { x: 22 - 10 * e, y: -120 };                   // lead hand cross-guards the turn
      P.sho.x += 14 * e; P.head.x += 8 * e;                    // shoulder + head whip across
      P.footF.x = 26; P.footR.x = -22;                         // wide base for the pivot
      P.trail = { to: { x: 70 * e, y: -150 }, isLeg: false };  // swing ghost off the shoulder
      P.faceMood = 1;
      break;
    }
    case 'slidetackle': {
      crouchPose(P);                              // body dropped to the floor
      P.sho.y += 30; P.head.y += 34; P.head.x += 8;
      P.footF = { x: 78, y: -10 }; P.legBendF = -1;   // lead leg scythes out front along the ground
      P.footR = { x: -16, y: -2 }; P.legBendR = -1;
      P.handF = { x: 12, y: -64 }; P.handR = { x: -20, y: -52 };
      P.faceMood = 1;
      break;
    }
    case 'gazelle': {
      lean(P, 0.34);                                   // committed, leaping in
      P.footR = { x: -10, y: -30 }; P.legBendR = -1;   // trailing leg tucked up (gazelle-step)
      P.footF = { x: 18, y: -16 }; P.legBendF = -1;    // lead leg lifted off the floor
      if (target) strikeTo(P, target, 'punch');        // lead-hand hook (NOT in REAR_HAND_PUNCH → stays lead hand)
      P.handR = { x: 12, y: -132 };                    // rear hand guards high
      P.faceMood = 1;
      break;
    }
    default: {
      if ((isPunch || isKick) && target) {
        lean(P, 0.16);
        strikeTo(P, target, isPunch ? 'punch' : 'kick', isPunch && REAR_HAND_PUNCH.has(key));
        P.faceMood = 1;
      }
    }
  }

  // guard arms while holding back in neutral (pre-block readability)
  if (!mv && f.backHeldFrames > 0 && ['idle', 'walk', 'crouch'].includes(f.state)) guardUp(P);

  drawSkeleton(ctx, P, { body, dark, glove, boot, skin, dead, flash, key, mvActive: mv && f.f > mv.startup && f.f <= mv.startup + Math.min(mv.active, 9) });

  // ── elemental / motion overlays (drawn over the body, in local space) ──
  if (key === 'overhand') drawElectricArcs(ctx, P.handR.x, P.handR.y, 22, 4);   // the charged fist crackles blue
  if (key === 'electrified') {                                                  // the seizing body wreathed in lightning
    drawElectricArcs(ctx, 0, -CFG.BODY_H * 0.5, 44, 4);
    drawElectricArcs(ctx, 0, -CFG.BODY_H * 0.8, 30, 3);
  }
  if (key === 'machinegun') { drawActionLines(ctx, P.handF.x, P.handF.y, 1); drawActionLines(ctx, P.handR.x, P.handR.y, 1); }

  ctx.restore();
}

// pose helpers — mutate the skeleton
function lean(P, a) {
  P.sho.x += a * 60; P.head.x += a * 78;
  P.handF.x += a * 50; P.handR.x += a * 50;
}
function squash(P, k) {
  for (const part of [P.hip, P.sho, P.head, P.handF, P.handR]) part.y *= k;
}
function crouchPose(P) {
  P.hip.y = -52; P.sho = { x: 8, y: -102 }; P.head = { x: 14, y: -120 };
  P.handF = { x: 34, y: -86 }; P.handR = { x: 22, y: -98 };
  P.footF.x = 30; P.footR.x = -26;
}
function slump(P, f) {
  const w = Math.sin(f * 0.3) * 3;
  P.sho = { x: 14 + w, y: -124 }; P.head = { x: 26 + w, y: -134 };
  P.handF = { x: 20, y: -52 }; P.handR = { x: 6, y: -50 };
  P.armBendF = -1; P.armBendR = -1;
}
function guardUp(P) {
  P.handF = { x: 26, y: -132 }; P.handR = { x: 30, y: -114 };
}
function strikeTo(P, target, kind, rear) {
  if (kind === 'punch') {
    if (rear) {                                  // rear-hand straight (cross / uppercut / overhand)
      P.handR = { x: target.x, y: target.y };
      P.handF = { x: 20, y: -120 };              // lead hand guards
    } else {                                     // lead-hand straight (jab / hook)
      P.handF = { x: target.x, y: target.y };
      P.handR = { x: 14, y: -124 };
    }
  } else {
    P.footF = { x: target.x, y: target.y };
    // NOTE: legBendF is NOT set here on purpose. It defaults to -1 (knee bends FORWARD,
    // anatomically correct) and cocked kicks (axekick/tornado/clinchknee) author it
    // explicitly. The old `target.y < -70 ? 1 : -1` flipped the knee side mid-kick as the
    // animating foot crossed the threshold (bird-knee snap) and clobbered axekick's phases.
    P.handF = { x: -18, y: -118 };          // arms counterbalance
    P.armBendF = -1;
    P.handR = { x: 22, y: -126 };
  }
  P.trail = { to: target, isLeg: kind === 'kick' };
}

function drawFace(ctx, hx, hy, mood, dead, flash) {
  if (dead) {
    ctx.strokeStyle = '#16161c'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx + 3, hy - 5); ctx.lineTo(hx + 11, hy + 2);
    ctx.moveTo(hx + 11, hy - 5); ctx.lineTo(hx + 3, hy + 2);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(hx + 7, hy - 2, 4.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#16161c';
  ctx.beginPath(); ctx.arc(hx + 8.6, hy - 2, 2.2, 0, Math.PI * 2); ctx.fill();
  // brow: angle by mood
  ctx.strokeStyle = '#16161c'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood > 0) { ctx.moveTo(hx + 2, hy - 9); ctx.lineTo(hx + 12, hy - 6); }
  else if (mood < 0) { ctx.moveTo(hx + 2, hy - 6); ctx.lineTo(hx + 12, hy - 9); }
  else { ctx.moveTo(hx + 3, hy - 8); ctx.lineTo(hx + 12, hy - 8); }
  ctx.stroke();
}

function drawSkeleton(ctx, P, c) {
  const ARM = 36, LEG = 44;

  // swing trail ghosts behind the live strike
  if (P.trail && c.mvActive) {
    ctx.save();
    ctx.globalAlpha *= 0.22;
    for (const k of [0.55, 0.78]) {
      const gx = P.trail.isLeg ? P.hip.x : P.sho.x;
      const gy = P.trail.isLeg ? P.hip.y : P.sho.y;
      limbIK(ctx, gx, gy, gx + (P.trail.to.x - gx) * k, gy + (P.trail.to.y - gy) * k,
        P.trail.isLeg ? LEG : ARM, P.trail.isLeg ? P.legBendF : P.armBendF,
        P.trail.isLeg ? 13 : 11, c.body, 0);
    }
    ctx.restore();
  }

  // rear limbs (darker — depth)
  limbIK(ctx, P.sho.x - 6, P.sho.y + 4, P.handR.x, P.handR.y, ARM, P.armBendR, 10.5, c.dark, 8, c.flash ? '#fff' : shade('#f2f2f5', 0.8));
  limbIK(ctx, P.hip.x - 4, P.hip.y + 4, P.footR.x, P.footR.y, LEG, P.legBendR, 12.5, c.dark, 8.5, shade(c.boot, 0.85));
  // torso: pelvis → chest, trunks band
  capsule(ctx, P.hip.x, P.hip.y, P.sho.x, P.sho.y, 32, c.body);
  ball(ctx, P.hip.x, P.hip.y + 2, 15, c.dark);   // trunks
  // front leg
  limbIK(ctx, P.hip.x + 4, P.hip.y + 2, P.footF.x, P.footF.y, LEG, P.legBendF, 13, c.body, 9, c.boot);
  // head + face
  ball(ctx, P.head.x, P.head.y, 15, c.skin);
  drawFace(ctx, P.head.x, P.head.y, P.faceMood, c.dead, c.flash);
  // front arm + glove
  limbIK(ctx, P.sho.x + 5, P.sho.y + 2, P.handF.x, P.handF.y, ARM, P.armBendF, 11, c.body, 8.5, c.glove);
}

// ── the absurd ceiling: a mech materializes behind its pilot ──
function drawMech(ctx, f, alpha) {
  const d = f.facing;
  const bx = f.x - d * 110;
  const by = CFG.FLOOR_Y;
  ctx.save();
  ctx.globalAlpha = alpha !== undefined ? alpha : Math.min(1, f.f / 8);
  ctx.fillStyle = '#2e3440';
  rr(ctx, bx - 64, by - 120, 38, 120, 8);
  rr(ctx, bx + 26, by - 120, 38, 120, 8);
  rr(ctx, bx - 80, by - 330, 160, 220, 18);
  rr(ctx, bx - 34, by - 384, 68, 56, 12);
  ctx.fillStyle = '#ff5252';
  rr(ctx, bx + (d === 1 ? 4 : -26), by - 366, 22, 8, 3);
  ctx.fillStyle = '#3b4252';
  const cy = CFG.FLOOR_Y - 130;
  rr(ctx, d === 1 ? bx + 40 : bx - 40 - 230, cy - 6, 230, 52, 10);
  ctx.fillStyle = '#222730';
  rr(ctx, d === 1 ? bx + 240 : bx - 240 - 34, cy + 2, 34, 36, 6);
  if (f.f >= CFG.SUPER_STARTUP - 1 && f.f <= CFG.SUPER_STARTUP + 4) {
    ctx.fillStyle = '#fff59d';
    ctx.beginPath();
    ctx.arc(bx + d * 285, cy + 22, 34 - (f.f - CFG.SUPER_STARTUP) * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawProjectile(ctx, p) {
  const d = Math.sign(p.vx);
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = 0.12 * (4 - i);
    ctx.fillStyle = '#ffb74d';
    rr(ctx, p.x - p.w / 2 - d * i * 26, p.y + 6, p.w, p.h - 12, p.h / 2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffd54f';
  rr(ctx, p.x - p.w / 2, p.y, p.w, p.h, p.h / 2);
  ctx.fillStyle = '#ffffff';
  rr(ctx, p.x - p.w / 2 + (d === 1 ? p.w * 0.45 : p.w * 0.1), p.y + 12, p.w * 0.45, p.h - 24, (p.h - 24) / 2);
}

// ── OVERDRIVE BEAM visuals ──
function radialGlow(ctx, x, y, r, color) {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function beamRect(ctx, x0, x1, cy, h, color) {
  if (h <= 0) return;
  ctx.fillStyle = color;
  const x = Math.min(x0, x1), w = Math.abs(x1 - x0);
  rr(ctx, x, cy - h / 2, w, h, h / 2);
}

// The charging ball (during BEAM_CHARGE) and the giant pouring beam (during BEAM_ACTIVE).
// Drawn additively for glow, on top of everything. `ff` lets the freeze pass animate it.
function drawBeam(ctx, f, ff) {
  const t = (ff == null) ? f.f : ff;
  const dir = f.facing;
  const cy = CFG.FLOOR_Y - 130;
  const ox = f.x + dir * 56;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (t < CFG.BEAM_CHARGE) {
    // the forming ball — grows + crackles as it charges
    const g = Math.min(1, t / Math.max(1, CFG.BEAM_CHARGE));
    const r = 8 + g * 46 + Math.sin(t * 0.8) * 3;
    radialGlow(ctx, ox, cy, r * 3, 'rgba(110,215,255,0.45)');
    ball(ctx, ox, cy, r, '#bdefff');
    ball(ctx, ox, cy, r * 0.55, '#ffffff');
    for (let i = 0; i < 6; i++) {                  // sparks spiralling INTO the ball
      const a = t * 0.3 + i * (Math.PI * 2 / 6);
      const rr2 = r * 2.4;
      ctx.globalAlpha = 0.5;
      ball(ctx, ox + Math.cos(a) * rr2, cy + Math.sin(a) * rr2 * 0.7, 2.5, '#e8fbff');
    }
    ctx.globalAlpha = 1;
  } else {
    const k = t - CFG.BEAM_CHARGE;
    const grow = Math.min(1, k / 6);               // snaps out over ~6 frames
    const fade = Math.min(1, (CFG.BEAM_ACTIVE - k) / 8);
    const env = Math.max(0, Math.min(grow, fade));
    if (env <= 0) { ctx.restore(); return; }
    const len = CFG.BEAM_LEN;
    const h = CFG.BEAM_H * env;
    const x0 = ox, x1 = ox + dir * len;
    const wob = Math.sin(k * 0.9) * 6 + Math.sin(k * 2.3) * 3;
    // layered beam: wide soft glow → cyan body → bright inner → white core
    beamRect(ctx, x0, x1, cy, h * 1.55 + wob, 'rgba(70,190,255,0.22)');
    beamRect(ctx, x0, x1, cy, h * 1.0, 'rgba(120,225,255,0.55)');
    beamRect(ctx, x0, x1, cy, h * 0.52, 'rgba(220,250,255,0.85)');
    beamRect(ctx, x0, x1, cy, h * 0.2 + Math.sin(k * 1.6) * 2, '#ffffff');   // pulsing white core
    // muzzle burst at the origin
    radialGlow(ctx, x0, cy, h * 1.6, 'rgba(190,242,255,0.8)');
    ball(ctx, x0, cy, h * 0.5, '#ffffff');
    // energy streaking down the length
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 10; i++) {
      const px = x0 + dir * ((k * 26 + i * len / 10) % len);
      ball(ctx, px, cy + Math.sin(i * 1.7 + k * 0.5) * h * 0.3, 3 + Math.random() * 3, '#eafcff');
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawStage(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, CFG.STAGE_H);
  g.addColorStop(0, '#1b1b26');
  g.addColorStop(0.8, '#13131b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
  // spotlight over the pocket
  const spot = ctx.createRadialGradient(CFG.STAGE_W / 2, CFG.FLOOR_Y - 120, 80, CFG.STAGE_W / 2, CFG.FLOOR_Y - 120, 640);
  spot.addColorStop(0, 'rgba(255,245,220,0.07)');
  spot.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
  // back-wall panel lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 2;
  for (let x = 80; x < CFG.STAGE_W; x += 160) {
    ctx.beginPath(); ctx.moveTo(x, 80); ctx.lineTo(x, CFG.FLOOR_Y); ctx.stroke();
  }
  // floor
  const fg = ctx.createLinearGradient(0, CFG.FLOOR_Y, 0, CFG.STAGE_H);
  fg.addColorStop(0, '#262633');
  fg.addColorStop(1, '#1a1a24');
  ctx.fillStyle = fg;
  ctx.fillRect(0, CFG.FLOOR_Y, CFG.STAGE_W, CFG.STAGE_H - CFG.FLOOR_Y);
  ctx.fillStyle = '#32323f';
  ctx.fillRect(0, CFG.FLOOR_Y, CFG.STAGE_W, 4);
  // the phone-booth walls
  ctx.fillStyle = '#34343f';
  ctx.fillRect(CFG.WALL_L - 22, 60, 22, CFG.FLOOR_Y - 60);
  ctx.fillRect(CFG.WALL_R, 60, 22, CFG.FLOOR_Y - 60);
  ctx.fillStyle = '#45454f';
  ctx.fillRect(CFG.WALL_L - 22, 60, 22, 10);
  ctx.fillRect(CFG.WALL_R, 60, 22, 10);
  // vignette
  const v = ctx.createRadialGradient(CFG.STAGE_W / 2, CFG.STAGE_H / 2, 380, CFG.STAGE_W / 2, CFG.STAGE_H / 2, 860);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
}

function drawDebugBoxes(ctx, fighters) {
  for (const f of fighters) {
    const pb = f.pushbox();
    if (pb) { ctx.strokeStyle = 'rgba(120,255,120,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(pb.x, pb.y, pb.w, pb.h); }
    const hb = f.hurtbox();
    ctx.strokeStyle = 'rgba(100,180,255,0.8)';
    ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
    const atk = f.activeHitbox();
    if (atk) { ctx.fillStyle = 'rgba(255,60,60,0.35)'; ctx.fillRect(atk.x, atk.y, atk.w, atk.h); ctx.strokeStyle = '#ff3c3c'; ctx.strokeRect(atk.x, atk.y, atk.w, atk.h); }
  }
  for (const p of Projectiles) {
    ctx.strokeStyle = '#ff3c3c';
    ctx.strokeRect(p.x - p.w / 2, p.y, p.w, p.h);
  }
}

function render(ctx, game, alpha) {
  game.renderAlpha = (alpha == null) ? 1 : alpha;   // drawFighter reads this (avoids threading it through every call)
  ctx.save();
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * game.shake * 2, (Math.random() - 0.5) * game.shake * 2);
  }
  // KO FREEZE-FRAME: the world drops to black, a white impact burst fans out, and the
  // two fighters render as stark white silhouettes — held a beat, then the launch resumes.
  if (game.koFreeze > 0) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
    const loser = game.fighters.find(f => f.hp <= 0) || game.fighters[0];
    const bx = loser.x, by = CFG.FLOOR_Y - CFG.BODY_H * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.15;
      const r1 = 55, r2 = 90 + 230 * (0.6 + 0.4 * Math.abs(Math.sin(i * 1.7)));
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(a) * r1, by + Math.sin(a) * r1);
      ctx.lineTo(bx + Math.cos(a) * r2, by + Math.sin(a) * r2);
      ctx.stroke();
    }
    for (const f of game.fighters) drawFighter(ctx, f, game);   // forced-white silhouettes (see drawFighter)
    ctx.restore();
    return;
  }

  drawStage(ctx);
  drawStains(ctx);   // blood decals on the floor/walls, under the fighters

  for (const f of game.fighters) if (f.state === 'superstart' && f.superKind !== 'beam') drawMech(ctx, f);
  for (const p of Projectiles) drawProjectile(ctx, p);

  // attacker draws on top
  const [a, b] = game.fighters;
  const order = a.move && !b.move ? [b, a] : [a, b];
  for (const f of order) drawFighter(ctx, f, game);

  // OVERDRIVE BEAM pours out OVER the fighters for maximum drama (the freeze overlay owns the charge visual)
  for (const f of game.fighters) if (game.superFreeze <= 0 && f.state === 'superstart' && f.superKind === 'beam') drawBeam(ctx, f);

  for (const p of Particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const t of FloatTexts) {
    ctx.globalAlpha = Math.min(1, t.life / 20);
    ctx.fillStyle = t.color;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  // execution cinematic: lights down, just the two of them
  if (game.execution) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
    drawFighter(ctx, game.execution.vic, game);
    drawFighter(ctx, game.execution.att, game);
    const t = game.execution.f;
    if (t > EXEC_GRAB + EXEC_FLURRY) {
      ctx.fillStyle = `rgba(255,82,82,${0.35 + 0.25 * Math.sin(t * 0.4)})`;
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FINISH', CFG.STAGE_W / 2, 220);
    }
  }

  // cinematic darkening during the super flash
  if (game.superFreeze > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
    const who = game.superWho;
    const prog = Math.min(1, (CFG.SUPER_FREEZE - game.superFreeze) / 8);
    const beam = who && who.superKind === 'beam';
    if (who && !beam) drawMech(ctx, who, prog);
    if (who) drawFighter(ctx, who, game);
    if (who && beam) {                              // a swelling charge aura during the freeze
      const cy = CFG.FLOOR_Y - 130, ox = who.x + who.facing * 56;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      radialGlow(ctx, ox, cy, 60 + prog * 220, 'rgba(110,215,255,0.5)');
      ball(ctx, ox, cy, 12 + prog * 40, '#dffaff');
      ball(ctx, ox, cy, 6 + prog * 18, '#ffffff');
      ctx.restore();
    }
    ctx.fillStyle = beam ? '#8fe9ff' : '#ffe082';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(beam ? 'OVERDRIVE BEAM' : 'MECH CANNON', CFG.STAGE_W / 2, 200);
  }

  // counter-hit cinematic: dim the room, the two of them on top of the slip
  if (game.counter) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
    drawFighter(ctx, game.counter.vic, game);
    drawFighter(ctx, game.counter.att, game);
  }

  // canned cinematic (suplex / ground&pound / flatliner): ONE overlay, dim by kind.
  // Victim first, attacker on top — the sequencer owns both bodies' poses.
  if (game.cine) {
    const dim = game.cine.kind === 'groundpound' ? 0.35 : 0.5;
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
    drawFighter(ctx, game.cine.vic, game);
    drawFighter(ctx, game.cine.att, game);
  }

  // white flash — counter-hit read OR any KO. Divides by whichever seed fired
  // (game.flashMax), so the longer KO flash fades correctly, not by COUNTER_FLASH.
  if (game.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, 0.85 * game.flash / (game.flashMax || CFG.COUNTER_FLASH))})`;
    ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
  }

  if (game.debug) drawDebugBoxes(ctx, game.fighters);
  ctx.restore();
}
