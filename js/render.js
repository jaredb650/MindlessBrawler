// ─────────────────────────────────────────────────────────────
// Render v2: procedural ARTICULATED fighters — two-bone IK limbs,
// real stances, outlines + two-tone shading, swing trails.
// Still the file a sprite pass replaces: it keys off
// (fighter.animKey(), f, facing, x, y) and physics state only.
// ─────────────────────────────────────────────────────────────
const Particles = [];
const FloatTexts = [];

function spawnSpark(x, y, kind) {
  const palettes = {
    hit:   ['#ffffff', '#ffb74d', '#ff7043'],
    block: ['#80deea', '#4dd0e1'],
    parry: ['#fff59d', '#ffe082', '#ffffff'],
  };
  const colors = palettes[kind] || palettes.hit;
  const n = kind === 'parry' ? 14 : kind === 'hit' ? 10 : 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * (kind === 'block' ? 3 : 6);
    Particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
      life: 14 + Math.random() * 10, maxLife: 24,
      color: colors[(Math.random() * colors.length) | 0],
      size: 2 + Math.random() * 3, grav: 0.15,
    });
  }
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

// FX run even during hitstop — the freeze is for bodies, not sparks.
function updateFx() {
  for (let i = Particles.length - 1; i >= 0; i--) {
    const p = Particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.life--;
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
  return Math.max(0.2, 1 - (f.f - mv.startup - mv.active) / Math.max(1, mv.recovery));
}

// ── the fighter ──────────────────────────────────────────────
// Skeleton in local space: feet at y=0, +x = forward.
function drawFighter(ctx, f, game) {
  const key = f.animKey();
  const flash = ((f.state === 'hitstun' || f.state === 'launched' || f.state === 'fallheavy') && f.f <= 2)
    || (f.state === 'executed' && f.f > 20 && f.f % 6 < 2);

  const body = flash ? '#ffffff' : f.color;
  const dark = flash ? '#dddddd' : shade(f.color, 0.62);
  const glove = flash ? '#ffffff' : '#f2f2f5';
  const boot = flash ? '#eeeeee' : shade(f.color, 0.45);
  const skin = flash ? '#ffffff' : '#e8c39e';

  // ground shadow
  const air = Math.max(0, CFG.FLOOR_Y - f.y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(f.x, CFG.FLOOR_Y + 6, Math.max(18, 44 - air * 0.08), 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(f.x, f.y);
  if (f.facing === -1) ctx.scale(-1, 1);
  // HARD RULE: unhittable ⇔ flashing transparent. Solid body = fair game.
  if (f.invuln > 0 || f.state === 'fallheavy') ctx.globalAlpha = game.frame % 6 < 3 ? 0.25 : 0.6;

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
  const bob = Math.sin(f.f * 0.09) * 2;
  P.sho.y += bob; P.head.y += bob; P.handF.y += bob; P.handR.y += bob;

  const ext = attackExt(f);
  const mv = f.move;
  const target = mv ? { x: (mv.hitbox.x + mv.hitbox.w * 0.72) * ext, y: (mv.hitbox.y + mv.hitbox.h / 2) + (1 - ext) * 18 } : null;
  const isPunch = ['jab', 'cross', 'hook', 'uppercut', 'backfist', 'crouchjab', 'flyuppercut'].includes(key);
  const isKick = ['frontkick', 'legkick', 'sweep', 'soccer', 'jumpkick', 'knee', 'backkick', 'flyknee'].includes(key);

  switch (key) {
    case 'walk': {
      const s = Math.sin(f.f * 0.28);
      P.footF.x = 22 + s * 13; P.footR.x = -18 - s * 13;
      P.footF.y = -Math.max(0, s) * 7; P.footR.y = -Math.max(0, -s) * 7;
      break;
    }
    case 'run': {
      const s = Math.sin(f.f * 0.42);
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
    case 'prejump': case 'land': squash(P, 0.85); break;
    case 'air': {
      P.footF = { x: 10, y: -34 }; P.footR = { x: -10, y: -28 };
      P.legBendF = 1; P.legBendR = 1;
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
    case 'superstart': lean(P, 0.12); guardUp(P); P.faceMood = 1; break;
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
    case 'jumpkick': case 'flyknee': {
      lean(P, key === 'flyknee' ? 0.35 : 0.2);
      P.footR = { x: -8, y: -36 }; P.legBendR = 1;          // trailing leg tucked
      if (target) strikeTo(P, target, 'kick');
      P.handF = { x: 26, y: -120 }; P.handR = { x: 6, y: -130 };
      P.faceMood = 1;
      break;
    }
    case 'flyuppercut': {
      lean(P, -0.1);
      P.footF = { x: 10, y: -26 }; P.footR = { x: -12, y: -18 };
      P.legBendF = 1; P.legBendR = 1;
      if (target) strikeTo(P, target, 'punch');
      P.faceMood = 1;
      break;
    }
    default: {
      if ((isPunch || isKick) && target) {
        lean(P, 0.16);
        strikeTo(P, target, isPunch ? 'punch' : 'kick');
        P.faceMood = 1;
      }
    }
  }

  // guard arms while holding back in neutral (pre-block readability)
  if (!mv && f.backHeldFrames > 0 && ['idle', 'walk', 'crouch'].includes(f.state)) guardUp(P);

  drawSkeleton(ctx, P, { body, dark, glove, boot, skin, dead, flash, key, mvActive: mv && f.f > mv.startup && f.f <= mv.startup + Math.min(mv.active, 9) });

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
function strikeTo(P, target, kind) {
  if (kind === 'punch') {
    P.handF = { x: target.x, y: target.y };
    P.handR = { x: 14, y: -124 };   // other hand guards
  } else {
    P.footF = { x: target.x, y: target.y };
    P.legBendF = target.y < -70 ? 1 : -1;   // high kicks bend the knee up
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

function render(ctx, game) {
  ctx.save();
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * game.shake * 2, (Math.random() - 0.5) * game.shake * 2);
  }
  drawStage(ctx);

  for (const f of game.fighters) if (f.state === 'superstart') drawMech(ctx, f);
  for (const p of Projectiles) drawProjectile(ctx, p);

  // attacker draws on top
  const [a, b] = game.fighters;
  const order = a.move && !b.move ? [b, a] : [a, b];
  for (const f of order) drawFighter(ctx, f, game);

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
    if (who) drawMech(ctx, who, Math.min(1, (CFG.SUPER_FREEZE - game.superFreeze) / 8));
    if (who) drawFighter(ctx, who, game);
    ctx.fillStyle = '#ffe082';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MECH CANNON', CFG.STAGE_W / 2, 200);
  }

  if (game.debug) drawDebugBoxes(ctx, game.fighters);
  ctx.restore();
}
