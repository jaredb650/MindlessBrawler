// ─────────────────────────────────────────────────────────────
// Menu / front-end: a thin SCENE layer over the fight loop.
//   game.scene ∈ title | mode | select | movelist | fight | paused
// Menu scenes run menuStep() (nav drained from KeyQueue) and draw via
// drawMenu(); 'paused' freezes the fight and overlays drawPauseOverlay().
// main.js owns the branch in logicStep()/frame() — this file owns the
// nav, the transitions, the move-list data, and all the menu drawing.
// ─────────────────────────────────────────────────────────────

const MODE_OPTS = ['1P  vs  CPU', '2P  LOCAL', 'TRAINING', 'MOVE  LIST'];
const PAUSE_OPTS = ['RESUME', 'MOVE LIST', 'REMATCH', 'QUIT TO MENU'];

// One-line fighting-style blurb shown when a fighter is highlighted on the select grid.
const CHAR_STYLE = {
  brawler: 'Cyborg brawler. Close-range powerhouse with deep combo routes — heavy punches and kicks that chain forever. Medium health, medium speed.',
  vesper:  'Stealth assassin. Blink-fast knife strings into devastating point-blank gun combos. Lower health, but blistering speed makes her lethal.',
  xamora:  'Fallen-angel heavyweight. Slow but devastating long-range staff sweeps and battle magic. The tank — huge health, controls the whole screen.',
};
// Select-grid accent + fallback portrait colour per fighter.
const CHAR_ACCENT = { brawler: '#4fc3f7', vesper: '#ef7a5a', xamora: '#ffd24a', blackwill: '#8e9aad' };

// Locked / coming-soon fighters: shown on the select grid as teasers but NOT selectable yet.
const LOCKED_FIGHTERS = [
  { id: 'blackwill', name: 'BLACKWILL', portrait: 'blackwill', locked: true, note: 'Locked — coming soon' },
];
// The full select grid = playable roster + locked teasers (built lazily once CHAR_ROSTER exists).
let SELECT_SLOTS = null;
function selectSlots() {
  if (!SELECT_SLOTS) {
    SELECT_SLOTS = CHAR_ROSTER.map(id => ({ id, name: CHARACTERS[id].name, portrait: id, locked: false, note: CHAR_STYLE[id] || '' }));
    SELECT_SLOTS = SELECT_SLOTS.concat(LOCKED_FIGHTERS);
  }
  return SELECT_SLOTS;
}

// Headshots: drop PNGs at assets/portraits/<id>.png  (brawler.png, vesper.png, xamora.png, blackwill.png).
// Missing files fall back to a coloured plate with the fighter's initial.
const PORTRAITS = {};
function loadPortraits() {
  if (typeof Image === 'undefined') return;
  const ids = (typeof CHAR_ROSTER !== 'undefined' ? CHAR_ROSTER.slice() : []).concat(LOCKED_FIGHTERS.map(l => l.portrait));
  for (const id of ids) {
    const img = new Image();
    img.onload = () => { PORTRAITS[id] = img; };
    img.src = 'assets/portraits/' + id + '.png';
  }
}
if (typeof Image !== 'undefined') loadPortraits();

// ── per-fighter move lists, each split into two columns (left/right) ──
const MOVELISTS = {
  brawler: {
    L: [
      { title: 'MOVEMENT', rows: [
        ['Move', 'A D  ·  ← →'], ['Crouch', 'S  ·  ↓'], ['Jump', 'Space  ·  ;'],
        ['Run', 'dbl-tap toward'], ['Backdash (invuln)', 'dbl-tap away'],
        ['Block / low block', 'hold away · down-away'], ['Parry', 'tap away ≤7f pre-hit'],
      ] },
      { title: 'PUNCHES', rows: [
        ['Jab — range-finder', 'P'], ['Cross', '▶ P'], ['Hook (ender)', 'cross → ▶ P'],
        ['Uppercut (launch)', '↑ P'], ['Backfist', '◀ P'], ['Body jab', '↓ P'],
      ] },
      { title: 'KICKS', rows: [
        ['Leg kick (low)', 'K'], ['Front kick', '▶ K'], ['Sweep (low ender)', '↓ K'],
        ['Axe kick (overhead)', '↑ K'], ['Spinning back kick', '◀ K'], ['Soccer kick (OTG)', '▶ K vs downed'],
      ] },
      { title: 'AERIALS', rows: [
        ['Air punch / kick', 'P / K in air'], ['Divekick', '↓ K in air'],
      ] },
      { title: 'FLYING / DASH', rows: [
        ['Flying knee', '↑ K, tap JUMP'], ['Flying uppercut', '↑ P, tap JUMP'],
        ['Dash attack', 'run + P/K'], ['Slide tackle', 'run + ↓'],
      ] },
    ],
    R: [
      { title: 'CLINCH / THROWS', rows: [
        ['Clinch', 'P+K (neutral)'], ['  dirty punch / knee', 'P / K'], ['  judo throw', '◀ back'],
        ['Clinch throw', 'P+K mid-string'],
      ] },
      { title: 'STRING SPECIALS', rows: [
        ['Auto-combo (land full string)', 'P ▶P ↑P ▶P'], ['  └ Sword combo → side-spike', 'then ◀ K'],
        ['Machine-gun blows', '3 jabs (auto)'],
        ['Overhand (electric)', 'machinegun → ▶ P'], ['Superman punch', 'front kick → ▶ P'],
        ['Liver shot', 'body jab → ↓ P'], ['Gazelle hook', '2 jabs → ▶ P'],
        ['Spinning elbow', 'backfist → ▶ P'], ['Calf kick', 'leg kick → K'],
        ['Tornado kick', 'front kick → ◀ K'], ['Elbow drop (spike)', 'juggle: jump → ↓ P'],
        ['German suplex', 'clinch knee → ↑ P+K'],
      ] },
      { title: 'KNOCKDOWN TECH', rows: [
        ['Back-roll', 'tap away on bounce'], ['Kip-up', 'jump on landing'],
        ['Wakeup roll', 'tap dir on wakeup'], ['Throw tech', 'mash P+K'],
      ] },
      { title: "SUPERS  (full meter,  H  ·  ')", rows: [
        ['Mech Cannon', 'super (neutral)'], ['Overdrive Beam', 'super + ▶'],
        ['Super Combo → sword', 'super + ◀'],
      ] },
      { title: 'FINISHERS', rows: [
        ['Ground & Pound', 'P+K over downed'], ['Execution', 'P+K vs gassed <10%'],
        ['The Flatliner', 'just-frame overhand'],
      ] },
    ],
  },

  vesper: {
    L: [
      { title: 'MOVEMENT', rows: [
        ['Move', 'A D  ·  ← →'], ['Crouch', 'S  ·  ↓'], ['Jump', 'Space  ·  ;'],
        ['Run', 'dbl-tap toward'], ['Backdash (invuln)', 'dbl-tap away'],
        ['Air-dash', 'dbl-tap in air'], ['Double / wall jump', 'jump in air / into wall'],
        ['Block / parry', 'hold away  /  tap ≤7f'],
      ] },
      { title: 'KNIFE  (P)', rows: [
        ['Stab', 'P'], ['Knife rekka 1-2-3', 'P, P, P'],
        ['Thrust', '▶ P'], ['Rising slash (launch)', '↑ P'],
        ['Hamstring (buckle)', '↓ P'], ['Pistol', '◀ P'],
      ] },
      { title: 'GUN-KATA  (K)', rows: [
        ['Gun kick', 'K'], ['Front kick', '▶ K'], ['Side kick', 'front kick → K'],
        ['Upshot (anti-air)', '↑ K'], ['Rifle', '↓ K'], ['Shotgun', '◀ K'],
      ] },
    ],
    R: [
      { title: 'AERIALS', rows: [
        ['Air slash', 'P'], ['Aerial upslash', '↑ P'], ['Iaido blink', '▶ P'],
        ['Triple-slash dive', '↓ P'], ['Jump kick', 'K'], ['Scissor takedown', '↑ K'],
        ['Air uzi', '▶ K'], ['Air spike', '↓ K'],
      ] },
      { title: 'SIGNATURE CHAINS', rows: [
        ['Aerial Rave', 'stab → thrust → rising slash'],
        ['Skyhook', 'rising slash  ×2'],
        ['Shish Kebab', 'stab → arc → thrust'],
        ['Execution', 'thrust → hamstring → pistol'],
        ['Skeet', 'thrust → hamstring → shotgun'],
        ['Bullet arts', 'hold P/K after a hit'],
      ] },
      { title: "SUPERS  (full meter,  H  ·  ')", rows: [
        ['Bullet Climax', 'super (neutral)'], ['Killer Tango', 'super + ▶'], ['Witch Time', 'super + ◀'],
      ] },
      { title: 'FINISHERS / TECH', rows: [
        ['Ground & Pound', 'P+K over downed'], ['Throw tech', 'mash P+K'],
        ['Back-roll / kip-up', 'tap away  /  jump on landing'],
      ] },
    ],
  },

  xamora: {
    L: [
      { title: 'MOVEMENT', rows: [
        ['Move', 'A D  ·  ← →'], ['Crouch', 'S  ·  ↓'], ['High jump', 'Space  ·  ;'],
        ['Run', 'dbl-tap toward'], ['Backdash', 'dbl-tap away'],
        ['Double jump', 'jump in air'], ['Glide', 'hold jump while falling'],
        ['Block / parry', 'hold away  /  tap ≤7f'],
      ] },
      { title: 'STAFF  (P)', rows: [
        ['Staff Swat', 'P'], ['Spear Flurry', 'P → P'], ['Ring Smash', 'P → P → P'],
        ['Extend Thrust', '▶ P'], ['Rising Pole (launch)', '↑ P'],
        ['Staff Sweep (low)', '↓ P'], ['Crescent Slam', '◀ P'],
      ] },
      { title: 'KICKS & SPELLS  (K)', rows: [
        ['Vacuum (pull-in)', 'K'], ['Spear Rush', '▶ K'], ['Skypillar (anti-air)', '↑ K'],
        ['Lantern (trap orb)', '↓ K'], ['Smite (electrocute)', '◀ K'],
      ] },
    ],
    R: [
      { title: 'AERIALS', rows: [
        ['Air Staff', 'P'], ['Wing Beat (air-to-air)', '↑ P'], ['Glide Poke', '▶ P'],
        ['Meteor Staff (spike)', '↓ P'], ['Falling Star', 'K'], ['Sky Talon (air grab)', '↑ K'],
        ['Dive Bomb', '↓ K'],
      ] },
      { title: "SUPER  (full meter,  H  ·  ')", rows: [
        ['Wrath of God', 'super  (meteor storm)'],
      ] },
      { title: 'FINISHERS / TECH', rows: [
        ['Talon Snatch (command grab)', 'P+K'], ['Ground & Pound', 'P+K over downed'],
        ['Throw tech', 'mash P+K'], ['Back-roll / kip-up', 'tap away  /  jump on landing'],
      ] },
    ],
  },
};
function movelistFor(id) { return MOVELISTS[id] || MOVELISTS.brawler; }

// ── input: discrete menu nav drained from the one-shot KeyQueue ──
function menuKeys() {
  const k = { up: 0, down: 0, left: 0, right: 0, confirm: 0, back: 0 };
  while (KeyQueue.length) {
    const c = KeyQueue.shift();
    if (c === 'ArrowUp' || c === 'KeyW') k.up = 1;
    else if (c === 'ArrowDown' || c === 'KeyS') k.down = 1;
    else if (c === 'ArrowLeft' || c === 'KeyA') k.left = 1;
    else if (c === 'ArrowRight' || c === 'KeyD') k.right = 1;
    else if (['Enter', 'NumpadEnter', 'Space', 'KeyF', 'KeyK', 'Semicolon'].includes(c)) k.confirm = 1;
    else if (['Escape', 'Backspace', 'KeyG', 'KeyL'].includes(c)) k.back = 1;
  }
  return k;
}

// pull a pause keypress out of the queue WITHOUT draining the rest (digits etc.
// still reach handleSystemKeys in the fight). Called from logicStep's fight branch.
function consumePauseKey() {
  for (let i = KeyQueue.length - 1; i >= 0; i--) {
    if (['Escape', 'Enter', 'NumpadEnter', 'KeyP'].includes(KeyQueue[i])) { KeyQueue.splice(i, 1); return true; }
  }
  return false;
}

function rosterIndexOf(id) { const i = CHAR_ROSTER.indexOf(id); return i < 0 ? 0 : i; }

// A fight mode was chosen → pick fighters on the side-by-side select.
// Sequential: P1 chooses first (P2 panel locked), then P2 — both drive with arrow keys.
function enterSelect(game, dummyMode) {
  const m = game.menu;
  m.pendingMode = dummyMode;
  if (!m.picks) m.picks = [0, 0];    // roster indices, remembered between visits
  m.stage = 0;                       // 0 = P1 choosing, 1 = P2 choosing
  m.locked = [false, false];
  m.shownPick = [-1, -1];            // forces a preview-character (re)load on first frame
  game.scene = 'select';
}

function startFight(game, dummyMode) {
  game.dummyMode = dummyMode;
  const picks = (game.menu && game.menu.picks) || [0, 0], slots = selectSlots();
  const idOf = (p) => { const s = slots[p]; return (s && !s.locked) ? s.id : 'brawler'; };
  game.fighters[0].setCharacter(idOf(picks[0]));
  game.fighters[1].setCharacter(idOf(picks[1]));
  resetMatch();          // resets fighters, cpu, matchState — defined in main.js
  game.scene = 'fight';
}

function menuStep(game) {
  game.menu.t = (game.menu.t || 0) + 1;
  const k = menuKeys();
  const m = game.menu;
  const move = (n) => { if (k.down) m.sel = (m.sel + 1) % n; if (k.up) m.sel = (m.sel - 1 + n) % n; if (k.up || k.down) playSfx('ui_move'); };

  if (game.scene === 'title') {
    if (k.confirm) { game.scene = 'mode'; m.sel = 0; playSfx('ui_confirm'); }

  } else if (game.scene === 'mode') {
    move(MODE_OPTS.length);
    if (k.back) { game.scene = 'title'; playSfx('ui_back'); }
    if (k.confirm) {
      playSfx('ui_confirm');
      if (m.sel === 0) enterSelect(game, 3);        // 1P vs CPU
      else if (m.sel === 1) enterSelect(game, 0);   // 2P local
      else if (m.sel === 2) enterSelect(game, 1);   // training (idle dummy; 1/2/3 switch in-fight)
      else { m.returnTo = 'mode'; m.mlChar = Math.min((m.picks && m.picks[0]) || 0, CHAR_ROSTER.length - 1); game.scene = 'movelist'; }
    }

  } else if (game.scene === 'select') {
    const slots = selectSlots(), n = slots.length;
    if (m.stage == null) m.stage = 0;
    if (!m.locked) m.locked = [false, false];
    if (!m.shownPick) m.shownPick = [-1, -1];
    if (m.lockMsg > 0) m.lockMsg--;
    const s = m.stage;
    if (k.left)  { m.picks[s] = (m.picks[s] - 1 + n) % n; playSfx('ui_move'); }
    if (k.right) { m.picks[s] = (m.picks[s] + 1) % n; playSfx('ui_move'); }
    if (k.back) {
      playSfx('ui_back');
      if (m.stage === 1) { m.stage = 0; m.locked[0] = false; m.locked[1] = false; }   // back to P1
      else { game.scene = 'mode'; m.sel = 0; }
    }
    if (k.confirm) {
      if (slots[m.picks[s]].locked) { playSfx('ui_back'); m.lockMsg = 90; }            // can't pick a locked fighter (yet)
      else {
        playSfx('char_select');   // epic spell impact on a fighter lock-in
        if (m.stage === 0) { m.locked[0] = true; m.stage = 1; }                        // lock P1 → P2's turn
        else { m.locked[1] = true; startFight(game, m.pendingMode); }
      }
    }
    // live idle previews: reuse the real fighters, (re)load only when a pick changes.
    // a locked slot has no fighter — skip its preview (drawSelect shows the teaser portrait).
    for (let i = 0; i < 2; i++) {
      const slot = slots[m.picks[i]];
      if (slot.locked) { m.shownPick[i] = m.picks[i]; continue; }
      if (m.shownPick[i] !== m.picks[i]) { game.fighters[i].setCharacter(slot.id); m.shownPick[i] = m.picks[i]; }
      const f = game.fighters[i];
      f.state = 'idle'; f.move = null; f.vx = 0; f.vy = 0;
      f.f = (f.f || 0) + 1; f.animClock = (f.animClock || 0) + 1;
      f.x = i === 0 ? CFG.STAGE_W * 0.28 : CFG.STAGE_W * 0.72; f.y = CFG.FLOOR_Y; f.facing = i === 0 ? 1 : -1;
      f.prevX = f.x; f.prevY = f.y;
    }

  } else if (game.scene === 'movelist') {
    const n = CHAR_ROSTER.length;
    if (m.mlChar == null) m.mlChar = 0;
    if (k.left)  { m.mlChar = (m.mlChar - 1 + n) % n; playSfx('ui_move'); }
    if (k.right) { m.mlChar = (m.mlChar + 1) % n; playSfx('ui_move'); }
    if (k.back || k.confirm) { game.scene = m.returnTo || 'mode'; m.sel = 0; playSfx('ui_back'); }

  } else if (game.scene === 'paused') {
    move(PAUSE_OPTS.length);
    if (k.back) { game.scene = 'fight'; playSfx('ui_back'); }           // Esc resumes
    if (k.confirm) {
      playSfx('ui_confirm');
      if (m.sel === 0) game.scene = 'fight';                                   // resume
      else if (m.sel === 1) {                                                  // move list — default to P1's fighter
        m.returnTo = 'paused';
        m.mlChar = rosterIndexOf(game.fighters[0] && game.fighters[0].charType);
        game.scene = 'movelist';
      } else if (m.sel === 2) { resetMatch(); game.scene = 'fight'; }          // rematch
      else { game.scene = 'title'; m.sel = 0; }                                // quit to menu
    }
  }
}

// ── drawing ──────────────────────────────────────────────────
function menuBG(ctx, t) {
  ctx.fillStyle = '#0b0b10';
  ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
  const g = ctx.createLinearGradient(0, 0, 0, CFG.STAGE_H);
  g.addColorStop(0, 'rgba(79,195,247,0.05)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(239,83,80,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, CFG.STAGE_H - 90); ctx.lineTo(CFG.STAGE_W, CFG.STAGE_H - 90); ctx.stroke();
}

function drawOptions(ctx, opts, sel, cx, top, gap) {
  ctx.textAlign = 'center';
  for (let i = 0; i < opts.length; i++) {
    const on = i === sel, y = top + i * gap;
    if (on) {
      ctx.fillStyle = 'rgba(255,224,130,0.12)';
      ctx.fillRect(cx - 260, y - 30, 520, 44);
    }
    ctx.fillStyle = on ? '#ffe082' : 'rgba(220,225,235,0.65)';
    ctx.font = `bold ${on ? 34 : 28}px system-ui, sans-serif`;
    ctx.fillText(on ? '▶   ' + opts[i] + '   ◀' : opts[i], cx, y);
  }
}

function drawMoveColumn(ctx, sections, x, inputX, top) {
  let y = top;
  for (const sec of sections) {
    ctx.textAlign = 'left'; ctx.fillStyle = '#4fc3f7'; ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(sec.title, x, y); y += 19;
    for (const [name, input] of sec.rows) {
      ctx.fillStyle = 'rgba(225,230,240,0.9)'; ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(name, x + 6, y);
      ctx.fillStyle = '#ffe082'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(input, inputX, y); y += 16.5;
    }
    y += 7;
  }
}

// one fighter plate on the select grid — headshot (or coloured fallback) + name.
function drawPortrait(ctx, id, name, x, y, w, h) {
  const acc = CHAR_ACCENT[id] || '#9aa3b5';
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(x, y, w, h);
  const img = PORTRAITS[id];
  if (img && img.width) {
    // cover-fit the headshot into the plate
    const ir = img.width / img.height, pr = w / h;
    let dw = w, dh = h, dx = x, dy = y;
    if (ir > pr) { dh = h; dw = h * ir; dx = x - (dw - w) / 2; } else { dw = w; dh = w / ir; dy = y - (dh - h) / 2; }
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  } else {
    // fallback: tinted plate + big initial
    ctx.fillStyle = acc + '22'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = acc; ctx.textAlign = 'center'; ctx.font = 'bold 120px system-ui, sans-serif';
    ctx.fillText((name || '?')[0], x + w / 2, y + h / 2 + 44);
  }
}

// a simple padlock glyph (no emoji — canvas-safe)
function drawLock(ctx, cx, cy, s, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(2, s * 0.16);
  ctx.beginPath(); ctx.arc(cx, cy - s * 0.32, s * 0.3, Math.PI, 0); ctx.stroke();   // shackle
  ctx.fillRect(cx - s * 0.42, cy - s * 0.1, s * 0.84, s * 0.66);                     // body
  ctx.restore();
}

// one player's half of the side-by-side select: headshot strip + name/blurb + state.
// state ∈ 'active' (choosing now) | 'locked' (confirmed) | 'waiting' (turn not reached → dimmed).
function drawSelectPanel(ctx, game, slot, state) {
  const m = game.menu, t = m.t || 0, slots = selectSlots(), n = slots.length;
  const rgb = slot === 0 ? '79,195,247' : '239,83,80', col = slot === 0 ? '#4fc3f7' : '#ef5350';
  const panelCx = slot === 0 ? CFG.STAGE_W * 0.25 : CFG.STAGE_W * 0.75;
  const pick = m.picks[slot], cur = slots[pick];
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.14);

  ctx.save();
  if (state === 'waiting') ctx.globalAlpha = 0.4;   // dim the panel that isn't its turn yet
  ctx.textAlign = 'center';
  ctx.fillStyle = col; ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(slot === 0 ? 'PLAYER 1' : 'PLAYER 2', panelCx, 96);

  // headshot strip — every fighter (playable + locked teasers), cursor on the current pick
  const tw = 72, th = 86, gap = 14, total = n * tw + (n - 1) * gap, sx = panelCx - total / 2, ty = 120;
  for (let i = 0; i < n; i++) {
    const so = slots[i], x = sx + i * (tw + gap);
    ctx.save(); if (so.locked) ctx.globalAlpha *= 0.6; drawPortrait(ctx, so.portrait, so.name, x, ty, tw, th); ctx.restore();
    if (so.locked) drawLock(ctx, x + tw / 2, ty + th / 2, 26, '#e6ebf5');
    if (i === pick) {
      ctx.strokeStyle = state === 'active' ? `rgba(${rgb},${pulse})` : col;
      ctx.lineWidth = state === 'locked' ? 4 : 3; ctx.strokeRect(x - 3, ty - 3, tw + 6, th + 6);
    }
  }

  // name + blurb (locked → '???' + "not yet unlocked")
  ctx.textAlign = 'center';
  ctx.fillStyle = cur.locked ? '#8a90a3' : '#fff'; ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText(cur.name, panelCx, 272);
  ctx.fillStyle = cur.locked ? '#ffae6b' : 'rgba(230,236,246,0.85)'; ctx.font = 'italic 16px system-ui, sans-serif';
  wrapText(ctx, cur.locked ? cur.note : (CHAR_STYLE[cur.id] || ''), panelCx, 300, CFG.STAGE_W * 0.42, 21);

  // status line
  ctx.font = 'bold 20px system-ui, sans-serif';
  if (cur.locked) { ctx.fillStyle = '#ef5350'; ctx.fillText('LOCKED', panelCx, 360); }
  else if (state === 'locked') { ctx.fillStyle = '#9ccc65'; ctx.fillText('✓  LOCKED IN', panelCx, 360); }
  else if (state === 'active') { ctx.fillStyle = `rgba(${rgb},${pulse})`; ctx.fillText('◀  choose  ▶', panelCx, 360); }
  else { ctx.fillStyle = 'rgba(220,225,235,0.5)'; ctx.fillText('— waiting —', panelCx, 360); }
  ctx.restore();
}

function wrapText(ctx, text, cx, y, maxW, lh) {
  const words = text.split(' '); let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, yy); line = w; yy += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, cx, yy);
}

function drawSelect(ctx, game) {
  const cx = CFG.STAGE_W / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(220,225,235,0.5)'; ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('SELECT  FIGHTER', cx, 58);
  // center divider
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, 80); ctx.lineTo(cx, CFG.STAGE_H - 80); ctx.stroke();

  const m = game.menu, slots = selectSlots();
  const stateFor = (slot) => (m.locked && m.locked[slot]) ? 'locked' : (slot === m.stage ? 'active' : 'waiting');
  drawSelectPanel(ctx, game, 0, stateFor(0));
  drawSelectPanel(ctx, game, 1, stateFor(1));
  // preview per player: the live idle fighter if playable, else a dim locked-teaser portrait
  for (let i = 0; i < 2; i++) {
    const so = slots[m.picks[i]], st = stateFor(i), pcx = i === 0 ? CFG.STAGE_W * 0.28 : CFG.STAGE_W * 0.72;
    if (so.locked) {
      const w = 220, h = 264, x = pcx - w / 2, y = CFG.FLOOR_Y - h;
      ctx.save(); ctx.globalAlpha = st === 'waiting' ? 0.18 : 0.4; drawPortrait(ctx, so.portrait, so.name, x, y, w, h); ctx.restore();
      drawLock(ctx, pcx, CFG.FLOOR_Y - h / 2, 58, '#e6ebf5');
      ctx.fillStyle = '#cdd3e1'; ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Character not yet unlocked', pcx, CFG.FLOOR_Y + 26);
    } else if (game.fighters[i]) {
      ctx.save(); if (st === 'waiting') ctx.globalAlpha = 0.35; drawFighter(ctx, game.fighters[i], game); ctx.restore();
    }
  }

  // brief denied message when a locked fighter is confirmed
  if (m.lockMsg > 0) {
    ctx.textAlign = 'center'; ctx.fillStyle = `rgba(239,83,80,${Math.min(1, m.lockMsg / 30)})`;
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('CHARACTER NOT YET UNLOCKED', cx, CFG.STAGE_H - 70);
  }

  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(220,225,235,0.45)'; ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('← →  choose      Enter / F / K  confirm      Esc  back', cx, CFG.STAGE_H - 40);
}

function drawMenu(ctx, game) {
  const t = game.menu.t || 0;
  menuBG(ctx, t);
  const cx = CFG.STAGE_W / 2;

  if (game.scene === 'title') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef5350'; ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.fillText('MINDLESS', cx, 270);
    ctx.fillStyle = '#4fc3f7';
    ctx.fillText('BRAWLER', cx, 370);
    const a = 0.45 + 0.45 * Math.sin(t * 0.08);
    ctx.fillStyle = `rgba(255,224,130,${a})`; ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText('PRESS  START', cx, 540);
    ctx.fillStyle = 'rgba(220,225,235,0.4)'; ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Space / Enter / F / K', cx, 575);

  } else if (game.scene === 'mode') {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(220,225,235,0.5)'; ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('SELECT MODE', cx, 150);
    drawOptions(ctx, MODE_OPTS, game.menu.sel, cx, 290, 72);
    ctx.fillStyle = 'rgba(220,225,235,0.4)'; ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('↑ ↓  select      F/K/Enter  confirm      Esc  back', cx, CFG.STAGE_H - 50);

  } else if (game.scene === 'select') {
    drawSelect(ctx, game);

  } else if (game.scene === 'movelist') {
    const m = game.menu;
    const id = CHAR_ROSTER[m.mlChar != null ? m.mlChar : 0] || 'brawler';
    const ml = movelistFor(id);
    ctx.textAlign = 'center'; ctx.fillStyle = '#4fc3f7'; ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillText(CHARACTERS[id].name + '  —  MOVE LIST', cx, 54);
    ctx.fillStyle = CHAR_ACCENT[id] || '#ffe082'; ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('◀   ' + (m.mlChar + 1) + ' / ' + CHAR_ROSTER.length + '   ▶', cx, 78);
    drawMoveColumn(ctx, ml.L, 70, 610, 116);
    drawMoveColumn(ctx, ml.R, 680, 1210, 116);
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(220,225,235,0.45)'; ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('← →  switch fighter      Esc / confirm  back', cx, CFG.STAGE_H - 22);
  }
}

function drawPauseOverlay(ctx, game) {
  ctx.fillStyle = 'rgba(8,8,14,0.72)';
  ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
  const cx = CFG.STAGE_W / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4fc3f7'; ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText('PAUSED', cx, 190);
  drawOptions(ctx, PAUSE_OPTS, game.menu.sel, cx, 300, 66);
  ctx.fillStyle = 'rgba(220,225,235,0.4)'; ctx.font = '17px system-ui, sans-serif';
  ctx.fillText('↑ ↓  select      confirm      Esc  resume', cx, CFG.STAGE_H - 50);
}
