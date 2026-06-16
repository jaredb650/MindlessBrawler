// ─────────────────────────────────────────────────────────────
// SFX + MUSIC engine.
//
//   Drop sound files into  assets/sfx/<name>.<ext>   (mp3 / ogg / wav)
//   Drop music loops into  assets/music/<name>.<ext>
//   First extension that loads wins. MISSING FILES FAIL SILENT — the
//   game runs fine with zero, some, or all sounds present.
//
//   Full shopping-list of every name the game fires, with descriptions:
//   → assets/SOUND-LIST.md
//
// Features: per-category + master volume, mute (M key), subtle random
// pitch on every hit (cheap variety), optional multi-file VARIANTS,
// rapid-repeat throttling, and looping music with track switching.
// ─────────────────────────────────────────────────────────────

const SFX_EXTS = ['mp3', 'ogg', 'wav'];

const SFX = {
  enabled: true,
  muted: false,
  master: 0.9,          // master gain (0..1)
  sfxVol: 1.0,          // sound-effects bus
  musicVol: 0.45,       // music bus
  pitchVary: 0.06,      // ±6% random playbackRate on every sfx → no two hits sound identical
  throttleMs: 32,       // don't re-stack the SAME sound faster than this (stops machine-gun roar)
  cache: {},            // name → { audio, tries } | null (known-missing)
  variants: {},         // name → N : after you add name_1..name_N.mp3, set this to rotate them at random
  last: {},             // name → last-play timestamp (throttle)
  music: { name: null, audio: null },
};

// Every sound the game fires, grouped (this is also the preload + doc manifest).
const SOUND_MANIFEST = {
  impacts:   ['hit_light', 'hit_med', 'hit_heavy', 'body_blow', 'block', 'parry', 'bounce', 'body_slam', 'ground_pop', 'wall_splat'],
  swings:    ['whoosh_light', 'whoosh_heavy', 'fly_takeoff'],
  movement:  ['jump', 'dash', 'getup', 'tech'],
  grapples:  ['throw_grab', 'throw_slam', 'clinch_break'],
  stamina:   ['gassed'],
  super:     ['super_freeze', 'explosion', 'meter_ready'],
  counter:   ['counter_slip', 'counter_hit'],
  execution: ['exec_grab', 'exec_punch', 'exec_riser', 'exec_blast'],
  flatliner: ['flatliner_freeze', 'flatliner_hit', 'flatliner_drop', 'flatliner_ko'],
  match:     ['fight_start', 'ko'],
  ui:        ['ui_move', 'ui_confirm', 'ui_back'],
  music:     ['music_menu', 'music_fight'],
};

function _now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

// Lazy-load a sound by name, trying each extension; cache the hit (or the miss).
function _loadSfx(name, onReady) {
  let e = SFX.cache[name];
  if (e === null) return;                 // known-missing → stay silent
  if (!e) {
    e = SFX.cache[name] = { audio: null, tries: 0 };
    const tryNext = () => {
      if (e.tries >= SFX_EXTS.length) { SFX.cache[name] = null; return; }   // gave up → mark missing
      const a = new Audio('assets/sfx/' + name + '.' + SFX_EXTS[e.tries++]);
      a.addEventListener('canplaythrough', () => { e.audio = a; }, { once: true });
      a.addEventListener('error', tryNext, { once: true });
    };
    tryNext();
  }
  if (e.audio && onReady) onReady(e.audio);
}

// Fire a one-shot sound effect. opts: { vol, pitch } (both optional).
function playSfx(name, opts) {
  if (!SFX.enabled || SFX.muted || !name) return;
  const now = _now();
  if (SFX.last[name] && now - SFX.last[name] < SFX.throttleMs) return;   // throttle identical rapid plays
  SFX.last[name] = now;

  let key = name;
  const nv = SFX.variants[name];
  if (nv > 1) key = name + '_' + (1 + ((Math.random() * nv) | 0));       // rotate name_1..name_N if configured

  const vol = (opts && opts.vol != null) ? opts.vol : 1;
  const pv = (opts && opts.pitch != null) ? opts.pitch : SFX.pitchVary;
  _loadSfx(key, (audio) => {
    const a = audio.cloneNode();                       // clone so overlapping plays don't cut each other off
    a.volume = Math.max(0, Math.min(1, vol * SFX.sfxVol * SFX.master));
    a.preservesPitch = false; a.webkitPreservesPitch = false;            // let playbackRate actually shift pitch
    a.playbackRate = 1 + (Math.random() - 0.5) * 2 * pv;
    a.play().catch(() => {});
  });
}

// Loop a music track. Idempotent: calling with the SAME name every frame is cheap
// and also retries play() once the browser's autoplay gate opens (first key press).
function playMusic(name) {
  if (!name) return;
  if (SFX.music.name === name) {
    const a = SFX.music.audio;
    if (a && a.paused && !SFX.muted) a.play().catch(() => {});
    return;
  }
  stopMusic();
  SFX.music.name = name;                               // set first so same-name calls early-out while it loads
  let tries = 0;
  const tryNext = () => {
    if (tries >= SFX_EXTS.length) return;
    const a = new Audio('assets/music/' + name + '.' + SFX_EXTS[tries++]);
    a.loop = true;
    a.volume = SFX.musicVol * SFX.master;
    a.addEventListener('canplaythrough', () => {
      if (SFX.music.name !== name) return;             // a newer track was requested while this loaded
      SFX.music.audio = a;
      if (!SFX.muted) a.play().catch(() => {});
    }, { once: true });
    a.addEventListener('error', tryNext, { once: true });
  };
  tryNext();
}

function stopMusic() {
  if (SFX.music.audio) { try { SFX.music.audio.pause(); } catch (e) {} }
  SFX.music.audio = null; SFX.music.name = null;
}

function setMasterVolume(v) { SFX.master = Math.max(0, Math.min(1, v)); if (SFX.music.audio) SFX.music.audio.volume = SFX.musicVol * SFX.master; }
function setMusicVolume(v) { SFX.musicVol = Math.max(0, Math.min(1, v)); if (SFX.music.audio) SFX.music.audio.volume = SFX.musicVol * SFX.master; }

// M key toggles this (wired in main.js). Returns the new muted state.
function toggleMute() {
  SFX.muted = !SFX.muted;
  if (SFX.music.audio) { if (SFX.muted) SFX.music.audio.pause(); else SFX.music.audio.play().catch(() => {}); }
  return SFX.muted;
}

// Optional: front-load every manifest sound so the first play has no hitch.
// Call this AFTER files exist (it 404s on names you haven't added yet).
function preloadSounds() {
  for (const cat in SOUND_MANIFEST) {
    if (cat === 'music') continue;
    for (const name of SOUND_MANIFEST[cat]) _loadSfx(name);
  }
}
