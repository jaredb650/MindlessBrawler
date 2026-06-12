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
  drawBar(ctx, 40, 28, barW, barH, UIState.trail[0] / CFG.MAX_HP, '#ff8a65', '#2a2a33', true);
  drawBar(ctx, 40, 28, barW, barH, f1.hp / CFG.MAX_HP, '#ffd54f', 'rgba(0,0,0,0)', true);
  drawBar(ctx, W - 40 - barW, 28, barW, barH, UIState.trail[1] / CFG.MAX_HP, '#ff8a65', '#2a2a33', false);
  drawBar(ctx, W - 40 - barW, 28, barW, barH, f2.hp / CFG.MAX_HP, '#ffd54f', 'rgba(0,0,0,0)', false);

  // stamina (thin, under health) — flashes when gassed
  const st1 = f1.state === 'gassed' && f1.f % 10 < 5 ? '#ff5252' : '#9ccc65';
  const st2 = f2.state === 'gassed' && f2.f % 10 < 5 ? '#ff5252' : '#9ccc65';
  drawBar(ctx, 40, 60, barW * 0.7, 8, f1.stamina / CFG.MAX_STAMINA, st1, '#2a2a33', true);
  drawBar(ctx, W - 40 - barW * 0.7, 60, barW * 0.7, 8, f2.stamina / CFG.MAX_STAMINA, st2, '#2a2a33', false);

  // names
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = '#e8e8f0';
  ctx.textAlign = 'right';
  ctx.fillText(f1.name, 40 + barW, 22);
  ctx.textAlign = 'left';
  ctx.fillText(f2.name, W - 40 - barW, 22);

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

  // combo counters — victim's comboHits shown on the attacker's side
  ctx.font = 'bold 42px system-ui, sans-serif';
  if (f2.comboHits >= 2 && f2.inHitState()) {
    ctx.fillStyle = '#ffd54f'; ctx.textAlign = 'left';
    ctx.fillText(`${f2.comboHits} HITS`, 60, 140);
  }
  if (f1.comboHits >= 2 && f1.inHitState()) {
    ctx.fillStyle = '#ffd54f'; ctx.textAlign = 'right';
    ctx.fillText(`${f1.comboHits} HITS`, W - 60, 140);
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
      if (them.state === 'gassed' && them.hp > 0 && them.hp <= CFG.MAX_HP * CFG.EXECUTE_HP_FRAC
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

  // debug state readout
  if (game.debug) {
    ctx.font = '12px monospace';
    ctx.fillStyle = '#9fd0ff';
    ctx.textAlign = 'center';
    for (const f of game.fighters) {
      ctx.fillText(`${f.state}:${f.f}${f.moveName ? ' ' + f.moveName : ''} st:${f.stamina | 0}`, f.x, CFG.FLOOR_Y + 30);
    }
  }
}
