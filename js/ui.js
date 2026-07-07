// ─────────────────────────────────────────────────────────────
// HUD: health (with damage-trail), stamina, meter, combo counter,
// round banners, control hints. Pure read-only view of game state.
// ─────────────────────────────────────────────────────────────
const UIState = { trail: [CFG.MAX_HP, CFG.MAX_HP] };

function drawBar(ctx, x, y, w, h, frac, fill, back, rightToLeft) {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  const fw = Math.max(0, Math.min(1, frac)) * w;
  ctx.fillRect(rightToLeft ? x + w - fw : x, y, fw, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawUI(ctx, game) {
  const [f1, f2] = game.fighters;
  const W = CFG.STAGE_W;
  const barW = 500, barH = 26;

  // damage trail eases down toward real hp — reads as "what that combo cost"
  for (let i = 0; i < 2; i++) {
    const hp = game.fighters[i].hp;
    if (UIState.trail[i] > hp) UIState.trail[i] = Math.max(hp, UIState.trail[i] - 4);
    else UIState.trail[i] = hp;
  }

  ctx.textBaseline = 'alphabetic';

  // health
  drawBar(ctx, 40, 28, barW, barH, UIState.trail[0] / f1.stats.maxHp, '#ff8a65', '#2a2a33', true);
  drawBar(ctx, 40, 28, barW, barH, f1.hp / f1.stats.maxHp, '#ffd54f', 'rgba(0,0,0,0)', true);
  drawBar(ctx, W - 40 - barW, 28, barW, barH, UIState.trail[1] / f2.stats.maxHp, '#ff8a65', '#2a2a33', false);
  drawBar(ctx, W - 40 - barW, 28, barW, barH, f2.hp / f2.stats.maxHp, '#ffd54f', 'rgba(0,0,0,0)', false);

  // stamina (thin, under health) — flashes when gassed
  const st1 = f1.state === 'gassed' && f1.f % 10 < 5 ? '#ff5252' : '#9ccc65';
  const st2 = f2.state === 'gassed' && f2.f % 10 < 5 ? '#ff5252' : '#9ccc65';
  drawBar(ctx, 40, 60, barW * 0.7, 8, f1.stamina / f1.stats.maxStamina, st1, '#2a2a33', true);
  drawBar(ctx, W - 40 - barW * 0.7, 60, barW * 0.7, 8, f2.stamina / f2.stats.maxStamina, st2, '#2a2a33', false);

  // names
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = '#e8e8f0';
  ctx.textAlign = 'right';
  ctx.fillText(f1.name, 40 + barW, 22);
  ctx.textAlign = 'left';
  ctx.fillText(f2.name, W - 40 - barW, 22);

  // P1 / P2 over-head tags — readable even in a same-character mirror match
  const bodyH = CFG.BODY_H || 170;
  for (let i = 0; i < 2; i++) {
    const f = game.fighters[i]; if (f.hp <= 0) continue;
    const col = i === 0 ? '#4fc3f7' : '#ef5350';
    const hx = Math.round(f.x), hy = Math.round(f.y - bodyH - 16);
    ctx.textAlign = 'center'; ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(i === 0 ? 'P1' : 'P2', hx, hy);
    ctx.fillStyle = col; ctx.fillText(i === 0 ? 'P1' : 'P2', hx, hy);
    ctx.beginPath(); ctx.moveTo(hx - 5, hy + 5); ctx.lineTo(hx + 5, hy + 5); ctx.lineTo(hx, hy + 11); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  }

  // meter (bottom corners) — glows READY at full
  const mW = 320, mY = CFG.STAGE_H - 46;
  drawBar(ctx, 40, mY, mW, 18, f1.meter / CFG.MAX_METER, f1.meter >= CFG.MAX_METER ? '#ffe082' : '#4fc3f7', '#2a2a33', false);
  drawBar(ctx, W - 40 - mW, mY, mW, 18, f2.meter / CFG.MAX_METER, f2.meter >= CFG.MAX_METER ? '#ffe082' : '#4fc3f7', '#2a2a33', true);
  ctx.font = 'bold 14px system-ui, sans-serif';
  if (f1.meter >= CFG.MAX_METER && game.frame % 30 < 20) {
    ctx.fillStyle = '#ffe082'; ctx.textAlign = 'left';
    ctx.fillText('SUPER READY [H]', 40, mY - 8);
  }
  if (f2.meter >= CFG.MAX_METER && game.frame % 30 < 20) {
    ctx.fillStyle = '#ffe082'; ctx.textAlign = 'right';
    ctx.fillText("SUPER READY [']", W - 40, mY - 8);
  }

  // combo counters — victim's comboHits shown on the attacker's side (+ running damage)
  if (f2.comboHits >= 2 && f2.inHitState()) {
    ctx.fillStyle = '#ffd54f'; ctx.textAlign = 'left';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.fillText(`${f2.comboHits} HITS`, 60, 140);
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`${f2.comboDmg | 0} dmg`, 62, 166);
  }
  if (f1.comboHits >= 2 && f1.inHitState()) {
    ctx.fillStyle = '#ffd54f'; ctx.textAlign = 'right';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.fillText(`${f1.comboHits} HITS`, W - 60, 140);
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`${f1.comboDmg | 0} dmg`, W - 62, 166);
  }

  // strike feed (kill-feed style, newest at top, fading)
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < game.feed.length; i++) {
    const e = game.feed[i];
    ctx.globalAlpha = Math.min(1, e.life / 30) * (1 - i * 0.12);
    ctx.fillStyle = e.color;
    ctx.fillText(e.text, W / 2, 100 + i * 24);
  }
  ctx.globalAlpha = 1;

  // execution prompt: they're gassed, nearly dead, and in reach
  if (!game.execution) {
    for (const [me, them] of [[f1, f2], [f2, f1]]) {
      if (them.state === 'gassed' && them.hp > 0 && them.hp <= them.stats.maxHp * CFG.EXECUTE_HP_FRAC
          && Math.abs(them.x - me.x) <= CFG.EXECUTE_RANGE * 2 && game.frame % 14 < 9) {
        ctx.fillStyle = '#ff5252';
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FINISH THEM!  [punch+kick]', them.x, CFG.FLOOR_Y - CFG.BODY_H - 70);
      }
    }
  }

  // banner
  if (game.banner && game.banner.timer > 0) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(game.banner.text, W / 2 + 4, 320 + 4);
    ctx.fillStyle = '#ffe082';
    ctx.fillText(game.banner.text, W / 2, 320);
    if (game.banner.sub) {
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillStyle = '#e8e8f0';
      ctx.fillText(game.banner.sub, W / 2, 372);
    }
  }

  // footer: controls + mode
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(232,232,240,0.55)';
  ctx.textAlign = 'center';
  ctx.fillText('P1  WASD move · F punch · G kick · SPACE jump · H super     |     P2  Arrows · K punch · L kick · ; jump · \' super     |     double-tap = dash/backdash · hold back = block · tap back late = parry', W / 2, CFG.STAGE_H - 10);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(232,232,240,0.45)';
  const dummyLabel = ['P2: HUMAN', 'P2: DUMMY (idle)', 'P2: DUMMY (blocks)', 'P2: CPU'][game.dummyMode];
  ctx.fillText(`[1/2/3/4] ${dummyLabel}   [5] fill meters   [0] hitboxes${game.debug ? ' ON' : ''}`, 40, CFG.STAGE_H - 60);

  // debug state readout — per-fighter state + move PHASE, live frame advantage, input history
  if (game.debug) {
    ctx.font = '12px monospace';
    ctx.fillStyle = '#9fd0ff';
    ctx.textAlign = 'center';
    for (const f of game.fighters) {
      let phase = '';
      if (f.move && f.state === 'attack') {
        const m = f.move;
        phase = f.f <= m.startup ? ` S${f.f}/${m.startup}` : f.f <= m.startup + m.active ? ' ACTIVE' : ` R${f.f - m.startup - m.active}/${m.recovery}`;
      }
      const stun = ['hitstun', 'blockstun', 'crumple', 'parried'].includes(f.state) ? ` stun:${Math.max(0, f.stunFrames - f.f)}` : '';
      ctx.fillText(`${f.state}:${f.f}${f.moveName ? ' ' + f.moveName + phase : ''} st:${f.stamina | 0}${stun}`, f.x, CFG.FLOOR_Y + 30);
    }
    // frame advantage: who is actionable first, and by how much (+N = P1 first).
    // Approximate — honors the flow-cancel recovery cap on a clean hit.
    const adv = framesUntilFree(f2) - framesUntilFree(f1);
    if (adv !== 0) {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = adv > 0 ? '#9ccc65' : '#ef9a9a';
      ctx.fillText(`ADV ${adv > 0 ? '+' : ''}${adv} ${adv > 0 ? 'P1' : 'P2'}`, W / 2, CFG.FLOOR_Y + 50);
    }
    // input history strips (newest on the inside edge)
    ctx.font = 'bold 14px monospace';
    const SYM = { left: '←', right: '→', up: '↑', down: '↓', punch: 'P', kick: 'K', jump: 'J', super: 'S' };
    const pads = game.fighters.map(f => f.pad);
    for (let i = 0; i < 2; i++) {
      const h = pads[i].history;
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillStyle = 'rgba(159,208,255,0.9)';
      const row = h.slice(-10).map(e => SYM[e.b] || '?').join(' ');
      ctx.fillText(row, i === 0 ? 40 : W - 40, CFG.STAGE_H - 80);
    }
  }
}

// Frames until this fighter can act again (debug ADV readout). 0 = free now.
function framesUntilFree(f) {
  if (f.state === 'attack' && f.move) {
    const m = f.move;
    let total = m.startup + m.active + m.recovery;
    if (f.madeHit && !m.noFlowCancel) total = Math.min(total, m.startup + m.active + CFG.FLOW_CANCEL_RECOVERY);
    return Math.max(0, total - f.f);
  }
  if (['hitstun', 'blockstun', 'crumple', 'parried'].includes(f.state)) return Math.max(0, f.stunFrames - f.f);
  if (f.state === 'land') return Math.max(0, f.landFrames - f.f);
  return 0;
}
