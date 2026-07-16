// ─────────────────────────────────────────────────────────────
// Render v2: procedural ARTICULATED fighters — two-bone IK limbs,
// real stances, outlines + two-tone shading, swing trails.
// Still the file a sprite pass replaces: it keys off
// (fighter.animKey(), f, facing, x, y) and physics state only.
// ─────────────────────────────────────────────────────────────
const Particles = [];
const Slashes = [];      // dramatic slash crescents — bright streaks thrown during the knife auto-combo
const FloatTexts = [];
const Stains = [];       // persistent blood decals on floor/walls (cleared on rematch)
const Heads = [];        // severed heads — physics objects that fly, bounce, roll (decapitation KO)
const Shockwaves = [];   // expanding impact rings (wall spike) — short-lived, drawn additively

// ── PIXEL-ART FX: chunky, grid-snapped blocks (Mortal Kombat / Metal Slug / Blasphemous look) ──
// Every particle / stain draws as a hard-edged square snapped to FX_PX, with stepped (not smooth)
// alpha — so blood + impacts read as deliberate pixel art, and stay consistent when the retro
// filter (js/retro.js) is on. FX_PX matches RETRO.scale so a chunk = 1 retro-pixel under the filter.
const FX_PX = (typeof CFG !== 'undefined' && CFG.RETRO && CFG.RETRO.scale) || 4;   // = RETRO.scale → a chunk is exactly 1 retro-pixel under the filter (no shimmer)
function fxStepA(t) { return t > 0.66 ? 1 : t > 0.33 ? 0.7 : 0.4; }   // quantized fade
// `gp` = the pixel grid for THIS chunk (defaults to FX_PX). Sparks pass a finer grid so they
// read crisp, while blood/debris stay chunky.
function fxBlock(ctx, x, y, size, color, alpha, outline, gp) {
  const q = gp || FX_PX;
  const s = Math.max(q, Math.round(size / q) * q);
  const px = Math.round(x / q) * q - (s >> 1);
  const py = Math.round(y / q) * q - (s >> 1);
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  if (outline) { ctx.fillStyle = outline; ctx.fillRect(px - q, py - q, s + q * 2, s + q * 2); }
  ctx.fillStyle = color;
  ctx.fillRect(px, py, s, s);
}
// A velocity-aligned chunky STREAK: a few fx blocks smeared from the particle's trailing
// position to its head, tapered thin→fat. Reads as a fast spark / blood squirt while staying
// hard-edged pixel. `p.streak` = trail length in frames of velocity; `p.px` = optional finer grid.
function fxStreak(ctx, p, alpha, outline) {
  const steps = 4, len = p.streak;
  for (let i = 0; i < steps; i++) {
    const f = i / (steps - 1);                          // 0 = tail … 1 = head
    const sx = p.x - p.vx * len * (1 - f);
    const sy = p.y - p.vy * len * (1 - f);
    fxBlock(ctx, sx, sy, p.size * (0.45 + 0.55 * f), p.color, alpha, i === steps - 1 ? outline : null, p.px);
  }
}

// A severed head launched off the body — bounces, rolls, bleeds, settles on the floor.
function spawnHead(x, y, vx, vy, skin, color) {
  Heads.push({ x, y, vx, vy, rot: (Math.random() - 0.5) * 0.6, vrot: (Math.random() - 0.5) * 0.5, skin, color, rest: false });
  if (Heads.length > 6) Heads.shift();
}
function updateHeads() {
  for (const h of Heads) {
    if (h.rest) continue;
    h.x += h.vx; h.y += h.vy; h.vy += 0.6; h.rot += h.vrot;
    if (h.y < CFG.FLOOR_Y - 24 && Math.random() < 0.4) spawnBlood(h.x, h.y + 8, Math.sign(h.vx) || 0, 1);   // dripping in the air
    if (h.x < CFG.WALL_L + 14) { h.x = CFG.WALL_L + 14; h.vx = -h.vx * 0.4; }
    if (h.x > CFG.WALL_R - 14) { h.x = CFG.WALL_R - 14; h.vx = -h.vx * 0.4; }
    if (h.y >= CFG.FLOOR_Y - 8) {
      h.y = CFG.FLOOR_Y - 8;
      if (h.vy > 2.5) { h.vy = -h.vy * 0.42; h.vx *= 0.7; spawnBlood(h.x, CFG.FLOOR_Y, Math.sign(h.vx) || 1, 8); spawnStain(h.x, CFG.FLOOR_Y + 1, false); }
      else { h.vy = 0; h.vx *= 0.86; h.vrot *= 0.78; if (Math.abs(h.vx) < 0.4 && Math.abs(h.vrot) < 0.02) { h.vx = 0; h.vrot = 0; h.rest = true; spawnStain(h.x, CFG.FLOOR_Y + 1, false); } }
    }
  }
}
function drawHeads(ctx) {
  for (const h of Heads) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    ctx.fillStyle = '#7b241c'; ctx.beginPath(); ctx.ellipse(0, 12, 9, 6, 0, 0, Math.PI * 2); ctx.fill();   // ragged bloody stump under the chin
    ball(ctx, 0, 0, 15, h.skin);
    drawFace(ctx, 0, 0, -1, true, false);   // dead face (X eyes)
    ctx.restore();
  }
}

// ── ejected shotgun shells: small brass casings that arc, bounce, settle, and self-clean. ──
const Shells = [];
function spawnShell(x, y, vx, vy) {
  Shells.push({ x, y, vx, vy, rot: (Math.random() - 0.5) * 2, vrot: (Math.random() - 0.5) * 0.9, life: 200 });
  if (Shells.length > 14) Shells.shift();   // bounded
}
function updateShells() {
  for (let i = Shells.length - 1; i >= 0; i--) {
    const s = Shells[i];
    s.vy += 0.55; s.x += s.vx; s.y += s.vy; s.rot += s.vrot;
    if (s.x < CFG.WALL_L + 8) { s.x = CFG.WALL_L + 8; s.vx = -s.vx * 0.4; }
    if (s.x > CFG.WALL_R - 8) { s.x = CFG.WALL_R - 8; s.vx = -s.vx * 0.4; }
    if (s.y >= CFG.FLOOR_Y - 2) {
      s.y = CFG.FLOOR_Y - 2;
      if (s.vy > 1.4) { s.vy = -s.vy * 0.38; s.vx *= 0.6; s.vrot *= 0.7; }   // tinny bounce
      else { s.vy = 0; s.vx *= 0.7; s.vrot *= 0.6; }
    }
    if (--s.life <= 0) Shells.splice(i, 1);   // self-cleanup
  }
}
function drawShells(ctx) {
  for (const s of Shells) {
    const a = s.life < 40 ? s.life / 40 : 1;   // fade out at the end
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    ctx.fillStyle = '#a83227'; ctx.fillRect(-5, -2.5, 10, 5);     // red plastic hull
    ctx.fillStyle = '#e0ac4c'; ctx.fillRect(-5, -2.5, 3.5, 5);    // brass base
    ctx.restore();
  }
}

// `power` (hits only): 0 light · 1 med · 2 heavy → scales the burst so heavies READ heavy.
// Callers that omit it default to med, so existing spark calls look ~unchanged.
function spawnSpark(x, y, kind, power) {
  const palettes = {
    hit:   ['#ffffff', '#ffe066', '#ffd23f', '#ffaa1d'],   // white-hot core → yellow → amber (heat ramp)
    block: ['#ffffff', '#82eaff', '#4dd0e1'],              // crisp blue guard-clang
    parry: ['#fff59d', '#ffe082', '#ffffff'],              // gold — unchanged (cinematics rely on it)
    blood: ['#c0392b', '#e74c3c', '#7b241c'],
  };
  const colors = palettes[kind] || palettes.hit;
  const p = (power == null) ? 1 : power;
  const energy = (kind === 'hit' || kind === 'block');   // additive, streaked, short-lived — the impact pops
  const n = kind === 'parry' ? 14 : kind === 'hit' ? (6 + p * 5) : 6;   // light 6 / med 11 / heavy 16
  const spMax = kind === 'block' ? 4 : kind === 'hit' ? (4 + p * 3) : 6;
  const szMax = kind === 'hit' ? (2 + p * 1.5) : 3;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * spMax;
    Particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
      life: energy ? 9 + Math.random() * 7 : 14 + Math.random() * 10, maxLife: energy ? 16 : 24,
      color: colors[(Math.random() * colors.length) | 0],
      size: 2 + Math.random() * szMax, grav: 0.15,
      blood: kind === 'blood',
      streak: energy ? 1.4 : 0,    // velocity-aligned chunky trail
      additive: energy,            // drawn in the 'lighter' pass → overlapping sparks bloom
      px: energy ? 2 : undefined,  // finer pixel grid for sparks (crisper than the chunky FX_PX)
    });
  }
  if (energy) spawnImpactStar(x, y, p);   // the classic radial "pop" at the contact point
}

// A one-shot radial STAR burst at a contact point — bright white arms streaking outward for a
// few frames (the genre's signature impact pop). Drawn additively with the energy sparks.
function spawnImpactStar(x, y, power) {
  const arms = 4 + (power || 0) * 2;       // 4 (light) … 8 (heavy)
  const reach = 5 + (power || 0) * 2;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + Math.random() * 0.3;
    Particles.push({
      x, y, vx: Math.cos(a) * reach, vy: Math.sin(a) * reach,
      life: 5 + Math.random() * 3, maxLife: 8,
      color: '#ffffff', size: 2.5, grav: 0,
      streak: 2.2, additive: true, px: 2,   // finer grid → crisp star
    });
  }
}

// A warm FIREBALL burst — gunpowder detonation (the rifle round exploding on impact).
function spawnBlast(x, y) {
  const cols = ['#fff3b0', '#ffd54f', '#ffb74d', '#ff7043', '#ffffff'];
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
    Particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
      life: 12 + Math.random() * 12, maxLife: 24,
      color: cols[(Math.random() * cols.length) | 0],
      size: 2.5 + Math.random() * 4, grav: 0.06,
    });
  }
}

// A standalone SLASH CRESCENT — a bright streak thrown for drama (knife auto-combo).
// Lives a few frames, growing + fading; angle in radians, len = full length in px.
function spawnSlashFx(x, y, ang, len, color) {
  Slashes.push({ x, y, ang, len: len || 120, life: 9, maxLife: 9, color: color || 'rgba(200,242,255,0.9)' });
  if (Slashes.length > 28) Slashes.shift();
}
function drawSlashes(ctx) {
  ctx.lineCap = 'round';
  for (const s of Slashes) {
    const t = s.life / s.maxLife;                  // 1 → 0
    const half = s.len * 0.5 * (1.2 - t * 0.2);    // the streak grows slightly as it fades out
    const dx = Math.cos(s.ang) * half, dy = Math.sin(s.ang) * half;
    ctx.globalAlpha = t * 0.55;                     // outer glow (per-combo colour)
    ctx.strokeStyle = s.color || 'rgba(200,242,255,0.9)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(s.x - dx, s.y - dy); ctx.lineTo(s.x + dx, s.y + dy); ctx.stroke();
    ctx.globalAlpha = t;                            // bright white core
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s.x - dx, s.y - dy); ctx.lineTo(s.x + dx, s.y + dy); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Blood gout — a directional spray (mostly along `dir`) that arcs and falls fast.
// The Flatliner's money shot; also a light spurt on the connecting blow.
// `power` (0 light · 1 med · 2 heavy) scales the CHUNK size: heavy = big chunky globs, light = fine spray.
function spawnBlood(x, y, dir, n, power) {
  const reds = ['#c0392b', '#a93226', '#922b21', '#7b241c', '#5e1a13'];   // tight crimson ramp (no bright AA red)
  const p = power == null ? 1 : power;
  // squirt STREAKS — fast directional crimson lines mixed in with the chunks (opaque, no soft mist)
  for (let i = 0, sn = 3 + (n >> 2); i < sn; i++) {
    const sp = 7 + Math.random() * 9;
    Particles.push({
      x, y: y + (Math.random() - 0.5) * 20,
      vx: dir * sp + (Math.random() - 0.5) * 3, vy: -Math.random() * 5 - 1,
      life: 30 + Math.random() * 20, maxLife: 50,
      color: reds[(Math.random() * 3) | 0],
      size: 2 + Math.random() * 2 + p, grav: 0.45,
      blood: true,        // stains the floor/wall where it lands
      streak: 2.4,        // velocity-aligned chunky squirt — long enough to read as a line, not a dot
    });
  }
  for (let i = 0; i < n; i++) {
    const sp = 3 + Math.random() * 10;
    Particles.push({
      x, y: y + (Math.random() - 0.5) * 36,
      vx: dir * sp * (0.5 + Math.random()) + (Math.random() - 0.5) * 4,
      vy: -Math.random() * 7 - 0.5,                    // sprays up/out, then falls
      life: 40 + Math.random() * 34, maxLife: 74,      // lives long enough to REACH the floor → stains the ground
      color: reds[(Math.random() * reds.length) | 0],
      size: (1.5 + Math.random() * 2) + p * 1.8,       // smaller chunks; still scales with hit power
      grav: 0.42,                                      // falls fast → lands + pools
      blood: true,                                     // stains the floor/wall where it lands
    });
  }
  // a portion flung DOWNWARD so the floor right under the hit catches blood (environmental gore)
  for (let i = 0, dn = Math.max(2, n >> 1); i < dn; i++) {
    Particles.push({
      x: x + (Math.random() - 0.5) * 26, y: y + Math.random() * 22,
      vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 5,
      life: 50 + Math.random() * 34, maxLife: 84,
      color: reds[(Math.random() * reds.length) | 0],
      size: (1.5 + Math.random() * 2) + p * 1.4, grav: 0.5, blood: true,
    });
  }
  if (p >= 2) for (let i = 0; i < 4; i++) {            // heavy hits throw a few chunky globs (half-size now)
    const sp = 2 + Math.random() * 6;
    Particles.push({
      x, y: y + (Math.random() - 0.5) * 24,
      vx: dir * sp + (Math.random() - 0.5) * 3, vy: -Math.random() * 6 - 1,
      life: 44 + Math.random() * 24, maxLife: 70,
      color: reds[3 + ((Math.random() * 2) | 0)],
      size: 3 + Math.random() * 2, grav: 0.5, blood: true,
    });
  }
}

// A persistent blood decal where a drop hit the floor (pool) or a wall (drip).
const STAIN_CAP = 600;   // persistent gore — the arena soaks in blood over the round (ring-buffer recycles oldest)
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
    const sx = Math.round(s.x / FX_PX) * FX_PX, sy = Math.round(s.y / FX_PX) * FX_PX;
    if (s.vertical) {                                  // wall drip — narrow vertical chunky streak
      const w = Math.max(FX_PX, Math.round(s.r * 0.7 / FX_PX) * FX_PX), h = Math.max(FX_PX, Math.round(s.r * 1.6 / FX_PX) * FX_PX);
      ctx.fillRect(sx - (w >> 1), sy, w, h);
    } else {                                           // floor pool — wide flat chunky splat (many overlap into an organic pool)
      const w = Math.max(FX_PX, Math.round(s.r * 1.8 / FX_PX) * FX_PX), h = Math.max(FX_PX, Math.round(s.r * 0.7 / FX_PX) * FX_PX);
      ctx.fillRect(sx - (w >> 1), sy - (h >> 1), w, h);
      if (s.r > 5) ctx.fillRect(sx - (w >> 2), sy - (h >> 1) - FX_PX, (w >> 1), FX_PX);   // a small raised lump → irregular pixel edge
    }
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

// RUMBLE — chunky debris blasted off the wall (into the stage, dir) by a wall-spike impact.
function spawnRumble(x, y, dir) {
  const cols = ['#6b6b78', '#52525e', '#7a7a86', '#42424c', '#8a8a96', '#5a5a66'];
  for (let i = 0; i < 24; i++) {
    const sp = 4 + Math.random() * 12;
    Particles.push({
      x: x + (Math.random() - 0.5) * 26, y: y - 90 + Math.random() * 170,
      vx: dir * sp * (0.4 + Math.random()) + (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 10,
      life: 16 + Math.random() * 18, maxLife: 34,
      color: cols[(Math.random() * cols.length) | 0], size: 5 + Math.random() * 9, grav: 0.42,   // bigger chunks → reads as heavy rubble
      outline: '#1f1f26',                                                                          // dark edge → chunky rock definition
    });
  }
}

// An expanding SHOCKWAVE ring — a vertical half-ellipse of chunky energy blocks bursting from an
// impact point INTO the stage (`dir` = +1/-1 into-stage). Taller than wide → vertical emphasis.
// Drawn additively. A double pulse (a second, delayed ring) reads as a real shock, not a bubble.
const SHOCKWAVE_MAXR = 150;
function spawnShockwave(x, y, dir, color) {
  Shockwaves.push({ x, y, dir, life: 16, maxLife: 16, delay: 0, color: color || '#ffd54f' });
  Shockwaves.push({ x, y, dir, life: 13, maxLife: 13, delay: 4, color: '#ffffff' });
  if (Shockwaves.length > 16) Shockwaves.splice(0, Shockwaves.length - 16);
}

// GROUND shockwave — the FLOOR-explosion variant (meteor elbow / crescent slam). The wall
// ring stands upright (parallel to the wall); this one lies FLAT: a perspective-squashed
// full ring hugging the floor, expanding radially — the shock propagates ALONG the ground.
function spawnGroundShockwave(x, y, color) {
  Shockwaves.push({ x, y, ground: true, life: 16, maxLife: 16, delay: 0, color: color || '#ffd54f' });
  Shockwaves.push({ x, y, ground: true, life: 13, maxLife: 13, delay: 4, color: '#ffffff' });
  if (Shockwaves.length > 16) Shockwaves.splice(0, Shockwaves.length - 16);
}
function drawShockwaves(ctx) {
  ctx.globalCompositeOperation = 'lighter';
  for (const s of Shockwaves) {
    if (s.delay > 0) continue;                  // not started yet (updateFx ticks the delay down)
    const t = 1 - s.life / s.maxLife;            // 0 → 1 over its life
    const e = 1 - (1 - t) * (1 - t);             // ease-out: bursts fast, then slows
    const a = (1 - t) * 0.9;                      // fades as it grows
    if (s.ground) {
      // FLOOR ring: flat squashed FULL ellipse expanding outward along the ground plane
      const r = 16 + e * SHOCKWAVE_MAXR * 1.15;   // wide radial reach along the floor
      const ry = 5 + e * 20;                      // shallow — it lies on the ground, not standing up
      const steps = 26;
      for (let i = 0; i < steps; i++) {
        const ang = Math.PI * 2 * (i / steps);
        fxBlock(ctx, s.x + Math.cos(ang) * r, s.y + Math.sin(ang) * ry, 3 + (1 - t) * 3, s.color, a);
      }
      continue;
    }
    const rx = 14 + e * SHOCKWAVE_MAXR * 0.6;    // horizontal reach into the stage
    const ry = 18 + e * SHOCKWAVE_MAXR;          // taller → the vertical shock (the WALL ring)
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const ang = -Math.PI / 2 + Math.PI * (i / steps);   // top → bottom, +x side
      fxBlock(ctx, s.x + s.dir * Math.cos(ang) * rx, s.y + Math.sin(ang) * ry, 3 + (1 - t) * 3, s.color, a);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ORDNANCE BOOM (Blackwill's SCORCHED EARTH): a proper military explosion — an additive
// FIREBALL ring bursting outward, a column of rolling SMOKE, and debris. `big` = the rocket.
function spawnOrdnanceBoom(x, y, big) {
  const cols = ['#fff3c8', '#ffce78', '#ff9a36', '#ff5f2e'];
  const n = big ? 28 : 13;
  for (let i = 0; i < n; i++) {   // the fireball
    const a = Math.random() * Math.PI * 2, sp = (big ? 7.5 : 4.5) * (0.4 + Math.random() * 0.8);
    Particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75, life: 10 + Math.random() * (big ? 14 : 8), maxLife: big ? 24 : 16, color: cols[(Math.random() * cols.length) | 0], size: (big ? 6 : 4) + Math.random() * (big ? 7 : 4), grav: -0.04, additive: true });
  }
  for (let i = 0; i < (big ? 11 : 5); i++) {   // the smoke column, rolling upward
    Particles.push({ x: x + (Math.random() - 0.5) * (big ? 64 : 32), y: y - Math.random() * 12, vx: (Math.random() - 0.5) * 1.2, vy: -1.4 - Math.random() * 1.8, life: 18 + Math.random() * (big ? 24 : 12), maxLife: big ? 42 : 28, color: ['#5a5a60', '#6e6a66', '#48443f'][(Math.random() * 3) | 0], size: (big ? 7 : 5) + Math.random() * 5, grav: -0.035 });
  }
  spawnRumble(x, y, 1);   // debris
  if (big) spawnRumble(x, y, -1);
}

// Horizontal SIDE-SPIKE burst — energy streaking in the launch direction (its own distinct look).
function spawnSideSpike(x, y, dir) {
  const cols = ['#ffffff', '#ffd54f', '#ffb74d', '#fff59d'];
  for (let i = 0; i < (CFG.SIDESPIKE_BURST || 22); i++) {
    Particles.push({
      x: x - dir * 8, y: y + (Math.random() - 0.5) * 50,
      vx: dir * (6 + Math.random() * 14), vy: (Math.random() - 0.5) * 5,   // mostly HORIZONTAL, along the blast
      life: 8 + Math.random() * 9, maxLife: 17,
      color: cols[(Math.random() * cols.length) | 0], size: 2 + Math.random() * 3.5, grav: 0.08,
    });
  }
}

// A small particle TRAIL streaming off a side-spiked body in flight (called each flight frame).
function spawnSideTrail(x, y) {
  const cols = ['#ffffff', '#ffd54f', '#ffe082', '#fff59d'];
  for (let i = 0; i < 2; i++) {
    Particles.push({
      x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
      life: 8 + Math.random() * 7, maxLife: 15,
      color: cols[(Math.random() * cols.length) | 0], size: 2 + Math.random() * 2.5, grav: 0,
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

// The SWORD (super-combo finisher): a long bright blade from the lead hand, sweeping
// through a slash arc. `f` = frames into the current swipe (poseF0 resets it per slash).
function drawSword(ctx, hx, hy, f, winding) {
  let ang, slashing;
  if (winding) {                              // windup: blade held RAISED & back, faint quiver — no slash
    ang = -1.75 + Math.sin(f * 0.3) * 0.12;
    slashing = false;
  } else {                                    // a swipe: arc from up-and-back down across the front
    ang = -1.5 + Math.min(1, f / CFG.SWORD_SWIPE_FRAMES) * 2.7;
    slashing = f < CFG.SWORD_SWIPE_FRAMES;
  }
  const len = 100;
  const tx = hx + Math.cos(ang) * len, ty = hy + Math.sin(ang) * len;
  ctx.save();
  ctx.lineCap = 'round';
  if (slashing) {                             // bright slash trail behind the tip
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(210,242,255,0.65)'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(hx, hy, len, ang - 1.0, ang, false); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 9;                 // blade outline
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = '#cfe9ff'; ctx.lineWidth = 5;              // steel
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;             // hot edge
  ctx.beginPath(); ctx.moveTo(hx + Math.cos(ang) * 14, hy + Math.sin(ang) * 14); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.restore();
}

// FX run even during hitstop — the freeze is for bodies, not sparks.
function updateFx() {
  updateHeads();
  updateShells();
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
  if (Particles.length > 1400) Particles.splice(0, Particles.length - 1400);   // safety cap (bloodier hits → more particles); drop oldest
  for (let i = Slashes.length - 1; i >= 0; i--) { if (--Slashes[i].life <= 0) Slashes.splice(i, 1); }
  for (let i = Shockwaves.length - 1; i >= 0; i--) { const s = Shockwaves[i]; if (s.delay > 0) { s.delay--; } else if (--s.life <= 0) Shockwaves.splice(i, 1); }
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

// ── per-character "look": palette + body proportions + hair. Both characters share the
// same pose engine (drawFighterBrawler); the LOOK is what makes the silhouette read as a
// different person. BRAWLER_LOOK reproduces the original values EXACTLY (so he is unchanged).
const BRAWLER_LOOK = {
  glove: '#f2f2f5', skin: '#e8c39e', bootShade: 0.45,
  torsoW: 32, headR: 15, armW: 11, legW: 13, armWR: 10.5, legWR: 12.5,
  female: false, hair: null,
};
// Vesper: leaner female frame — narrower torso, thinner limbs, smaller head, dark gloves/boots,
// black hair (ponytail). Body color stays her player color (cyan/red), like the brawler.
const VESPER_LOOK = {
  glove: '#17171f', skin: '#f0d2bc', bootShade: 0.32,
  torsoW: 25, headR: 13.5, armW: 9, legW: 11, armWR: 8, legWR: 10,
  female: true, hair: '#15121b', longHair: true, shades: true, dualWield: true,
};
// GIIIOOO: a smaller, wiry STREET-KID frame — narrow torso, quick limbs, bare-knuckle wraps
// (light gloves), short dark hair. Scale under 1 so he reads as the little guy on the roster.
const GIIIOOO_LOOK = {
  glove: '#c9483a', skin: '#c98d5e', bootShade: 0.38,
  torsoW: 26, headR: 14, armW: 9.5, legW: 11.5, armWR: 9, legWR: 11,
  female: false, hair: '#1b1b22',
  scale: 0.92,
};
// BLACKWILL: the HEAVIEST silhouette — a hulking frame broader than Xamora, dark work gloves,
// shaved head. The machete/chainsaw props come with his sprites; the capsule sells the mass.
const BLACKWILL_LOOK = {
  glove: '#23231f', skin: '#caa287', bootShade: 0.5,
  torsoW: 40, headR: 15, armW: 14, legW: 16, armWR: 13, legWR: 15,
  female: false, hair: null,
  scale: 1.16, macheteIdle: true,   // the machete rests in his hand — he always reads as armed
};
// Xamora: a taller, broader WINGED frame — heavyset, angel wings, carries a bo staff. v1 reskins the brawler body.
const XAMORA_LOOK = {
  glove: '#caa64a', skin: '#e6c6a4', bootShade: 0.40,
  torsoW: 36, headR: 15.5, armW: 13, legW: 15, armWR: 12, legWR: 14,
  female: true, hair: '#2a2030', longHair: true,
  scale: 1.12, wings: true, staffWeapon: true,
};

// Per-character body dispatch: each character draws its own silhouette + pose set. Both run the
// same pose engine (drawFighterBrawler) but with a different LOOK; routed here by charType.
// ── VESPER SPRITE SHEETS (chroma-keyed green → transparent at load; sliced 161×240 per cell) ──
// Each sheet is read left→right, top→bottom. `frames` caps real cells (some sheets pad with blanks).
const SPR_CELL_W = 161, SPR_CELL_H = 240;   // default cell size; a sheet can override with cw/ch
// A sheet may also override scale/offX/offY (e.g. a different cell size needs its own alignment).
// ALL sprite config lives in assets/sprites/sprites.json (edited by tools/sprite-tool.html) and is loaded here.
const SPRITES = { ready: false, chars: {} };   // chars[id] = { global, sheets:{ key:{…cfg…, canvas, ready} } }

function _spriteKey(img, tint, bright, contrast, sat) {   // green → transparent + despill + tint×brightness, then contrast + saturation; returns a canvas (raw img if tainted)
  try {
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const id = cx.getImageData(0, 0, cv.width, cv.height), d = id.data;
    const br = bright || 1, tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    const c100 = contrast || 0, C = c100 * 2.55, cf = (259 * (C + 255)) / (255 * (259 - C)), sv = (sat == null ? 1 : sat);
    const adj = tint || br !== 1 || c100 !== 0 || sv !== 1, cl = v => v < 0 ? 0 : v > 255 ? 255 : v;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (g > 80 && g > r * 1.2 && g > b * 1.2) { d[i + 3] = 0; continue; }   // green background → cut it out
      const mx = r > b ? r : b;
      if (g > mx) { g = mx; d[i + 1] = g; }                                    // DESPILL the green rim off the subject
      if (adj) {
        let R = Math.min(255, r * tr * br), G = Math.min(255, g * tg * br), B = Math.min(255, b * tb * br);
        if (c100 !== 0) { R = cf * (R - 128) + 128; G = cf * (G - 128) + 128; B = cf * (B - 128) + 128; }   // contrast
        if (sv !== 1) { const gy = 0.299 * R + 0.587 * G + 0.114 * B; R = gy + (R - gy) * sv; G = gy + (G - gy) * sv; B = gy + (B - gy) * sv; }   // saturation
        d[i] = cl(R); d[i + 1] = cl(G); d[i + 2] = cl(B);
      }
    }
    cx.putImageData(id, 0, 0); return cv;
  } catch (e) { return img; }   // tainted canvas (file://) → raw image (green shows; use a local server)
}
function loadSprites() {
  fetch('assets/sprites/sprites.json').then(r => r.json()).then(data => {
    SPRITES.chars = {};
    for (const cid in (data.characters || {})) {
      const c = data.characters[cid], entry = { global: c.global || {}, sheets: {} };
      for (const k in (c.sheets || {})) {
        const sh = Object.assign({}, c.sheets[k]); entry.sheets[k] = sh;
        const img = new Image();
        img.onload = (G => () => { sh.canvas = _spriteKey(img, sh.tint || G.tint, sh.bright != null ? sh.bright : G.bright, sh.contrast != null ? sh.contrast : G.contrast, sh.sat != null ? sh.sat : G.sat); sh.ready = true; })(entry.global);
        img.onerror = () => { sh.ready = false; };
        img.src = sh.src;
      }
      SPRITES.chars[cid] = entry;
    }
    SPRITES.ready = true;
  }).catch(() => {});
}
if (typeof Image !== 'undefined' && typeof fetch !== 'undefined' && typeof document !== 'undefined') loadSprites();

function spriteIncluded(sh, nf) {   // PLAY ORDER: excluded frames skipped, plus an optional loop segment repeated.
  // Returns the ordered list of frame indices to play (with repeats), or null (fast path) when nothing
  // is excluded AND there's no active loop. loop = { from, to, times }: frames [from..to] play `times` total.
  const loop = sh.loop && sh.loop.times > 1 ? sh.loop : null;
  if ((!sh.exclude || !sh.exclude.length) && !loop) return null;
  const base = [];
  for (let i = 0; i < nf; i++) if (!sh.exclude || sh.exclude.indexOf(i) < 0) base.push(i);
  if (!loop) return base;
  const from = loop.from | 0, to = loop.to | 0;
  if (to < from) return base;
  const seg = base.filter(i => i >= from && i <= to);
  if (!seg.length) return base;
  let out = base.filter(i => i < from);
  for (let t = 0; t < loop.times; t++) out = out.concat(seg);
  return out.concat(base.filter(i => i > to));
}
function spriteSteps(sh, nf) {
  // Normalized play list: each step = { cell, dx, dy, ds, flip }. An explicit `order` timeline (drag /
  // duplicate / per-frame mirror, authored in the sprite tool) is the source of truth when present;
  // otherwise fall back to the legacy contiguous window (start..start+frames-1) with exclusions skipped
  // and the optional loop segment repeated. `flip` = horizontal mirror of that one frame (reuse art for spins).
  if (sh.order && sh.order.length) return sh.order.map(e => (typeof e === 'number' ? { cell: e } : e));
  const inc = spriteIncluded(sh, nf), start = sh.start || 0, cells = sh.cells;
  const len = inc ? inc.length : nf, out = [];
  for (let i = 0; i < len; i++) {
    const fr = inc ? inc[i] : i, c = cells && cells[fr];
    out.push(c ? { cell: start + fr, dx: c.dx, dy: c.dy, ds: c.ds, flip: c.flip } : { cell: start + fr });
  }
  return out;
}
function spriteAnimKey(entry, f) {
  // The JUMP phases are handled separately (spriteJump, on their own clock). Everything else keys off
  // animKey() — which is the move's anim during attacks, else the state name (idle/walk/run/crouch/backdash/
  // blockstun/hitstun/…). Any sheet whose key matches is used; falls back to the raw state key.
  const k = f.animKey ? f.animKey() : f.state;
  if (k && entry.sheets[k]) return k;
  if (f.state && entry.sheets[f.state]) return f.state;
  return null;
}
// JUMP state-machine: full JumpStart on takeoff + full JumpLand on touchdown, each on its OWN clock (game.frame),
// JumpAir looped between, double-jump replays the launch frames. ANY other state cancels. Returns {key, frame} | null.
function spriteJump(entry, f, game) {
  const st = entry.sheets.prejump, a = entry.sheets.air, lnd = entry.sheets.land, gf = game.frame | 0;
  if (f.state === 'prejump' && st) {
    f._jumpF0 = gf - f.f;
    return { key: 'prejump', frame: Math.min(st.frames - 1, ((gf - f._jumpF0) * (st.fps || 30) / 60) | 0) };
  }
  if (f.state === 'air' && (st || a)) {
    if (st) {
      if (!f.usedDoubleJump) { f._djF0 = null; f._djDone = false; }   // fresh airtime — no double-jump yet
      else if (!f._djDone) {
        if (f._djF0 == null) f._djF0 = gf;
        const DJN = 5, dfr = ((gf - f._djF0) * (st.fps || 30) / 60) | 0;
        if (dfr < DJN) return { key: 'prejump', frame: (st.frames - DJN) + dfr };   // replay the launch frames
        f._djDone = true;
      }
      if (f._jumpF0 != null) { const fr = ((gf - f._jumpF0) * (st.fps || 30) / 60) | 0; if (fr < st.frames) return { key: 'prejump', frame: fr }; }
    }
    if (a) return { key: 'air', frame: ((f.f * (a.fps || 9) / 60) | 0) % a.frames };
    return null;
  }
  f._jumpF0 = null;
  if (f.state === 'land') {
    const lk = f.landAnim && entry.sheets[f.landAnim] ? f.landAnim : 'land', ls = entry.sheets[lk];
    if (ls) {
      const steps = lk === 'land' ? null : spriteSteps(ls, ls.frames || 1), count = steps ? steps.length : ls.frames;
      f._landF0 = gf - f.f; f._landKey = lk;
      const idx = Math.min(count - 1, ((gf - f._landF0) * (ls.fps || 30) / 60) | 0);
      return steps ? { key: lk, step: steps[idx] } : { key: lk, frame: idx };
    }
  }
  if (f.state === 'idle' && f._landF0 != null) {
    const ls = entry.sheets[f._landKey || 'land'];
    if (ls) {
      const lk = f._landKey || 'land', steps = lk === 'land' ? null : spriteSteps(ls, ls.frames || 1);
      const fr = ((gf - f._landF0) * (ls.fps || 30) / 60) | 0, count = steps ? steps.length : ls.frames;
      if (fr < count) return steps ? { key: lk, step: steps[fr] } : { key: lk, frame: fr };
    }
  }
  f._landF0 = null; f._landKey = null;
  return null;
}
function drawSpritePose(ctx, f, game) {
  const entry = SPRITES.chars[f.charType];
  if (!entry) return false;   // no sprite config for this character → vector
  let key, frame = null, jumpStep = null;
  const js = spriteJump(entry, f, game);   // jump phases drive themselves; cancelled by any non-jump state
  if (js) { key = js.key; frame = js.frame; jumpStep = js.step || null; }
  else { key = spriteAnimKey(entry, f); if (!key) return false; }
  const sh = entry.sheets[key];
  if (!sh || !sh.ready || !sh.canvas) return false;   // not loaded yet → vector fallback
  const g = entry.global, nf = sh.frames || 1;
  const cw = sh.cw || g.cellW || SPR_CELL_W, ch = sh.ch || g.cellH || SPR_CELL_H;
  let stepObj;
  if (jumpStep) {
    stepObj = jumpStep;
  } else if (frame != null) {
    // Jump phases (spriteJump) resolve an explicit frame INDEX on their own clock — keep the legacy
    // cell + per-frame-nudge lookup for them (jump sheets don't use the `order` timeline).
    const c = sh.cells && sh.cells[frame];
    stepObj = c ? { cell: (sh.start || 0) + frame, dx: c.dx, dy: c.dy, ds: c.ds, flip: c.flip } : { cell: (sh.start || 0) + frame };
  } else {
    // Everything else: build the ordered step list (explicit `order`, else the legacy start/frames window
    // with exclusions + loop), then pick ONE step by the playback clock.
    const steps = spriteSteps(sh, nf), nfe = steps.length || 1;
    let idx;
    // Cinematic states (heel drop / side kick / …) clear the move and run a short sequencer, so the normal
    // fps clock barely advances. If this fighter is the one a cine is driving and the cine knows its length,
    // scale the WHOLE sheet across the cine so the sprite plays start→finish instead of holding one frame.
    if (game.cine && (game.cine.att === f || game.cine.vic === f) && game.cine.data && game.cine.data.total) {
      idx = Math.min(nfe - 1, Math.max(0, (game.cine.f / game.cine.data.total * nfe) | 0));
    } else if (sh.mode === 'syncMove' && f.move) {   // attack sheets: scale the cycle to the move's total length
      const dur = (f.move.startup || 0) + (f.move.active || 0) + (f.move.recovery || 0);
      idx = dur > 0 ? Math.min(nfe - 1, (f.f / dur * nfe) | 0) : 0;
    } else {
      const ft = Math.floor(f.f * (sh.fps || 30) / 60);
      if (sh.mode === 'once') idx = Math.min(ft, nfe - 1);
      else if (sh.mode === 'boomerang' && nfe > 1) { const per = 2 * (nfe - 1), p = ((ft % per) + per) % per; idx = p < nfe ? p : per - p; }   // ping-pong: 0→n-1→0…
      else idx = ((ft % nfe) + nfe) % nfe;   // default = loop
    }
    stepObj = steps[idx] || { cell: sh.start || 0 };
  }
  const cell = stepObj.cell, cols = sh.cols || 1;
  const sx = (cell % cols) * cw, sy = ((cell / cols) | 0) * ch;

  let rx = f.x, ry = f.y;   // mirror the vector path's render interp
  const ra = game.renderAlpha;
  if (ra != null && ra < 1 && f.prevX != null) {
    const dx = f.x - f.prevX, dy = f.y - f.prevY;
    if (Math.abs(dx) <= CFG.INTERP_SNAP && Math.abs(dy) <= CFG.INTERP_SNAP) { rx = f.prevX + dx * ra; ry = f.prevY + dy * ra; }
  }
  if (!game._trailGhost) {   // afterimage ghosts skip the shadow (else a stack of shadows trails along)
    const airH = Math.max(0, CFG.FLOOR_Y - ry);   // ground shadow (same as the vector body)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(rx, CFG.FLOOR_Y + 6, Math.max(18, 44 - airH * 0.08), 8, 0, 0, Math.PI * 2); ctx.fill();
  }

  ctx.save();
  ctx.translate(rx, ry);
  const facesLeft = sh.faceLeft != null ? sh.faceLeft : g.artFacesLeft;   // per-sheet override, else character global
  const flip = facesLeft ? f.facing === 1 : f.facing === -1;
  if (flip) ctx.scale(-1, 1);
  let scale = sh.scale != null ? sh.scale : (g.scale != null ? g.scale : 1);
  let offX = sh.offX != null ? sh.offX : (g.offX || 0);
  let offY = sh.offY != null ? sh.offY : (g.offY || 0);
  offX += stepObj.dx || 0; offY += stepObj.dy || 0; scale += stepObj.ds || 0;   // per-frame nudge: deltas on top of the sheet alignment (fixes drift in independently-genned frames)
  let dw = cw * scale, dh = ch * scale;
  ctx.imageSmoothingEnabled = false;   // sprites are pre-rendered → draw with HARD pixels (no bilinear blur). Restored by ctx.restore() below.
  const fflip = stepObj.flip ? -1 : 1;   // per-frame horizontal mirror, anchored on the centerline (negate offX so it mirrors in place, not sideways)
  let dx0 = -dw / 2 + fflip * offX, dy0 = sh.flipY ? -offY : (-dh + offY);   // feet at y=0 (flipY = vertical mirror)
  if (fflip < 0) ctx.scale(-1, 1);   // composes on top of the facing flip → a frame stays mirrored-relative-to-pose either way
  if (sh.flipY) ctx.scale(1, -1);
  if (sh.snap) { dx0 = Math.round(dx0); dy0 = Math.round(dy0); dw = Math.round(dw); dh = Math.round(dh); }   // optional per-sheet pixel-snap (default off → identical render)
  ctx.drawImage(sh.canvas, sx, sy, cw, ch, dx0, dy0, dw, dh);
  ctx.restore();
  return true;
}

function drawFighter(ctx, f, game) {
  if (drawSpritePose(ctx, f, game)) return;   // ANY character with sprite config + a matching sheet → sprite; else vector
  if (f.charType === 'vesper') return drawFighterBrawler(ctx, f, game, VESPER_LOOK);
  if (f.charType === 'xamora') return drawFighterBrawler(ctx, f, game, XAMORA_LOOK);
  if (f.charType === 'giiiooo') return drawFighterBrawler(ctx, f, game, GIIIOOO_LOOK);
  if (f.charType === 'blackwill') return drawFighterBrawler(ctx, f, game, BLACKWILL_LOOK);
  return drawFighterBrawler(ctx, f, game);
}
// AFTERIMAGE TRAIL — when a body is moving fast (a lunge / slide / air-dash / hard launch), draw a few
// fading ghost copies of the CURRENT pose along its recent path, so the motion reads as an intentional
// dash instead of a teleport glitch. Drawn UNDER the body. Cheap: only redraws while actually fast.
// trail ONLY the explicit speed-dash moves (flagged `dashTrail: true` — tele-slash, slide tackle,
// dash attacks…), and only while they're actually moving her. Regular attacks / locomotion never trail.
function drawFighterTrail(ctx, f, game) {
  const hist = f.trailHist;
  const total = Math.hypot(f.x - f.prevX, f.y - f.prevY);
  const active = !!hist && hist.length >= 4 && (!!(f.move && f.move.dashTrail) || f.rampage > 0) && total >= (CFG.TRAIL_MIN_SPEED || 5);   // MINDLESS RAMPAGE: afterimages stream off ANY fast movement while it burns
  if (active && !f._trailing) playSfx('swipe');           // rising edge → one swipe per dash burst
  f._trailing = active;
  if (!active) return;
  const ox = f.x, oy = f.y, opx = f.prevX, opy = f.prevY;
  game._trailGhost = true;
  const n = hist.length, ghosts = CFG.TRAIL_GHOSTS || 5;
  for (let i = 1; i <= ghosts; i++) {
    const g = hist[n - 1 - i * 2];                         // every other logged frame back → spaced ghosts
    if (!g) continue;
    f.x = g.x; f.y = g.y; f.prevX = g.x; f.prevY = g.y;    // freeze render-interp at the ghost position
    ctx.save();
    ctx.globalAlpha = 0.55 * (1 - (i - 1) / (ghosts + 1)); // heavier lead ghost, fades back
    drawFighter(ctx, f, game);
    ctx.restore();
  }
  game._trailGhost = false;
  f.x = ox; f.y = oy; f.prevX = opx; f.prevY = opy;
}
function drawFighterVesper(ctx, f, game) { return drawFighterBrawler(ctx, f, game, VESPER_LOOK); }   // legacy refs
function drawFighterXamora(ctx, f, game) { return drawFighterBrawler(ctx, f, game, XAMORA_LOOK); }

// Skeleton in local space: feet at y=0, +x = forward.
function drawFighterBrawler(ctx, f, game, look) {
  look = look || BRAWLER_LOOK;
  const key = f.animKey();
  const flash = (f.hitFlash > 0)   // universal: every clean contact (hit/block/crumple/OTG/launch) flashes white, frame-locked to the hit
    || (f.state === 'executed' && f.f > 20 && f.f % 6 < 2)
    || game.koFreeze > 0;   // KO freeze-frame → solid white silhouette

  const body = flash ? '#ffffff' : f.color;
  const dark = flash ? '#dddddd' : shade(f.color, 0.62);
  const glove = flash ? '#ffffff' : look.glove;
  const boot = flash ? '#eeeeee' : shade(f.color, look.bootShade);
  const skin = flash ? '#ffffff' : look.skin;

  // RENDER INTERP: glide the body between logic ticks (smooth on >60Hz). Snap (no glide)
  // on a teleport-sized jump (reset / wall-snap). Visual only — never affects logic.
  let rx = f.x, ry = f.y;
  const ra = game.renderAlpha;
  if (ra != null && ra < 1 && f.prevX != null) {
    const dx = f.x - f.prevX, dy = f.y - f.prevY;
    if (Math.abs(dx) <= CFG.INTERP_SNAP && Math.abs(dy) <= CFG.INTERP_SNAP) { rx = f.prevX + dx * ra; ry = f.prevY + dy * ra; }
  }

  // ground shadow (afterimage ghosts skip it)
  const air = Math.max(0, CFG.FLOOR_Y - ry);
  if (!game._trailGhost) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(rx, CFG.FLOOR_Y + 6, Math.max(18, 44 - air * 0.08), 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  // hit vibration: jitter the freshly-hit body during the hitstop freeze so the
  // frozen beat reads as a violent impact, not a dropped frame.
  const vib = (game.hitstop > 0 && f.hitFlash > 0) ? (Math.random() - 0.5) * CFG.HIT_VIB : 0;
  ctx.translate(rx + vib, ry);
  if (f.facing === -1) ctx.scale(-1, 1);
  if (look.scale) ctx.scale(look.scale, look.scale);   // bigger silhouette (Xamora — taller/heavier), scaled around the feet
  // Spinning moves (back kick / backfist): a VISUAL 360 — flip away during the
  // wind-up, whip back around as the strike extends. Gameplay facing is untouched.
  if ((key === 'backkick' || key === 'backfist' || key === 'spinelbow' || key === 'tornado') && f.move) {
    const sm = f.move, a = Math.min(1, f.f / (sm.startup + sm.active));
    let sx = Math.cos(a * Math.PI * 2);
    sx = sx >= 0 ? Math.max(0.12, sx) : Math.min(-0.12, sx);
    ctx.scale(sx, 1);
  }
  // Vesper aerials/cines that FLIP the body — rotate inside the save/scale scope.
  if (key === 'scissorkick') { ctx.translate(0, -88); ctx.rotate(Math.PI); }                     // held UPSIDE-DOWN (the scissor invert)
  if (key === 'flipheel') { const fa = Math.min(1, f.f / 12); ctx.translate(0, -70); ctx.rotate(-fa * Math.PI * 2); ctx.translate(0, 70); }      // a full front-flip into the heel
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
    if (f.decapitated) { ctx.fillStyle = '#7b241c'; ctx.beginPath(); ctx.ellipse(28, -16, 11, 8, 0, 0, Math.PI * 2); ctx.fill(); }   // headless — bloody stump
    else { ball(ctx, 28, -16, 15, skin); drawFace(ctx, 28, -16, 0.6, dead, flash); }
    capsule(ctx, 8, -14, 28, 4, 11, body);             // front arm
    if (f.pendingElectric > 0) { drawElectricArcs(ctx, 6, 4, 40, 4); drawElectricArcs(ctx, 22, -14, 26, 3); }   // electricity wreathing a side-spiked body in flight
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
    if (f.decapitated) { ctx.fillStyle = '#7b241c'; ctx.beginPath(); ctx.ellipse(44, -24, 11, 8, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ball(ctx, 44, -24, 15, skin); drawFace(ctx, 44, -24, 0.2, dead, flash); }
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
    if (f.decapitated) { ctx.fillStyle = '#7b241c'; ctx.beginPath(); ctx.ellipse(8, -150, 11, 8, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ball(ctx, 8, -150, 15, skin); drawFace(ctx, 8, -150, 0.4, dead, flash); }
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
    case 'crouch': case 'crouchjab': case 'sweep': case 'gutslash': case 'anklflick': {
      crouchPose(P);
      if (target) strikeTo(P, target, (key === 'crouchjab' || key === 'gutslash') ? 'punch' : 'kick');
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
      } else if (f.superKind === 'combo') {
        // coiled battle stance — rear fist drawn way back, ready to explode forward
        lean(P, 0.16);
        P.handR = { x: -20, y: -118 }; P.handF = { x: 34, y: -130 };
        P.armBendR = 1;
        P.footF.x = 32; P.footR.x = -28;
        P.faceMood = 1;
      } else if (f.superKind === 'wrath') {
        // WRATH OF GOD: staff thrust to the heavens, summoning the storm
        lean(P, -0.12);
        P.handF = { x: 12, y: -214 }; P.handR = { x: -6, y: -190 };
        P.armBendF = -1; P.armBendR = -1;
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
    // SUPER COMBO (attacker): a hard committed strike at each teleport — punch or kick.
    // PISTOL AIM (Vesper ◀P): lead arm punched STRAIGHT out front, sighting down the pistol.
    case 'pistolaim': {
      lean(P, 0.12);
      P.handF = { x: 86, y: -150 };   // lead hand far forward at shoulder height → the IK extends it straight
      P.handR = { x: 6, y: -138 };    // off hand tucked
      P.faceMood = 1;
      break;
    }
    // RIFLE (Vesper ↓K): drops to a KNEE, rifle braced forward and low.
    case 'rifleaim': {
      P.hip.y = -38; P.sho = { x: 6, y: -88 }; P.head = { x: 12, y: -106 };
      P.handF = { x: 72, y: -80 }; P.handR = { x: 40, y: -74 };   // both hands forward on the rifle, low
      P.footF.x = 32; P.footR.x = -36;                            // wide kneel stance
      P.faceMood = 1;
      break;
    }
    // SHOTGUN (Vesper): planted brace — both hands grip the gun forward, no movement. Gun drawn after.
    case 'shotgun': {
      lean(P, 0.16);
      P.handF = { x: 70, y: -148 };   // lead hand on the fore-end (forward)
      P.handR = { x: 34, y: -140 };   // rear hand on the stock/trigger
      P.faceMood = 1;
      break;
    }
    // UP-UZI (Vesper ↑K): bends BACKWARD, both uzis raised to the SKY firing straight up (NOT a kick).
    case 'upuzi': {
      lean(P, -0.32);                                  // arch backward
      P.head.y += 6; P.head.x -= 6; P.sho.x -= 4;
      P.footF.x = 24; P.footR.x = -22;                 // planted wide
      P.handF = { x: 24, y: -212 }; P.handR = { x: 4, y: -206 };   // both hands punched UP at the sky
      P.armBendF = 1; P.armBendR = 1; P.faceMood = 1;
      break;
    }
    // AERIAL UPSLASH (air ↑P): the knife hand rides a SEMICIRCLE over her head (the crescent follows it).
    case 'aerupslash': {
      lean(P, 0.06);
      P.footF = { x: 10, y: -34 }; P.footR = { x: -10, y: -28 }; P.legBendF = -1; P.legBendR = -1;   // legs tucked
      const c2 = f.move ? Math.min(1, Math.max(0, (f.f - 3) / 16)) : 1;   // 0..1 across the sweep
      const ang = Math.PI * (1.15 - 1.15 * c2);          // back-low → straight up → front-low
      P.handF = { x: Math.cos(ang) * 60, y: -156 - Math.sin(ang) * 64 };
      P.armBendF = 1; P.handR = { x: 8, y: -120 };
      P.trail = { to: P.handF, isLeg: false }; P.faceMood = 1;
      break;
    }
    // SLASH REKKA link 2 (neutral-P): a forward SEMICIRCLE ARC — the knife hand sweeps high-back → over → forward.
    case 'slasharc': {
      lean(P, 0.12);
      const ca = f.move ? Math.min(1, Math.max(0, (f.f - f.move.startup) / Math.max(1, f.move.active))) : 0.5;
      const ang = (1 - ca) * Math.PI * 0.92;               // 0.92π (up-back) → 0 (forward)
      P.handF = { x: 24 + Math.cos(ang) * 54, y: -150 - Math.sin(ang) * 54 };   // rides the front arc
      P.armBendF = 1; P.handR = { x: 10, y: -120 };
      P.trail = { to: P.handF, isLeg: false }; P.faceMood = 1;
      break;
    }
    // SLASH REKKA link 3 (neutral-P): an UPWARD back-hand cut — low-front up to high-back (opposite diagonal).
    case 'slashup': {
      lean(P, -0.05);
      const cu = f.move ? Math.min(1, Math.max(0, (f.f - f.move.startup) / Math.max(1, f.move.active))) : 0.5;
      P.handF = { x: 56 - 78 * cu, y: -120 - 84 * cu };     // low-front (56,-120) → high-back (-22,-204)
      P.armBendF = 1; P.handR = { x: 14, y: -110 };
      P.sho.x -= 5 * cu; P.head.x -= 4 * cu;                // lean back into the rising cut
      P.trail = { to: P.handF, isLeg: false }; P.faceMood = 1;
      break;
    }
    // ── XAMORA STAFF poses (the staff is drawn through handF→handR; these aim it) ──
    case 'staffswing': {   // Staff Swat: a BIG horizontal SWING (high-back → forward-low) that swats them back
      lean(P, 0.16);
      const cw = f.move ? Math.min(1, Math.max(0, (f.f - f.move.startup) / Math.max(1, f.move.active))) : 0.5;
      P.handR = { x: 4 - cw * 12, y: -120 };
      P.handF = { x: -10 + cw * 84, y: -162 + cw * 54 };    // sweeps a wide arc from up-back to forward-down
      P.armBendF = 1; P.faceMood = 1; P.trail = { to: P.handF, isLeg: false };
      break;
    }
    case 'staffthrust': {  // Extend Thrust / Spear Flurry: a straight two-handed THRUST forward at CHEST level
      lean(P, 0.22);
      const ct = f.move ? Math.min(1, Math.max(0, (f.f - f.move.startup) / Math.max(1, f.move.active))) : 1;
      P.handR = { x: 10, y: -116 };
      P.handF = { x: 30 + ct * 30, y: -114 };               // front grip drives forward at chest / just-below-chest height
      P.armBendF = -1; P.faceMood = 1; P.trail = { to: P.handF, isLeg: false };
      break;
    }
    case 'staffslam': {    // Crescent Slam: CHARGE the staff high overhead (rear way back), then SLAM it to the floor
      const su = f.move ? f.move.startup : 20, ac = f.move ? f.move.active : 6;
      if (f.move && f.f <= su) { const u = f.f / su; lean(P, -0.24 * u); P.head.x -= 5 * u; P.sho.x -= 7 * u; P.handR = { x: -8, y: -156 - u * 42 }; P.handF = { x: 0, y: -212 - u * 58 }; }   // gathering power, tip climbs high
      else { const cc = f.move ? Math.min(1, (f.f - su) / ac) : 1; lean(P, 0.30 + 0.22 * cc); P.handR = { x: 18, y: -150 + cc * 36 }; P.handF = { x: 44 + cc * 36, y: -118 + cc * 112 }; }   // smashes to the floor with authority
      P.armBendF = 1; P.faceMood = 1; P.trail = { to: P.handF, isLeg: false };
      break;
    }
    case 'staffsweeplow': {  // Staff Sweep: crouch and sweep the staff LOW along the ground
      crouchPose(P); lean(P, 0.1);
      const cs = f.move ? Math.min(1, Math.max(0, (f.f - f.move.startup) / Math.max(1, f.move.active))) : 0.5;
      P.handR = { x: -6, y: -70 };
      P.handF = { x: 30 + cs * 64, y: -18 };               // front grip sweeps low at ankle height
      P.armBendF = 1; P.faceMood = 1; P.trail = { to: P.handF, isLeg: true };
      break;
    }
    case 'staffvert': {    // Sky Pillar: staff held VERTICAL, extends straight up (anti-air)
      P.handR = { x: 8, y: -120 };
      P.handF = { x: 8, y: -178 };                          // directly above the rear grip → staff vertical
      P.armBendF = 1; P.armBendR = 1; P.faceMood = 1;
      break;
    }
    case 'staffrise': {    // Rising Pole: a low→high upward SWEEP that knocks them airborne
      lean(P, 0.05);
      const cr = f.move ? Math.min(1, Math.max(0, (f.f - f.move.startup) / Math.max(1, f.move.active))) : 0.6;
      P.handR = { x: 6, y: -110 };
      P.handF = { x: 40 - cr * 8, y: -60 - cr * 142 };      // sweeps from low-front up to overhead
      P.armBendF = 1; P.faceMood = 1; P.trail = { to: P.handF, isLeg: false };
      break;
    }
    case 'staffspin': {    // Ring Smash: a big telegraphed WHIRL (interruptible load) then a wide forward smash (side-spike)
      const su = f.move ? f.move.startup : 22, ac = f.move ? f.move.active : 6;
      P.handR = { x: 2, y: -120 };
      if (f.move && f.f <= su) { const a = (f.f / su) * Math.PI * 5; lean(P, 0.04); P.handF = { x: Math.cos(a) * 54, y: -130 + Math.sin(a) * 54 }; }   // the staff whirls overhead
      else { const cc = f.move ? Math.min(1, (f.f - su) / ac) : 1; lean(P, 0.3); P.handF = { x: 30 + cc * 62, y: -150 + cc * 22 }; }   // a wide forward smash
      P.armBendF = 1; P.faceMood = 1; P.trail = { to: P.handF, isLeg: false };
      break;
    }
    // SCISSOR KICK (air ↑K): held UPSIDE-DOWN (rotated 180° above), so local +y renders UP. Legs are
    // authored DOWN (positive y) so the flip kicks them toward the SKY; the scissor alternates them.
    case 'scissorkick': {
      const s = Math.sin(f.f * 0.55) * 28;
      P.footF = { x: 14, y: 46 + s }; P.footR = { x: -14, y: 46 - s };   // → flip → legs kick UP, scissoring
      P.legBendF = 1; P.legBendR = 1;
      P.handF = { x: 24, y: -116 }; P.handR = { x: 10, y: -108 };
      P.faceMood = 1;
      break;
    }
    // FRONT-FLIP HEEL (kickcombo): body flipped (rotated above); heel whips straight DOWN.
    case 'flipheel': {
      P.footF = { x: 30, y: -150 }; P.legBendF = -1;
      P.footR = { x: -16, y: -36 }; P.legBendR = -1;
      P.handF = { x: 10, y: -118 }; P.handR = { x: -6, y: -110 };
      P.faceMood = 1; P.trail = { to: { x: 30, y: -150 }, isLeg: true };
      break;
    }
    // SIDE KICK: chamber → straight thrusting side kick that shoves them back.
    // Normalizes over the real move's frames (front-kick combo ender); falls back to the old
    // cine windup if it's ever driven without a move.
    case 'sidekick': {
      const skDur = f.move ? (f.move.startup + f.move.active + f.move.recovery) : (CFG.KICKFOLLOW_WINDUP || 7);
      const t = Math.min(1, f.f / skDur);
      const e = t * t * (3 - 2 * t);                     // smoothstep chamber→extend
      lean(P, 0.05 + 0.05 * e); P.sho.x -= 6 * e; P.head.x -= 4 * e;   // torso chambers side-on, then drives in
      const fx = 26 + (84 - 26) * e;                     // knee tucked → leg snapped straight out at hip height
      P.footF = { x: fx, y: -76 }; P.legBendF = e > 0.4 ? -1 : 1;
      P.handF = { x: -10, y: -120 }; P.handR = { x: 8 - 6 * e, y: -108 };
      P.faceMood = 1; if (e > 0.5) P.trail = { to: { x: fx, y: -76 }, isLeg: true };
      break;
    }
    // EXECUTION: Vesper stepped back, the off-hand SIDEARM leveled at the kneeling victim.
    case 'execpistol': {
      lean(P, -0.04); P.footR.x = -30; P.footF.x = 18;   // weight back
      P.handR = { x: 84, y: -148 }; P.handF = { x: 10, y: -132 };   // handR = off-hand sidearm (drawn by dualWield), extended
      P.faceMood = 1;
      break;
    }
    // EXECUTION victim: locked on one knee, arms hanging.
    case 'execkneel': {
      crouchPose(P); P.hip.y = -36; P.footR = { x: -16, y: 0 }; P.legBendR = -1; P.footF = { x: 16, y: 0 }; P.legBendF = -1;
      P.sho.x -= 4; P.head.x -= 4; P.head.y += 6;
      P.handF = { x: -4, y: -56 }; P.handR = { x: 6, y: -64 };
      P.faceMood = -1;
      break;
    }
    // SKEET launching kick: a rising scoop kick that pops the 'clay pigeon' up.
    case 'skeetkick': {
      crouchPose(P);
      P.footF = { x: 40, y: -120 }; P.legBendF = 1;      // lead foot scoops UP-forward
      P.handF = { x: 10, y: -118 }; P.handR = { x: -8, y: -110 };
      P.faceMood = 1; P.trail = { to: { x: 40, y: -120 }, isLeg: true };
      break;
    }
    case 'supercombo':
    case 'magiccombo': {   // same teleport strike pose; magiccombo is the shorter auto-flurry
      lean(P, 0.44);
      const tgt = f.comboStrike === 'kick' ? { x: 80, y: -96 } : { x: 80, y: -128 };
      strikeTo(P, tgt, f.comboStrike === 'kick' ? 'kick' : 'punch');
      P.trail = { to: tgt, isLeg: f.comboStrike === 'kick' };
      P.faceMood = 1;
      break;
    }
    // SUPER COMBO finisher (attacker): two-hand grip slashing the blade (drawn after the skeleton).
    case 'swordfinish': {
      lean(P, 0.28);
      P.handF = { x: 46, y: -118 }; P.handR = { x: 30, y: -130 };
      P.armBendF = 1; P.armBendR = 1;
      P.footF.x = 30; P.footR.x = -26;
      P.faceMood = 1;
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
    case 'airpunch': case 'gairjab': case 'gaircross': case 'gairupper': case 'airmachete': case 'skycleave': case 'horizonchop': {
      lean(P, 0.18);
      P.footF = { x: 10, y: -34 }; P.footR = { x: -10, y: -28 };   // legs tucked, airborne
      P.legBendF = -1; P.legBendR = -1;   // knees bow forward (was backward)
      if (target) strikeTo(P, target, 'punch');
      P.faceMood = 1;
      break;
    }
    case 'divekick': case 'stompdive': case 'sawplunge': {
      lean(P, 0.42);                                                // pitched forward into the dive
      P.footR = { x: -6, y: -30 }; P.legBendR = -1;                 // trailing leg tucked (knee forward)
      if (target) strikeTo(P, target, 'kick');                     // lead leg spears down-forward
      P.handF = { x: 24, y: -120 }; P.handR = { x: 4, y: -132 };
      P.faceMood = 1;
      break;
    }
    case 'elbowdrop': case 'gairdown': case 'gravedigger': {
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
    case 'jumpkick': case 'flyknee': case 'airuzi': case 'gairkick': case 'bicyclekick': case 'jetkick': {   // airuzi reuses the jump-kick vector pose as a placeholder until its sprite is assigned
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
    case 'tornado': case 'whipkick': {
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
    case 'dashpunch': case 'dashkick': case 'dashrush': case 'dashslide': case 'runcleave': case 'runtackle': case 'harpoonchop': {
      lean(P, 0.42);   // committed — leaning hard into the lunge
      if (target) strikeTo(P, target, (key === 'dashkick' || key === 'dashslide' || key === 'runtackle') ? 'kick' : 'punch');
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
    case 'overhand': case 'skipsmash': {   // skipsmash: GIIIOOO's short-hop overhead rides the same over-the-top arc (the gazelleHop supplies the hop)
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
    // ── GIIIOOO: the boxer reads — every pose sells hands, footwork, and the weave ──
    case 'gjab': {                     // FLICKER — long lead-arm snap off a side-on stance
      lean(P, 0.12);
      P.handR = { x: 12, y: -140 };    // rear hand GLUED to the chin
      if (target) strikeTo(P, target, 'punch');
      P.faceMood = 1;
      break;
    }
    case 'onetwo': {                   // ONE-TWO — jab then the rear-hand cross, two distinct beats
      lean(P, 0.18);
      const second = (f.hitCount || 0) >= 1;
      if (target) strikeTo(P, target, 'punch', second);
      (second ? P.handF : P.handR).x = 12;   // the other hand stays home
      P.faceMood = 1;
      break;
    }
    case 'checkhook': {                // CHECK HOOK — the SLIP first, then the pivot punch
      const su = mv ? mv.startup : 6;
      if (f.f < su * 0.7) {
        lean(P, -0.3); P.head.x -= 10; P.head.y += 6;                 // head comes off the line
        P.handF = { x: 26, y: -134 }; P.handR = { x: 10, y: -140 };   // guard up through the sway
      } else {
        lean(P, 0.3);
        if (target) strikeTo(P, target, 'punch');
      }
      P.faceMood = 1;
      break;
    }
    case 'shovelhook': {               // SHOVEL HOOKS — alternating short digs to the body
      crouchPose(P); lean(P, 0.24);
      const altS = (f.hitCount || 0) % 2 === 0;
      if (target) strikeTo(P, { x: target.x, y: target.y + (altS ? 4 : -6) }, 'punch', !altS);
      P.faceMood = 1;
      break;
    }
    case 'footjab': case 'footjab2': { // FOOT JAB — tall fencer's posture, the leg snaps straight out
      P.sho.y -= 4;
      guardUp(P);
      if (target) strikeTo(P, target, 'kick');
      P.faceMood = 1;
      break;
    }
    case 'shinrain': {                 // SHIN RAIN — the leg is a piston (action-line overlay sells the blur)
      P.sho.y -= 4;
      guardUp(P);
      const altR = f.f % 2 < 1;
      strikeTo(P, { x: altR ? 80 : 48, y: altR ? -122 : -100 }, 'kick');
      P.faceMood = 1;
      break;
    }
    case 'snaplift': {                 // SNAP LIFT — weight back, the toe FLICKS up past their chin
      lean(P, -0.08);
      strikeTo(P, { x: 34 + 20 * ext, y: -110 - 62 * ext }, 'kick');
      P.faceMood = 1;
      break;
    }
    case 'dempsey': {                  // DEMPSEY ROLL — figure-8 weave, hooks off both sides
      const w = Math.sin(f.f * 0.55);
      lean(P, 0.3);
      P.sho.x += w * 10; P.head.x += w * 14; P.head.y += Math.abs(w) * 6;
      const altD = (f.hitCount || 0) % 2 === 0;
      if (target) strikeTo(P, { x: target.x, y: target.y + (altD ? -8 : 6) }, 'punch', altD);
      P.faceMood = 1;
      break;
    }
    // ── BLACKWILL: heavy blade arcs, the ram, the throwables, the saw ──
    case 'machete': case 'machete2': { // CHOP + BACKSWING — cocked across the body, then the wide arc
      lean(P, 0.26);
      const ret = key === 'machete2';
      if (f.f <= (mv ? mv.startup : 7) * 0.6) {
        P.handF = ret ? { x: 42, y: -150 } : { x: -18, y: -152 };    // wind-up side flips per swing
        P.handR = { x: 8, y: -128 };
      } else if (target) {
        strikeTo(P, target, 'punch');
        P.handR = { x: 4, y: -122 };
      }
      P.faceMood = 1;
      break;
    }
    case 'cleave': case 'sawswing': {  // TWO-HANDED OVERHEAD — hauled high, driven down
      const suC = mv ? mv.startup : 12;
      if (f.f < suC) {
        lean(P, -0.12);
        P.handF = { x: 10, y: -198 }; P.handR = { x: -2, y: -192 };  // both hands OVERHEAD
        P.armBendF = -1; P.armBendR = -1;
      } else {
        lean(P, 0.34);
        P.handF = { x: 58, y: -84 }; P.handR = { x: 44, y: -96 };    // the chop lands out front
        if (target) P.trail = { to: target, isLeg: false };
      }
      P.faceMood = 1;
      break;
    }
    case 'ripperupper': {              // the rising swipe — the blade hand RIDES the arc, shins to sky
      lean(P, 0.24);
      const suR = mv ? mv.startup : 8;
      const eR = Math.max(0, Math.min(1, (f.f - suR) / 11));
      strikeTo(P, { x: 42 - 16 * eR, y: -66 - 138 * eR }, 'punch');
      P.handR = { x: 6, y: -126 };
      P.faceMood = 1;
      break;
    }
    case 'executioner': case 'haymaker': {   // THE HOME RUN — full coil back, then everything into it (GIIIOOO's haymaker shares the arc)
      const suE = mv ? mv.startup : 11;
      if (f.f < suE) {
        lean(P, -0.2); P.sho.x -= 8;
        P.handF = { x: -36, y: -140 }; P.handR = { x: -22, y: -120 };   // blade loaded WAY behind
      } else {
        lean(P, 0.4);
        if (target) strikeTo(P, target, 'punch');
        P.handR = { x: 20, y: -100 };
      }
      P.faceMood = 1;
      break;
    }
    case 'sawsweep': {                 // the chainsaw swept FLAT across — a horizontal wall of teeth
      lean(P, 0.3);
      const suW = mv ? mv.startup : 10;
      const eW = Math.max(0, Math.min(1, (f.f - suW * 0.4) / (suW * 0.6 + 4)));
      const angW = -1.0 + eW * 1.15;                 // wound back across the body → swept out front
      P.handR = { x: 0 - Math.cos(angW) * 8, y: -122 };
      P.handF = { x: 14 + Math.cos(angW) * 36, y: -118 + Math.sin(angW) * 22 };
      P.faceMood = 1;
      break;
    }
    case 'grenadetoss': case 'airfrag': {   // THE LOB — rear arm arcs over the top (holds while cooking)
      lean(P, 0.1 + ext * 0.15);
      P.handR = { x: -16 + ext * 66, y: -150 - Math.sin(ext * Math.PI) * 42 };
      P.armBendR = -1;
      P.handF = { x: 26, y: -120 };
      P.faceMood = 1;
      break;
    }
    case 'molotovtoss': {              // UNDERHAND — the bottle slung LOW, released flat and far
      lean(P, 0.18 + ext * 0.12);
      P.handR = { x: -22 + ext * 76, y: -58 - ext * 48 };   // low swing → flat forward release
      P.armBendR = 1;
      P.handF = { x: 24, y: -122 };
      P.faceMood = 1;
      break;
    }
    case 'curbstomp': {                // knee hauled HIGH, then driven straight down
      if (f.f < (mv ? mv.startup : 9) * 0.8) {
        lean(P, -0.06);
        P.footF = { x: 18, y: -72 }; P.legBendF = 1;
      } else {
        lean(P, 0.2);
        strikeTo(P, { x: 30, y: -18 }, 'kick');
      }
      P.faceMood = 1;
      break;
    }
    case 'dropkick': {                 // both boots forward, body laid flat behind them
      lean(P, 0.55);
      P.footF = { x: 52, y: -100 }; P.footR = { x: 46, y: -86 };   // double boots OUT
      P.legBendF = -1; P.legBendR = -1;
      P.handF = { x: -14, y: -130 }; P.handR = { x: -26, y: -116 };   // arms trail behind
      P.faceMood = 1;
      break;
    }
    case 'bodysplash': {               // the falling wall — limbs SPREAD
      lean(P, 0.32);
      P.handF = { x: 34, y: -160 }; P.handR = { x: -22, y: -158 };
      P.armBendF = -1; P.armBendR = -1;
      P.footF = { x: 26, y: -20 }; P.footR = { x: -24, y: -16 };
      P.faceMood = 1;
      break;
    }
    case 'sawgrab': {                  // holding them ON the saw — the whole body rattles with it
      const jitA = (f.animClock % 2) * 2 - 1;
      lean(P, 0.3);
      P.handF = { x: 44 + jitA, y: -110 + jitA }; P.handR = { x: 30 - jitA, y: -118 };
      P.footF.x = 30; P.footR.x = -26;
      P.faceMood = 1;
      break;
    }
    case 'sawgrabbed': {               // the victim: convulsing on the blade, hands clawing at it
      const jitV = (f.animClock % 2) * 2 - 1;
      lean(P, -0.2);
      P.sho.x += jitV * 2; P.head.x += jitV * 3;
      P.handF = { x: 30, y: -120 }; P.handR = { x: 22, y: -100 };
      P.armBendF = -1;
      P.faceMood = -1;
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

  drawSkeleton(ctx, P, { body, dark, glove, boot, skin, dead, flash, key, look, animClock: f.animClock, superKind: f.superKind, superF: f.f, weapon: f.move && f.move.weapon, gun: f.move && f.move.gun, strikeRear: f.move && f.move.strikeHand === 'rear', mvActive: (mv && f.f > mv.startup && f.f <= mv.startup + Math.min(mv.active, 9)) || key === 'supercombo' || key === 'magiccombo' });

  // ── elemental / motion overlays (drawn over the body, in local space) ──
  if (key === 'overhand') drawElectricArcs(ctx, P.handR.x, P.handR.y, 22, 4);   // the charged fist crackles blue
  if (key === 'electrified' || f.pendingElectric > 0) {                         // seizing OR an armed body (e.g. wall-splatted) wreathed in lightning
    drawElectricArcs(ctx, 0, -CFG.BODY_H * 0.5, 44, 4);
    drawElectricArcs(ctx, 0, -CFG.BODY_H * 0.8, 30, 3);
  }
  if (key === 'machinegun' || key === 'dempsey') { drawActionLines(ctx, P.handF.x, P.handF.y, 1); drawActionLines(ctx, P.handR.x, P.handR.y, 1); }
  if (key === 'shinrain') { drawActionLines(ctx, P.footF.x, P.footF.y, 1); drawActionLines(ctx, P.footF.x + 10, P.footF.y - 14, 1); }   // the leg is a BLUR
  if (f.rampage > 0) {   // MINDLESS RAMPAGE aura — barely-contained energy arcs off the body
    drawElectricArcs(ctx, 0, -CFG.BODY_H * 0.55, 36, 3);
    drawElectricArcs(ctx, 10, -CFG.BODY_H * 0.85, 22, 2);
  }
  if (key === 'swordfinish') drawSword(ctx, P.handF.x, P.handF.y, f.f, f.swordWind);   // the blade + slash sweep

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

// Xamora's angel wings — two layered feather-fans sweeping up-and-back behind the body (side view).
function drawWings(ctx, P, c) {
  const bx = P.sho.x - 8, by = P.sho.y + 6;
  for (const layer of [{ o: 7, col: 'rgba(206,210,228,0.85)' }, { o: 0, col: 'rgba(246,248,253,0.95)' }]) {
    for (let k = 0; k < 4; k++) {
      const ex = bx - 16 - k * 16, ey = by - 34 + k * 20;
      capsule(ctx, bx + layer.o, by, ex + layer.o, ey, 9 - k * 1.5, c.flash ? '#ffffff' : layer.col);
    }
  }
}
function drawSkeleton(ctx, P, c) {
  const ARM = 36, LEG = 44;
  const L = c.look || BRAWLER_LOOK;
  const hairCol = c.flash ? '#ffffff' : L.hair;

  // swing trail ghosts behind the live strike
  if (P.trail && c.mvActive) {
    ctx.save();
    ctx.globalAlpha *= 0.22;
    for (const k of [0.55, 0.78]) {
      const gx = P.trail.isLeg ? P.hip.x : P.sho.x;
      const gy = P.trail.isLeg ? P.hip.y : P.sho.y;
      limbIK(ctx, gx, gy, gx + (P.trail.to.x - gx) * k, gy + (P.trail.to.y - gy) * k,
        P.trail.isLeg ? LEG : ARM, P.trail.isLeg ? P.legBendF : P.armBendF,
        P.trail.isLeg ? L.legW : L.armW, c.body, 0);
    }
    ctx.restore();
  }

  // angel WINGS (Xamora) — drawn first, behind the whole body.
  if (L.wings) drawWings(ctx, P, c);

  // hair behind the head (drawn first so the head overlaps its root). longHair = a flowing
  // ponytail that trails well down the back in two tapering segments.
  if (L.hair) {
    const hx = P.head.x - L.headR * 0.55;
    if (L.longHair) {
      capsule(ctx, hx, P.head.y - 4, hx - 6, P.head.y + 30, 8.5, hairCol);
      capsule(ctx, hx - 6, P.head.y + 30, hx - 1, P.head.y + 64, 7, hairCol);
      capsule(ctx, hx - 1, P.head.y + 64, hx - 7, P.head.y + 98, 5.5, hairCol);   // long flowing tail
    } else {
      capsule(ctx, hx, P.head.y - 2, P.head.x - L.headR * 1.7, P.head.y + 16, 6.5, hairCol);
    }
  }
  // rear limbs (darker — depth)
  limbIK(ctx, P.sho.x - 6, P.sho.y + 4, P.handR.x, P.handR.y, ARM, P.armBendR, L.armWR, c.dark, 8, c.flash ? '#fff' : shade(L.glove, 0.8));
  limbIK(ctx, P.hip.x - 4, P.hip.y + 4, P.footR.x, P.footR.y, LEG, P.legBendR, L.legWR, c.dark, 8.5, shade(c.boot, 0.85));
  // torso: pelvis → chest. female = an HOURGLASS (S-curve side profile: bust bulges forward up
  // top, waist pinches, butt bulges back at the hips); male = the plain capsule (brawler unchanged).
  if (L.female) {
    const ax = P.sho.x - P.hip.x, ay = P.sho.y - P.hip.y, len = Math.hypot(ax, ay) || 1;
    const px = -ay / len, py = ax / len;   // perpendicular: +p = FORWARD (+x-ish), -p = back
    // profile up the torso: [t (hip→sho), frontHalfW, backHalfW] as fractions of torsoW
    const prof = [[0, 0.34, 0.56], [0.30, 0.26, 0.27], [0.58, 0.37, 0.31], [0.82, 0.56, 0.33], [1, 0.42, 0.42]];
    ctx.beginPath();
    for (let i = 0; i < prof.length; i++) { const t = prof[i][0], fw = prof[i][1] * L.torsoW; const cx = P.hip.x + ax * t, cy = P.hip.y + ay * t; const x = cx + px * fw, y = cy + py * fw; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = prof.length - 1; i >= 0; i--) { const t = prof[i][0], bw = prof[i][2] * L.torsoW; const cx = P.hip.x + ax * t, cy = P.hip.y + ay * t; ctx.lineTo(cx - px * bw, cy - py * bw); }
    ctx.closePath();
    ctx.lineJoin = 'round'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4.5; ctx.stroke();   // outline behind
    ctx.fillStyle = c.body; ctx.fill();
  } else {
    capsule(ctx, P.hip.x, P.hip.y, P.sho.x, P.sho.y, L.torsoW, c.body);
  }
  // female: a short skirt/coat flare at the hips
  if (L.female) {
    ctx.fillStyle = c.dark; ctx.beginPath();
    ctx.moveTo(P.hip.x - L.torsoW * 0.45, P.hip.y - 2);
    ctx.lineTo(P.hip.x + L.torsoW * 0.7, P.hip.y - 4);
    ctx.lineTo(P.hip.x + L.torsoW * 0.5, P.hip.y + 22);
    ctx.lineTo(P.hip.x - L.torsoW * 0.7, P.hip.y + 20);
    ctx.closePath(); ctx.fill();
  }
  ball(ctx, P.hip.x, P.hip.y + 2, L.female ? 12 : 15, c.dark);   // trunks / waist
  // front leg
  limbIK(ctx, P.hip.x + 4, P.hip.y + 2, P.footF.x, P.footF.y, LEG, P.legBendF, L.legW, c.body, 9, c.boot);
  // head + face
  ball(ctx, P.head.x, P.head.y, L.headR, c.skin);
  // female: hair crown/fringe over the top + back of the skull (not the face, which sits lower-front)
  if (L.hair) {
    ctx.fillStyle = hairCol;
    ctx.beginPath(); ctx.ellipse(P.head.x - 2, P.head.y - L.headR * 0.45, L.headR * 1.05, L.headR * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(P.head.x - L.headR * 0.75, P.head.y, L.headR * 0.5, L.headR * 0.95, 0, 0, Math.PI * 2); ctx.fill();   // sideburn down the back
  }
  drawFace(ctx, P.head.x, P.head.y, P.faceMood, c.dead, c.flash);
  // Matrix shades: a sleek dark lens over the forward eye + a temple arm running back to the hair.
  if (L.shades) {
    const ex = P.head.x + L.headR * 0.42, ey = P.head.y - L.headR * 0.05;
    ctx.fillStyle = c.flash ? '#ffffff' : '#0b0b10';
    ctx.beginPath(); ctx.ellipse(ex, ey, L.headR * 0.46, L.headR * 0.30, -0.12, 0, Math.PI * 2); ctx.fill();   // lens
    ctx.strokeStyle = c.flash ? '#ffffff' : '#0b0b10'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ex - L.headR * 0.3, ey - 2); ctx.lineTo(P.head.x - L.headR * 0.9, ey - 4); ctx.stroke();   // temple arm
    ctx.fillStyle = c.flash ? '#ffffff' : 'rgba(150,180,255,0.35)';   // a faint glint
    ctx.beginPath(); ctx.ellipse(ex + 1, ey - 2, L.headR * 0.16, L.headR * 0.1, -0.12, 0, Math.PI * 2); ctx.fill();
  }
  // front arm + glove
  limbIK(ctx, P.sho.x + 5, P.sho.y + 2, P.handF.x, P.handF.y, ARM, P.armBendF, L.armW, c.body, 8.5, c.glove);
  // WEAPONS (Vesper dual-wields): the active weapon in the lead hand (+ slash line / muzzle flash
  // on its active frames), and a sidearm resting in the off hand. dualWield → the lead hand is
  // never empty (knife by default). Brawler: no weapon, no dualWield → nothing draws.
  // SCORCHED EARTH: he visibly holds the launchers — the MGL through the barrage phase,
  // then the Carl Gustav shouldered for the rocket.
  const scorchedPhase = (c.key === 'superstart' && c.superKind === 'scorched')
    ? (c.superF < CFG.SUPER_STARTUP + CFG.SCORCHED_NADES * CFG.SCORCHED_NADE_INTERVAL + 4 ? 'mgl' : 'gustav') : null;
  const activeW = (c.key === 'sawgrab') ? 'saw' : scorchedPhase || c.weapon || (L.dualWield ? 'knife' : (L.staffWeapon ? 'staff' : (L.macheteIdle ? 'machete' : null)));
  const aHand = c.strikeRear ? P.handR : P.handF;   // the STRIKING hand — weapon + slash line + muzzle
  const oHand = c.strikeRear ? P.handF : P.handR;   // the OFF hand — the resting sidearm
  if (activeW === 'staff') {
    // a long BO STAFF gripped in BOTH hands (grip→tip direction = handF − handR), extending past the front grip.
    const fx = P.handF.x, fy = P.handF.y, rx = P.handR.x, ry = P.handR.y;
    let ux = fx - rx, uy = fy - ry; const dd = Math.hypot(ux, uy) || 1; ux /= dd; uy /= dd;
    const longStaff = c.key === 'staffthrust' || c.key === 'staffvert';   // the EXTEND moves reach far
    const reach = c.mvActive ? (longStaff ? 262 : 152) : 92;
    const tx = fx + ux * reach, ty = fy + uy * reach, bx = rx - ux * 46, by = ry - uy * 46;
    capsule(ctx, bx, by, tx, ty, 5, c.flash ? '#ffffff' : '#7a5a36');                         // shaft through both grips
    capsule(ctx, tx - ux * 12, ty - uy * 12, tx, ty, 6.5, c.flash ? '#ffffff' : '#caa64a');    // gold tip cap
    capsule(ctx, bx, by, bx + ux * 10, by + uy * 10, 6.5, c.flash ? '#ffffff' : '#caa64a');    // gold butt cap
    if (c.key === 'staffrise') {   // RISING POLE — the staff tip is ABLAZE (flames lick up off the tip)
      for (let k = 0; k < 6; k++) {
        const fxk = tx + (Math.random() - 0.5) * 7, fyk = ty - k * 6 - Math.random() * 5;     // fire rises off the tip
        ctx.fillStyle = k < 2 ? 'rgba(255,236,150,0.92)' : k < 4 ? 'rgba(255,150,40,0.85)' : 'rgba(220,70,25,0.7)';
        ctx.beginPath(); ctx.arc(fxk, fyk, Math.max(1.5, (7 - k) * (0.7 + Math.random() * 0.5)), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  } else if (c.key === 'upuzi') {
    // DUAL UZIS raised to the SKY, firing straight up (replaces the default knife + forward muzzle).
    for (const h of [P.handF, P.handR]) {
      capsule(ctx, h.x, h.y, h.x, h.y - 20, 5, c.flash ? '#ffffff' : '#24242c');             // uzi body, pointing up
      capsule(ctx, h.x, h.y + 2, h.x + 3, h.y + 12, 3.5, c.flash ? '#ffffff' : '#1a1a20');   // stubby magazine
      if (c.mvActive) {
        ctx.fillStyle = c.flash ? '#ffffff' : '#ffe9a0'; ctx.beginPath(); ctx.arc(h.x, h.y - 22, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,233,150,0.85)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        for (const a of [-0.5, -0.15, 0.15, 0.5]) { ctx.beginPath(); ctx.moveTo(h.x, h.y - 22); ctx.lineTo(h.x + Math.sin(a) * 12, h.y - 22 - Math.cos(a) * 12); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,240,180,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(h.x, h.y - 22); ctx.lineTo(h.x, h.y - 90); ctx.stroke();   // tracer straight UP
      }
    }
  } else if (activeW === 'knife') {
    const hx = aHand.x, hy = aHand.y;
    let ux = hx - P.sho.x, uy = hy - P.sho.y; const d = Math.hypot(ux, uy) || 1; ux /= d; uy /= d;   // blade-pointing dir
    const ang = Math.atan2(uy, ux);
    capsule(ctx, hx, hy, hx + ux * 22, hy + uy * 22, 4, c.flash ? '#ffffff' : '#d7dde6');   // blade
    capsule(ctx, hx - uy * 5, hy + ux * 5, hx + uy * 5, hy - ux * 5, 3, c.flash ? '#ffffff' : '#3a3a44');   // crossguard
    if (c.mvActive) {   // SLASH LINE — bright crescent trailing the blade's sweep
      ctx.lineCap = 'round';
      ctx.strokeStyle = c.flash ? '#ffffff' : 'rgba(195,242,255,0.9)'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(hx, hy, 30, ang - 0.95, ang + 0.55); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hx, hy, 37, ang - 0.75, ang + 0.35); ctx.stroke();
    }
  } else if (activeW === 'machete') {
    // BLACKWILL's MACHETE — a BIG single-edge blade (2.5x the knife), heavy chop arc on actives.
    const hx = aHand.x, hy = aHand.y;
    let ux = hx - P.sho.x, uy = hy - P.sho.y; const d = Math.hypot(ux, uy) || 1; ux /= d; uy /= d;
    const ang = Math.atan2(uy, ux);
    capsule(ctx, hx, hy, hx + ux * 52, hy + uy * 52, 7, c.flash ? '#ffffff' : '#c9cfd8');                    // the blade
    capsule(ctx, hx + ux * 28, hy + uy * 28, hx + ux * 52, hy + uy * 52, 4, c.flash ? '#ffffff' : '#eef2f7'); // edge highlight
    capsule(ctx, hx - uy * 6, hy + ux * 6, hx + uy * 6, hy - ux * 6, 4, c.flash ? '#ffffff' : '#3a3128');     // guard
    if (c.mvActive) {   // HEAVY chop arc — wider and hotter than the knife's slash line
      ctx.lineCap = 'round';
      ctx.strokeStyle = c.flash ? '#ffffff' : 'rgba(255,244,214,0.9)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(hx, hy, 54, ang - 1.05, ang + 0.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, hy, 64, ang - 0.8, ang + 0.3); ctx.stroke();
    }
  } else if (activeW === 'saw') {
    // THE CHAINSAW — engine housing in both hands, bar thrust out, and a chain of teeth that
    // VISIBLY RUNS (offset scrolls with animClock). Rattle-jitter while it bites; exhaust puffs.
    const rev = c.animClock || 0;
    const biting = c.mvActive || c.key === 'sawgrab';
    const jit = biting ? (rev % 2) * 2 - 1 : 0;
    const fx = P.handF.x, fy = P.handF.y + jit, rx0 = P.handR.x, ry0 = P.handR.y + jit;
    let ux = fx - rx0, uy = fy - ry0; const dd = Math.hypot(ux, uy) || 1; ux /= dd; uy /= dd;
    const bx = fx + ux * 6, by = fy + uy * 6;
    const tx = fx + ux * 58, ty = fy + uy * 58;
    capsule(ctx, rx0 - ux * 10, ry0 - uy * 10, fx + ux * 4, fy + uy * 4, 10, c.flash ? '#ffffff' : '#8a2f24');       // engine housing (red)
    capsule(ctx, rx0 - ux * 6, ry0 - uy * 6 - 10, rx0 + ux * 4, ry0 + uy * 4 - 12, 4, c.flash ? '#ffffff' : '#2a2a30'); // top handle
    capsule(ctx, bx, by, tx, ty, 6, c.flash ? '#ffffff' : '#5b6068');                                                 // the BAR
    ctx.fillStyle = c.flash ? '#ffffff' : '#d7dde6';
    for (let k = 0; k < 7; k++) {   // the tooth chain, marching around the bar
      const t = ((k / 7) + (rev % 10) / 10) % 1;
      const px = bx + ux * (t * 50), py = by + uy * (t * 50);
      ctx.fillRect(px - uy * 8 - 1.5, py + ux * 8 - 1.5, 3, 3);
      ctx.fillRect(px + uy * 8 - 1.5, py - ux * 8 - 1.5, 3, 3);
    }
    if (biting) {
      ctx.fillStyle = 'rgba(130,130,138,0.5)';   // two-stroke exhaust
      ctx.beginPath(); ctx.arc(rx0 - ux * 16, ry0 - uy * 16 - 12 - (rev % 8), 4 + (rev % 8) * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,120,0.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round';   // grind sparks off the tip
      for (const a of [-0.7, -0.2, 0.4]) { ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a) * 12, ty - Math.abs(Math.sin(a)) * 12); ctx.stroke(); }
    }
  } else if (activeW === 'mgl') {
    // MILKOR MGL — the real silhouette: collapsible stock, pistol grip, a BIG fat drum
    // amidships under a full-length top rail, long barrel + chunky muzzle, vertical foregrip.
    const fx = P.handF.x, fy = P.handF.y, rx = P.handR.x, ry = P.handR.y;
    let ux = fx - rx, uy = fy - ry; const dd = Math.hypot(ux, uy) || 1; ux /= dd; uy /= dd;
    const px = -uy, py = ux;                                    // perpendicular (down = +)
    const gunY = -6;                                            // bore line rides a touch above the grip hands
    const bx = rx + px * gunY, by = ry + py * gunY;             // rear of receiver (above rear grip hand)
    const mx = bx + ux * 78, my = by + uy * 78;                 // muzzle tip
    const g1 = c.flash ? '#ffffff' : '#33363b', g2 = c.flash ? '#ffffff' : '#22252a', g3 = c.flash ? '#ffffff' : '#3f434a';
    // collapsible STOCK: angled back from the receiver with a butt pad
    capsule(ctx, bx, by, bx - ux * 20 - 2, by - uy * 20 - 3, 4, g1);
    capsule(ctx, bx - ux * 22 - 2, by - uy * 22 - 8, bx - ux * 22 - 2, by - uy * 22 + 6, 4.5, g2);
    // full-length TOP RAIL / receiver spine
    capsule(ctx, bx, by, mx - ux * 10, my - uy * 10, 3.5, g1);
    // the DRUM — the big fat cylinder amidships (side view: a thick rounded slab)
    const dcx = bx + ux * 34, dcy = by + uy * 34 + 7;
    capsule(ctx, dcx - ux * 12, dcy - uy * 12, dcx + ux * 12, dcy + uy * 12, 13, g3);
    ctx.strokeStyle = c.flash ? '#dddddd' : '#1c1f24'; ctx.lineWidth = 2;   // chamber seams (they crawl as it revolves)
    const seamShift = ((c.animClock || 0) * 0.8) % 8;
    for (let k = -1; k <= 1; k++) {
      const sxx = dcx + ux * (k * 8 + seamShift - 4), syy = dcy + uy * (k * 8 + seamShift - 4);
      ctx.beginPath(); ctx.moveTo(sxx - px * 11, syy - py * 11); ctx.lineTo(sxx + px * 11, syy + py * 11); ctx.stroke();
    }
    // BARREL forward of the drum + chunky muzzle
    capsule(ctx, dcx + ux * 14, dcy + uy * 14 - 4, mx, my, 4.5, g1);
    capsule(ctx, mx - ux * 9, my - uy * 9, mx, my, 6, g2);
    // PISTOL GRIP under the receiver (rear hand) + vertical FOREGRIP (front hand)
    capsule(ctx, bx + ux * 6, by + uy * 6, rx, ry, 3.5, g2);
    capsule(ctx, mx - ux * 26, my - uy * 26, fx, fy, 3.5, g2);
    // SIGHT unit on top
    capsule(ctx, dcx + ux * 2 - px * 20, dcy + uy * 2 - py * 20, dcx + ux * 10 - px * 20, dcy + uy * 10 - py * 20, 3.5, g2);
    const t0 = CFG.SUPER_STARTUP;
    if (c.superF >= t0 && ((c.superF - t0) % CFG.SCORCHED_NADE_INTERVAL) < 3) {   // the THUMP flash
      ctx.fillStyle = c.flash ? '#ffffff' : '#ffe9a0'; ctx.beginPath(); ctx.arc(mx + ux * 4, my + uy * 4, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,233,150,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const a of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a) * 18, my + Math.sin(a) * 18); ctx.stroke(); }
    }
  } else if (activeW === 'gustav') {
    // CARL GUSTAV — the recoilless rifle SHOULDERED: long fat tube, rear venturi cone, back-blast.
    const sx = P.sho.x - 28, sy = P.sho.y - 7;
    const tx = P.sho.x + 56, ty = P.sho.y - 9;
    capsule(ctx, sx, sy, tx, ty, 8, c.flash ? '#ffffff' : '#4a4d3c');                                    // the tube (OD green)
    capsule(ctx, tx - 8, ty - 1, tx, ty, 9.5, c.flash ? '#ffffff' : '#3a3d30');                          // muzzle ring
    ctx.fillStyle = c.flash ? '#ffffff' : '#3a3d30';                                                     // rear VENTURI cone
    ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.lineTo(sx - 13, sy - 10); ctx.lineTo(sx - 13, sy + 10); ctx.lineTo(sx, sy + 6); ctx.closePath(); ctx.fill();
    capsule(ctx, sx + 26, sy + 8, sx + 26, sy + 18, 3.5, c.flash ? '#ffffff' : '#33363a');               // grip post
    const rocketF = CFG.SUPER_STARTUP + CFG.SCORCHED_NADES * CFG.SCORCHED_NADE_INTERVAL + CFG.SCORCHED_ROCKET_DELAY;
    if (Math.abs(c.superF - rocketF) < 5) {                                                              // FIRE: muzzle bloom + the back-blast
      ctx.fillStyle = c.flash ? '#ffffff' : '#ffe9a0'; ctx.beginPath(); ctx.arc(tx + 6, ty, 13, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 1; k <= 4; k++) fxBlock(ctx, sx - 14 - k * 9, sy + (Math.random() - 0.5) * 8, 6 - k, k < 2 ? '#fff3c8' : '#ff9a36', 0.8 - k * 0.15);   // BACK-BLAST
      ctx.globalCompositeOperation = 'source-over';
    }
  } else if (activeW === 'pistol') {
    const hx = aHand.x, hy = aHand.y;
    let ux = hx - P.sho.x, uy = hy - P.sho.y; const d = Math.hypot(ux, uy) || 1; ux /= d; uy /= d;
    capsule(ctx, hx, hy, hx + ux * 15, hy + uy * 15, 5.5, c.flash ? '#ffffff' : '#24242c');   // slide/barrel
    capsule(ctx, hx, hy, hx - ux * 4 + uy * 9, hy - uy * 4 - ux * 9, 4.5, c.flash ? '#ffffff' : '#15151b');   // grip
  } else if (activeW === 'shotgun') {
    // a long pump shotgun gripped in both hands, pointed FORWARD (+x). Big blast on the active frames.
    const fx = P.handF.x, fy = P.handF.y, rx = P.handR.x, ry = P.handR.y;
    const tipx = fx + 46, tipy = fy - 2;
    capsule(ctx, rx - 6, ry + 6, fx + 4, fy + 4, 9, c.flash ? '#ffffff' : '#6b4a30');   // wood stock + fore-end
    capsule(ctx, rx, ry, tipx, tipy, 6.5, c.flash ? '#ffffff' : '#2b2b32');             // steel barrel
    capsule(ctx, rx + 4, ry + 4, tipx - 16, tipy + 4, 4, c.flash ? '#ffffff' : '#23232a'); // pump/tube
    if (c.mvActive) {   // THE BLAST — big muzzle flash + a wide forward spread cone (its long range)
      ctx.fillStyle = c.flash ? '#ffffff' : '#ffe27a'; ctx.beginPath(); ctx.arc(tipx, tipy, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,120,0.92)'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
      for (const a of [-0.5, -0.22, 0, 0.22, 0.5]) { ctx.beginPath(); ctx.moveTo(tipx, tipy); ctx.lineTo(tipx + Math.cos(a) * 165, tipy + Math.sin(a) * 165); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,240,180,0.5)';
      for (let k = 0; k < 10; k++) { const a = (Math.random() - 0.5), r = 40 + Math.random() * 130; ctx.beginPath(); ctx.arc(tipx + Math.cos(a) * r, tipy + Math.sin(a) * r, 2.2, 0, Math.PI * 2); ctx.fill(); }
    }
  } else if (activeW === 'rifle') {
    // an assault rifle braced in both hands, pointed FORWARD; small muzzle flashes on the burst.
    const fx = P.handF.x, fy = P.handF.y, rx = P.handR.x, ry = P.handR.y;
    const tipx = fx + 50, tipy = fy - 1;
    capsule(ctx, rx - 4, ry + 5, fx + 2, fy + 3, 7, c.flash ? '#ffffff' : '#33373b');   // body/stock
    capsule(ctx, rx + 2, ry, tipx, tipy, 4.5, c.flash ? '#ffffff' : '#202327');          // barrel
    capsule(ctx, rx + 8, ry + 7, rx + 18, ry + 18, 4, c.flash ? '#ffffff' : '#2a2a30');  // magazine
    if (c.mvActive) {
      ctx.fillStyle = c.flash ? '#ffffff' : '#ffe9a0'; ctx.beginPath(); ctx.arc(tipx, tipy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,233,150,0.85)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (const a of [-0.25, 0, 0.25]) { ctx.beginPath(); ctx.moveTo(tipx, tipy); ctx.lineTo(tipx + Math.cos(a) * 16, tipy + Math.sin(a) * 16); ctx.stroke(); }
    }
  }
  // off-hand sidearm: a small pistol resting in the OFF hand (always, so she reads as armed)
  if (L.dualWield && c.key !== 'upuzi') {
    const hx = oHand.x, hy = oHand.y; let ux = hx - P.sho.x, uy = hy - P.sho.y; const d = Math.hypot(ux, uy) || 1; ux /= d; uy /= d;
    capsule(ctx, hx, hy, hx + ux * 11, hy + uy * 11, 4.5, c.flash ? '#ffffff' : shade('#24242c', 0.8));
  }
  // MUZZLE FLASH (gun moves) — ALWAYS fires FORWARD (+x = toward the enemy in local space, since the
  // body is drawn facing +x). Fired from the gun hand: the LEAD hand on the point-blank shot
  // (weapon:'pistol'), the OFF-hand sidearm during gun-kata kicks. Fixes the old "shoots backward".
  if (c.mvActive && c.gun && c.key !== 'upuzi') {
    const gh = c.weapon ? aHand : oHand;   // hand-shot fires from the strike hand; kicks from the off-hand sidearm
    const mx = gh.x + 18, my = gh.y;
    ctx.fillStyle = c.flash ? '#ffffff' : '#ffe9a0'; ctx.beginPath(); ctx.arc(mx, my, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,233,150,0.9)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (const a of [-0.6, -0.2, 0.2, 0.6]) { ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a) * 14, my + Math.sin(a) * 14); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,240,180,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 78, my); ctx.stroke();   // tracer straight forward
  }
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
  // ── BLACKWILL's arsenal ──
  if (p.kind === 'molotov') {   // tumbling bottle with a lit rag
    const a = p.age * 0.35;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
    ctx.fillStyle = '#7a5a2e'; ctx.fillRect(-5, -10, 10, 20);            // the bottle
    ctx.fillStyle = '#3d2c14'; ctx.fillRect(-3, -14, 6, 5);              // the neck
    ctx.restore();
    fxBlock(ctx, p.x + Math.cos(a) * 10, p.y - 14 + Math.sin(a) * 4, 4, '#ff9a36', 0.95);   // the flame
    fxBlock(ctx, p.x + Math.cos(a) * 12, p.y - 18, 3, '#fff3c8', 0.8);
    return;
  }
  if (p.kind === 'grenade') {   // dark ball, red blink accelerating as the fuse runs out
    ctx.fillStyle = '#2c2f2a';
    ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a4f45'; ctx.fillRect(p.x - 2, p.y - 12, 4, 5);
    const blink = p.fuse < 24 ? (p.fuse % 6 < 3) : (p.age % 16 < 4);
    if (blink) fxBlock(ctx, p.x + 3, p.y - 3, 3, '#ff5252', 1);
    return;
  }
  if (p.kind === 'impactnade' || p.kind === 'rocket') {   // SCORCHED EARTH ordnance — mini mech-cannon shells
    const big = p.kind === 'rocket';
    const dd = Math.sign(p.vx) || 1;
    const ang = Math.atan2(p.vy || 0, p.vx || 1);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
    ctx.fillStyle = big ? '#3a3f45' : '#4a4f45';
    ctx.beginPath(); ctx.ellipse(0, 0, big ? 21 : 10, big ? 8 : 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffce78';
    ctx.beginPath(); ctx.ellipse(big ? 13 : 6, 0, big ? 7 : 3.5, big ? 5 : 3, 0, 0, Math.PI * 2); ctx.fill();   // hot tip
    if (big) { ctx.fillStyle = '#8a2f24'; ctx.fillRect(-21, -7, 8, 14); }   // rocket tail band
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';   // exhaust streaming behind
    for (let k = 1; k <= (big ? 5 : 3); k++) fxBlock(ctx, p.x - dd * k * (big ? 11 : 7), p.y + Math.sin(p.age * 0.9 + k) * 2.5, (big ? 5.5 : 3.5) - k * 0.5, k < 2 ? '#fff3c8' : '#ff9a36', 0.85 - k * 0.14);
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  if (p.kind === 'firepool') {   // flickering flame wall along the burning patch
    const life = 1 - p.age / CFG.FIREPOOL_FRAMES;
    ctx.globalCompositeOperation = 'lighter';
    const n = 9;
    for (let i = 0; i < n; i++) {
      const fx = p.x - p.w / 2 + (i + 0.5) * (p.w / n);
      const flick = Math.sin(p.age * 0.5 + i * 1.7) * 0.5 + 0.5;
      const h = (14 + flick * 22) * (0.5 + life * 0.5);
      fxBlock(ctx, fx, CFG.FLOOR_Y - 4 - h, 4 + flick * 3, i % 2 ? '#ff9a36' : '#ff5f2e', 0.55 + flick * 0.35);
      fxBlock(ctx, fx + 2, CFG.FLOOR_Y - 4 - h * 0.55, 4, '#fff3c8', 0.4 + flick * 0.3);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5 * life + 0.2;
    ctx.fillStyle = '#3a1c0c';   // scorched ground
    ctx.beginPath(); ctx.ellipse(p.x, CFG.FLOOR_Y - 2, p.w * 0.55, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  if (p.kind === 'magic' && p.hue === 'shockwave') {   // Rising Pole's SHOCK FRONT — energy arcs rolling forward off the ground
    const d2 = d || 1, cx = p.x, cy = p.y + p.h * 0.55, ca = d2 === 1 ? 0 : Math.PI;
    ctx.save(); ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {   // a hot leading edge with orange ripples trailing the front
      ctx.globalAlpha = 0.9 - k * 0.26;
      ctx.strokeStyle = k === 0 ? '#fff3c8' : '#ff9a36';
      ctx.lineWidth = 7 - k * 1.6;
      ctx.beginPath(); ctx.arc(cx - d2 * k * 16, cy, p.h * (0.78 - k * 0.16), ca - Math.PI * 0.6, ca + Math.PI * 0.6); ctx.stroke();
    }
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffce78';   // scorched ground at the base
    ctx.beginPath(); ctx.ellipse(cx, p.y + p.h, p.w * 0.5, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.restore();
    return;
  }
  if (p.kind === 'magic') {   // a glowing magic orb (Xamora's wisp / tremor)
    const cx = p.x, cy = p.y + p.h / 2, r = Math.max(8, p.w * 0.5);
    const wisp = p.hue !== 'tremor';
    const core = wisp ? '#e2e8ff' : '#ffe2a6', glow = wisp ? 'rgba(150,170,255,1)' : 'rgba(255,150,70,1)';
    ctx.fillStyle = glow;
    for (let k = 3; k >= 1; k--) { ctx.globalAlpha = 0.22 * (4 - k); ctx.beginPath(); ctx.arc(cx, cy, r * (0.6 + k * 0.42), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (p.kind === 'bullet') {   // a bright round + a streak trailing it (size scales with the round)
    const r = Math.max(3.5, p.h * 0.5), tlen = Math.max(24, p.w * 1.5);
    const cy = p.y + p.h / 2, ang = Math.atan2(p.vy || 0, p.vx || (d || 1));
    ctx.strokeStyle = 'rgba(255,238,170,0.7)'; ctx.lineWidth = r * 0.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x, cy); ctx.lineTo(p.x - Math.cos(ang) * tlen, cy - Math.sin(ang) * tlen); ctx.stroke();   // tracer behind it
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(p.x, cy, r, 0, Math.PI * 2); ctx.fill();   // round
    return;
  }
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

// ── STAGE BACKGROUND (photo) — "cover"-scaled so it fills the stage with no empty space; its floor line is pinned to FLOOR_Y ──
const STAGE_BG = { ready: false, img: null };
const BG_FLOOR_FRAC = 0.85;    // image fraction pinned to FLOOR_Y. Platform front edge is ~0.897, so <0.897 seats the feet ON TOP of the platform with floor visible below (LOWER FRAC = lower stage). Gap-free range at zoom 1.0 is ~0.67–0.917.
const BG_ZOOM = 1.0;           // extra scale over "cover" (>1 crops sides/top; only needed to push the floor ABOVE 0.917 gap-free)
function loadStageBg() {
  const img = new Image();
  img.onload = () => { STAGE_BG.img = img; STAGE_BG.ready = true; };
  img.onerror = () => { STAGE_BG.ready = false; };
  img.src = 'assets/stages/foundry.png';
}
if (typeof Image !== 'undefined') loadStageBg();

function drawStageBg(ctx) {
  const img = STAGE_BG.img, iw = img.width, ih = img.height;
  const scale = Math.max(CFG.STAGE_W / iw, CFG.STAGE_H / ih) * BG_ZOOM;   // cover (×zoom): always fills, overflow cropped
  const dw = iw * scale, dh = ih * scale;
  const dx = (CFG.STAGE_W - dw) / 2;                            // center horizontally
  const dy = CFG.FLOOR_Y - BG_FLOOR_FRAC * ih * scale;          // pin the image's floor seam to the gameplay floor
  ctx.drawImage(img, dx, dy, dw, dh);
  // vignette to frame the action + match the old mood
  const v = ctx.createRadialGradient(CFG.STAGE_W / 2, CFG.STAGE_H / 2, 380, CFG.STAGE_W / 2, CFG.STAGE_H / 2, 860);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
}

function drawStage(ctx) {
  if (STAGE_BG.ready && STAGE_BG.img) return drawStageBg(ctx);   // photo stage; falls through to the vector stage until it loads
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
    const kick = (game.shakeDir || 0) * game.shake;   // directional camera lurch (wall spike kicks away from the wall)
    ctx.translate((Math.random() - 0.5) * game.shake * 2 + kick, (Math.random() - 0.5) * game.shake * 2);
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

  for (const f of game.fighters) if (f.state === 'superstart' && f.superKind === 'cannon') drawMech(ctx, f);   // mech ONLY for the cannon (not beam/combo)
  for (const p of Projectiles) drawProjectile(ctx, p);

  // attacker draws on top
  const [a, b] = game.fighters;
  const order = a.move && !b.move ? [b, a] : [a, b];
  for (const f of order) drawFighterTrail(ctx, f, game);   // afterimage ghosts UNDER both bodies
  for (const f of order) drawFighter(ctx, f, game);
  drawHeads(ctx);   // severed heads fly/roll over the bodies
  drawShells(ctx);  // ejected shotgun shells

  // IMPACT FADE — the meteor-elbow nuke's cinematic beat: lights down, both bodies stay
  // lit (execution-style), NOT the KO blackout. Drawn HERE — before the particle/spark/
  // slash/shockwave/float-text passes — so the explosion FX punch through the dim at
  // FULL brightness (the whole point of the beat is watching that eruption).
  if (game.impactFade > 0 && !game.execution && game.koFreeze <= 0) {
    const fa = Math.min(1, game.impactFade / 10) * 0.6;   // holds dark, eases back up as it expires
    ctx.fillStyle = `rgba(0,0,0,${fa.toFixed(3)})`;
    ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
    for (const f of game.fighters) drawFighter(ctx, f, game);   // the two bodies stay lit over the dark
  }

  // OVERDRIVE BEAM pours out OVER the fighters for maximum drama (the freeze overlay owns the charge visual)
  for (const f of game.fighters) if (game.superFreeze <= 0 && f.state === 'superstart' && f.superKind === 'beam') drawBeam(ctx, f);

  // pass 1 — OPAQUE: blood chunks/squirts, dust, debris (normal source-over compositing)
  for (const p of Particles) {
    if (p.additive) continue;
    const t = Math.max(0, p.life / p.maxLife);
    if (p.blood) {
      const a = t > 0.22 ? 1 : 0.7, outline = p.size >= 4 ? '#2e0a08' : null;   // gore stays opaque; dark outline on globs
      if (p.streak) fxStreak(ctx, p, a, outline); else fxBlock(ctx, p.x, p.y, p.size, p.color, a, outline);
    } else {
      fxBlock(ctx, p.x, p.y, p.size, p.color, fxStepA(t), p.outline);   // dust / debris → stepped fade (rubble carries a dark outline)
    }
  }
  // pass 2 — ADDITIVE: energy sparks + impact stars bloom (globalCompositeOperation 'lighter')
  ctx.globalCompositeOperation = 'lighter';
  for (const p of Particles) {
    if (!p.additive) continue;
    const t = Math.max(0, p.life / p.maxLife);
    if (p.streak) fxStreak(ctx, p, fxStepA(t)); else fxBlock(ctx, p.x, p.y, p.size, p.color, fxStepA(t));
  }
  ctx.globalCompositeOperation = 'source-over';   // reset — else every later draw this frame composites additively
  ctx.globalAlpha = 1;
  drawSlashes(ctx);   // slash crescents ride on top of the sparks/blood
  drawShockwaves(ctx);   // expanding impact rings (wall spike) bloom over everything

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
    const combo = who && who.superKind === 'combo';
    if (who && who.superKind === 'cannon') drawMech(ctx, who, prog);   // mech ONLY for the brawler's cannon super
    if (who) drawFighter(ctx, who, game);
    if (who && who.charType === 'vesper') {   // her supers charge with a violet muzzle aura, no mech
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      radialGlow(ctx, who.x, CFG.FLOOR_Y - CFG.BODY_H * 0.5, 70 + prog * 150, 'rgba(170,90,230,0.45)');
      ball(ctx, who.x + who.facing * 40, CFG.FLOOR_Y - 130, 6 + prog * 16, '#f0e0ff');
      ctx.restore();
    }
    if (who && beam) {                              // a swelling charge aura during the freeze
      const cy = CFG.FLOOR_Y - 130, ox = who.x + who.facing * 56;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      radialGlow(ctx, ox, cy, 60 + prog * 220, 'rgba(110,215,255,0.5)');
      ball(ctx, ox, cy, 12 + prog * 40, '#dffaff');
      ball(ctx, ox, cy, 6 + prog * 18, '#ffffff');
      ctx.restore();
    }
    if (who && combo) {                             // a red battle aura behind the coiled pose
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      radialGlow(ctx, who.x, CFG.FLOOR_Y - CFG.BODY_H * 0.5, 80 + prog * 130, 'rgba(255,82,82,0.4)');
      ctx.restore();
    }
    ctx.fillStyle = combo ? '#ff7b7b' : beam ? '#8fe9ff' : '#ffe082';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const rampage = who && who.superKind === 'rampage';
    const scorched = who && who.superKind === 'scorched';
    ctx.fillText(rampage ? 'MINDLESS RAMPAGE' : scorched ? 'SCORCHED EARTH' : combo ? 'SUPER COMBO' : beam ? 'OVERDRIVE BEAM' : 'MECH CANNON', CFG.STAGE_W / 2, 200);
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

  // WITCH TIME: the whole world goes violet + crawls while she stays full speed.
  if (game.witchTime > 0) {
    const a = 0.17 + 0.06 * Math.sin(game.frame * 0.3);
    ctx.fillStyle = `rgba(120,40,180,${a})`;
    ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
    const g = ctx.createRadialGradient(CFG.STAGE_W / 2, CFG.STAGE_H / 2, CFG.STAGE_H * 0.32, CFG.STAGE_W / 2, CFG.STAGE_H / 2, CFG.STAGE_H * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(80,15,130,0.42)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
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
