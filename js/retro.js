// ─────────────────────────────────────────────────────────────
// RETRO 16-bit filter — pixelation + palette quantization.
//
// Normally the game draws straight to the 1280×720 canvas. With the filter on,
// every frame is drawn into a small offscreen buffer instead (retroBegin returns
// its 2D context, pre-scaled so ALL game code keeps drawing in 1280×720 world
// coordinates — nothing else changes). Then retroEnd:
//   1) quantizes the buffer's colors to a low-bit palette  → the "16-bit" banding,
//   2) (optional) lays down CRT scanlines,
//   3) blits it up to the full canvas with smoothing OFF (nearest-neighbor)
//      → crunchy, chunky, gamey pixels.
//
// All tunable in CFG.RETRO; toggled live with the V key (see main.js).
// Falls back to a clean passthrough when disabled or when there's no DOM
// (headless test harness) — never throws.
// ─────────────────────────────────────────────────────────────

const Retro = {
  enabled: true,
  off: null,        // offscreen <canvas> (low-res render target)
  offCtx: null,     // its 2D context (created willReadFrequently for fast quant)
  w: 0, h: 0,       // current low-res dims
  _lut: null,       // 256-entry channel→quantized-value lookup
  _lutLevels: 0,    // the `levels` the LUT was built for
};

// Make sure the offscreen buffer exists and matches the configured scale.
// Returns false (→ passthrough) when there's no usable canvas (headless).
function _retroEnsure() {
  const scale = Math.max(1, CFG.RETRO.scale);
  const w = Math.max(1, Math.round(CFG.STAGE_W / scale));
  const h = Math.max(1, Math.round(CFG.STAGE_H / scale));
  if (Retro.offCtx && Retro.w === w && Retro.h === h) return true;
  if (typeof document === 'undefined' || !document.createElement) return false;
  let c, octx;
  try {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    octx = c.getContext('2d', { willReadFrequently: true });
  } catch (e) { return false; }
  if (!octx) return false;
  Retro.off = c; Retro.offCtx = octx; Retro.w = w; Retro.h = h;
  return true;
}

// Per-channel quantization lookup: snap 0..255 to `levels` evenly-spaced steps.
function _retroLUT() {
  const levels = Math.max(2, CFG.RETRO.levels | 0);
  if (Retro._lut && Retro._lutLevels === levels) return Retro._lut;
  const lut = new Uint8Array(256);
  const step = 255 / (levels - 1);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.round(v / step) * step);
  Retro._lut = lut; Retro._lutLevels = levels;
  return lut;
}

// Begin a frame: hand back the context the game should draw into this frame.
// Filter ON  → the offscreen buffer's ctx, pre-scaled to world coordinates.
// Filter OFF → the real canvas ctx (untouched passthrough).
function retroBegin(ctx) {
  if (!Retro.enabled || !_retroEnsure()) return ctx;
  const o = Retro.offCtx;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, Retro.w, Retro.h);                                  // insurance; drawStage repaints fully anyway
  o.setTransform(Retro.w / CFG.STAGE_W, 0, 0, Retro.h / CFG.STAGE_H, 0, 0);  // world → buffer
  o.imageSmoothingEnabled = false;
  return o;
}

// End a frame: quantize the buffer, optional scanlines, then upscale-blit it onto
// the real canvas with nearest-neighbor. No-op when the filter is off.
function retroEnd(ctx) {
  if (!Retro.enabled || !Retro.offCtx) return;
  const o = Retro.offCtx, w = Retro.w, h = Retro.h;

  // 1) palette quantization (the 16-bit banding)
  if (CFG.RETRO.quantize) {
    o.setTransform(1, 0, 0, 1, 0, 0);
    let img = null;
    try { img = o.getImageData(0, 0, w, h); } catch (e) { img = null; }
    if (img) {
      const d = img.data, lut = _retroLUT();
      for (let i = 0; i < d.length; i += 4) {       // alpha (d[i+3]) left alone — buffer is opaque
        d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]];
      }
      o.putImageData(img, 0, 0);
    }
  }

  // 2) upscale to the display canvas, nearest-neighbor → chunky pixels
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, CFG.STAGE_W, CFG.STAGE_H);
  ctx.drawImage(Retro.off, 0, 0, w, h, 0, 0, CFG.STAGE_W, CFG.STAGE_H);

  // 3) CRT scanlines (full-res, thin) — optional, off by default
  if (CFG.RETRO.scanlines) {
    ctx.globalAlpha = CFG.RETRO.scanlineAlpha;
    ctx.fillStyle = '#000';
    for (let y = 0; y < CFG.STAGE_H; y += CFG.RETRO.scanlineGap) ctx.fillRect(0, y, CFG.STAGE_W, 1);
    ctx.globalAlpha = 1;
  }

  // restore the real ctx to its default — so toggling the filter OFF (passthrough)
  // never inherits the nearest-neighbor mode we forced for the upscale above
  ctx.imageSmoothingEnabled = true;
}

// V key flips this (wired in main.js). Returns the new state.
function retroToggle() { Retro.enabled = !Retro.enabled; return Retro.enabled; }
