// ─────────────────────────────────────────────────────────────
// Menu / front-end: a thin SCENE layer over the fight loop.
//   game.scene ∈ title | mode | movelist | fight | paused
// Menu scenes run menuStep() (nav drained from KeyQueue) and draw via
// drawMenu(); 'paused' freezes the fight and overlays drawPauseOverlay().
// main.js owns the branch in logicStep()/frame() — this file owns the
// nav, the transitions, the move-list data, and all the menu drawing.
// ─────────────────────────────────────────────────────────────

const MODE_OPTS = ['1P  vs  CPU', '2P  LOCAL', 'TRAINING', 'MOVE  LIST'];
const PAUSE_OPTS = ['RESUME', 'MOVE LIST', 'REMATCH', 'QUIT TO MENU'];

// The move list, split into two columns (left[] and right[]) so it all fits
// one screen — name on the left, input on the right.
const MOVELIST_L = [
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
];
const MOVELIST_R = [
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
];

// ── input: discrete menu nav drained from the one-shot KeyQueue ──
function menuKeys() {
  const k = { up: 0, down: 0, confirm: 0, back: 0 };
  while (KeyQueue.length) {
    const c = KeyQueue.shift();
    if (c === 'ArrowUp' || c === 'KeyW') k.up = 1;
    else if (c === 'ArrowDown' || c === 'KeyS') k.down = 1;
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

// A fight mode was chosen → go pick the two fighters first.
function enterSelect(game, dummyMode) {
  const m = game.menu;
  m.pendingMode = dummyMode;
  m.stage = 0;                       // 0 = choosing P1's slot, 1 = P2's slot
  if (!m.picks) m.picks = [0, 0];    // roster indices, remembered between visits
  game.scene = 'select';
}

function startFight(game, dummyMode) {
  game.dummyMode = dummyMode;
  const picks = (game.menu && game.menu.picks) || [0, 0];
  game.fighters[0].setCharacter(CHAR_ROSTER[picks[0]] || 'brawler');
  game.fighters[1].setCharacter(CHAR_ROSTER[picks[1]] || 'brawler');
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
      else { m.returnTo = 'mode'; m.scroll = 0; game.scene = 'movelist'; }
    }

  } else if (game.scene === 'select') {
    const n = CHAR_ROSTER.length;
    if (k.up) { m.picks[m.stage] = (m.picks[m.stage] - 1 + n) % n; playSfx('ui_move'); }
    if (k.down) { m.picks[m.stage] = (m.picks[m.stage] + 1) % n; playSfx('ui_move'); }
    if (k.back) { playSfx('ui_back'); if (m.stage === 1) m.stage = 0; else { game.scene = 'mode'; m.sel = 0; } }
    if (k.confirm) {
      playSfx('ui_confirm');
      if (m.stage === 0) m.stage = 1;               // lock P1 → choose P2
      else startFight(game, m.pendingMode);          // both locked → fight
    }

  } else if (game.scene === 'movelist') {
    if (k.up) m.scroll = Math.max(0, m.scroll - 1);
    if (k.down) m.scroll = m.scroll + 1;           // clamped in draw
    if (k.back || k.confirm) { game.scene = m.returnTo || 'mode'; m.sel = 0; playSfx('ui_back'); }

  } else if (game.scene === 'paused') {
    move(PAUSE_OPTS.length);
    if (k.back) { game.scene = 'fight'; playSfx('ui_back'); }           // Esc resumes
    if (k.confirm) {
      playSfx('ui_confirm');
      if (m.sel === 0) game.scene = 'fight';                                   // resume
      else if (m.sel === 1) { m.returnTo = 'paused'; m.scroll = 0; game.scene = 'movelist'; }
      else if (m.sel === 2) { resetMatch(); game.scene = 'fight'; }            // rematch
      else { game.scene = 'title'; m.sel = 0; }                                // quit to menu
    }
  }
}

// ── drawing ──────────────────────────────────────────────────
function menuBG(ctx, t) {
  ctx.fillStyle = '#0b0b10';
  ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
  // faint moving scanline glow for life
  const g = ctx.createLinearGradient(0, 0, 0, CFG.STAGE_H);
  g.addColorStop(0, 'rgba(79,195,247,0.05)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(239,83,80,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
  // floor line
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

function drawMenu(ctx, game) {
  const t = game.menu.t || 0;
  menuBG(ctx, t);
  const cx = CFG.STAGE_W / 2;

  if (game.scene === 'title') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef5350'; ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.fillText('MINDLESS', cx, 250);
    ctx.fillStyle = '#4fc3f7';
    ctx.fillText('BRAWLER', cx, 350);
    ctx.fillStyle = 'rgba(220,225,235,0.55)'; ctx.font = 'italic 24px system-ui, sans-serif';
    ctx.fillText('MMA in a phone booth that occasionally summons a mech', cx, 415);
    // pulsing prompt
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
    const m = game.menu;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(220,225,235,0.5)'; ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('SELECT  FIGHTER', cx, 110);
    const slots = [{ x: cx - 250, label: 'P1', col: '#4fc3f7' }, { x: cx + 250, label: 'P2', col: '#ef5350' }];
    for (let i = 0; i < 2; i++) {
      const s = slots[i];
      const ch = CHARACTERS[CHAR_ROSTER[m.picks[i]]];
      const active = m.stage === i;
      const pulse = active ? 0.6 + 0.4 * Math.sin(t * 0.12) : 1;
      ctx.strokeStyle = active ? `rgba(255,224,130,${pulse})` : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = active ? 4 : 2;
      ctx.strokeRect(s.x - 150, 190, 300, 300);
      ctx.fillStyle = s.col; ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText(s.label, s.x, 230);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.fillText(ch.name, s.x, 360);
      const tag = ch.id === 'vesper' ? 'GUN-KATA  RUSHDOWN' : 'MMA  BRAWLER';
      ctx.fillStyle = 'rgba(220,225,235,0.6)'; ctx.font = '17px system-ui, sans-serif';
      ctx.fillText(tag, s.x, 408);
      ctx.fillStyle = 'rgba(220,225,235,0.45)'; ctx.font = '15px system-ui, sans-serif';
      ctx.fillText('HP ' + ch.stats.maxHp + (ch.id === 'vesper' ? '   (glass cannon)' : ''), s.x, 440);
      if (active) { ctx.fillStyle = `rgba(255,224,130,${pulse})`; ctx.font = '15px system-ui, sans-serif'; ctx.fillText('▲  ▼', s.x, 478); }
    }
    ctx.fillStyle = 'rgba(220,225,235,0.4)'; ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('↑ ↓  change      F/K/Enter  confirm      Esc  back', cx, CFG.STAGE_H - 50);

  } else if (game.scene === 'movelist') {
    ctx.textAlign = 'center'; ctx.fillStyle = '#4fc3f7'; ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText('MOVE  LIST', cx, 58);
    drawMoveColumn(ctx, MOVELIST_L, 70, 610, 100);
    drawMoveColumn(ctx, MOVELIST_R, 680, 1210, 100);
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(220,225,235,0.45)'; ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('Esc / confirm — back', cx, CFG.STAGE_H - 24);
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
