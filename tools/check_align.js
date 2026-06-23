#!/usr/bin/env node
// Backward-compat guard for sprite alignment.
// Recomputes every saved frame's FINAL draw rect (sx,sy,dx,dy,dw,dh) using the OLD render math
// and the NEW render math (js/render.js drawSpritePose), and flags any frame that shifts.
// New fields (snap, etc.) are optional + default-off, so an unchanged save must match exactly.
//   usage: node tools/check_align.js [path-to-sprites.json]
const fs = require('fs');
const SPR_CELL_W = 161, SPR_CELL_H = 240;   // render.js defaults
const path = process.argv[2] || 'assets/sprites/sprites.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

function resolve(g, sh, frame) {
  const scale = (cellDelta(sh, frame, 'ds')) + (sh.scale != null ? sh.scale : (g.scale != null ? g.scale : 1));
  const offX  = (cellDelta(sh, frame, 'dx')) + (sh.offX != null ? sh.offX : (g.offX || 0));
  const offY  = (cellDelta(sh, frame, 'dy')) + (sh.offY != null ? sh.offY : (g.offY || 0));
  const cw = sh.cw || g.cellW || SPR_CELL_W, ch = sh.ch || g.cellH || SPR_CELL_H;
  const cols = sh.cols || 1, cell = (sh.start || 0) + frame;
  const sx = (cell % cols) * cw, sy = ((cell / cols) | 0) * ch;
  return { scale, offX, offY, cw, ch, sx, sy };
}
function cellDelta(sh, f, k) { const c = sh.cells && sh.cells[f]; return (c && c[k]) || 0; }
function rectOLD(r, sh) { const dw = r.cw * r.scale, dh = r.ch * r.scale; return { dx: -dw / 2 + r.offX, dy: sh.flipY ? -r.offY : (-dh + r.offY), dw, dh, sx: r.sx, sy: r.sy }; }
function rectNEW(r, sh) {
  let dw = r.cw * r.scale, dh = r.ch * r.scale;
  let dx = -dw / 2 + r.offX, dy = sh.flipY ? -r.offY : (-dh + r.offY);
  if (sh.snap) { dx = Math.round(dx); dy = Math.round(dy); dw = Math.round(dw); dh = Math.round(dh); }
  return { dx, dy, dw, dh, sx: r.sx, sy: r.sy };
}

let frames = 0, mismatches = 0, snapped = [];
for (const cid in data.characters) {
  const c = data.characters[cid], g = c.global || {};
  for (const key in (c.sheets || {})) {
    const sh = c.sheets[key]; if (!sh.src) continue;
    if (sh.snap) snapped.push(cid + '.' + key);
    const nf = Math.max(1, sh.frames || 1);
    for (let f = 0; f < nf; f++) {
      const r = resolve(g, sh, f), a = rectOLD(r, sh), b = rectNEW(r, sh); frames++;
      for (const k of ['sx', 'sy', 'dx', 'dy', 'dw', 'dh']) {
        if (Math.abs(a[k] - b[k]) > 1e-9) { mismatches++; console.log(`SHIFT ${cid}.${key} frame ${f}: ${k} ${a[k]} -> ${b[k]}`); break; }
      }
    }
  }
}
console.log(`\nchecked ${frames} frames across ${path}`);
if (snapped.length) console.log(`note: ${snapped.length} sheet(s) opted into pixel-snap (intentional change): ${snapped.join(', ')}`);
console.log(mismatches ? `\n❌ ${mismatches} frame(s) shifted` : `\n✅ all frames render identically (no unintended drift)`);
process.exit(mismatches ? 1 : 0);
