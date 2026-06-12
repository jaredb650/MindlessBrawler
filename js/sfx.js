// ─────────────────────────────────────────────────────────────
// SFX: drop sound files into assets/sfx/<name>.mp3 (or .wav/.ogg)
// and they play automatically — missing files fail silent, so the
// game runs fine with zero, some, or all sounds present.
//
// The full manifest of names the game fires is in the README.
// ─────────────────────────────────────────────────────────────
const SFX_EXTS = ['mp3', 'wav', 'ogg'];
const SFX = { cache: {}, enabled: true, volume: 1 };

function playSfx(name, vol = 1) {
  if (!SFX.enabled) return;
  let entry = SFX.cache[name];
  if (entry === null) return;   // known missing — stay silent
  if (!entry) {
    entry = SFX.cache[name] = { audio: null, tries: 0 };
    const tryLoad = () => {
      if (entry.tries >= SFX_EXTS.length) { SFX.cache[name] = null; return; }
      const a = new Audio(`assets/sfx/${name}.${SFX_EXTS[entry.tries++]}`);
      a.addEventListener('canplaythrough', () => { entry.audio = a; }, { once: true });
      a.addEventListener('error', tryLoad, { once: true });
    };
    tryLoad();
  }
  if (entry.audio) {
    const a = entry.audio.cloneNode();
    a.volume = Math.min(1, vol * SFX.volume);
    a.play().catch(() => {});
  }
}
