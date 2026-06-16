// ─────────────────────────────────────────────────────────────
// SFX + MUSIC engine.
//
//   Drop SFX into   assets/sfx/<name>.<ext>    (m4a / mp3 / ogg / wav)
//   Drop music into assets/music/<name>.<ext>
//   Missing files fail silent. Shopping-list → assets/SOUND-LIST.md
//
// SFX use the WEB AUDIO API: every sound is fetched + DECODED into memory
// up front (on the first keypress), then played from a BufferSource with
// near-zero latency — no per-play load hitch, no "first hit is silent".
// Music streams through a looping <audio> element (latency doesn't matter
// for a loop, and it keeps a long track out of memory).
//
// Features: master + sfx + music volume, mute (M), subtle random pitch on
// every hit (variety), rapid-repeat throttling, looping music switching.
// ─────────────────────────────────────────────────────────────

const SFX_EXTS = ['m4a', 'mp3', 'ogg', 'wav'];   // m4a first (our normalized files)

const SFX = {
  enabled: true,
  muted: false,
  master: 0.9,          // master gain (0..1)
  sfxVol: 1.0,          // sound-effects bus
  musicVol: 0.45,       // music bus
  pitchVary: 0.06,      // ±6% random playbackRate on every sfx → no two hits sound identical
  throttleMs: 32,       // don't re-stack the SAME sound faster than this
  gain: { hit_heavy: 0.8, beam_fire: 0.8 },   // per-sound volume trim (tune by ear): hit_heavy -20%; beam_fire layers on explosion → -20%
  ctx: null,            // AudioContext (lazy)
  masterGain: null,     // master GainNode → destination
  buffers: {},          // name → AudioBuffer | null (missing) | Promise (decoding)
  last: {},             // name → last-play timestamp (throttle)
  music: { name: null, el: null },
  _preloaded: false,
};

const SOUND_MANIFEST = {
  impacts:   ['hit_light', 'hit_med', 'hit_heavy', 'hit_heavy2', 'body_blow', 'block', 'parry', 'bounce', 'body_slam', 'ground_pop', 'wall_splat'],
  voice:     ['grunt_1', 'grunt_2'],
  swings:    ['whoosh_light', 'whoosh_heavy', 'fly_takeoff'],
  movement:  ['jump', 'dash', 'getup', 'tech'],
  grapples:  ['throw_grab', 'throw_slam', 'clinch_break'],
  stamina:   ['gassed'],
  crumple:   ['crumple', 'buckle'],
  super:     ['super_freeze', 'explosion', 'meter_ready', 'beam_activate', 'beam_fire'],
  counter:   ['counter_slip', 'counter_hit'],
  execution: ['exec_grab', 'exec_punch', 'exec_riser', 'exec_blast'],
  flatliner: ['flatliner_freeze', 'flatliner_hit', 'flatliner_drop', 'flatliner_ko'],
  match:     ['fight_start', 'ko', 'ko_freeze'],
  ui:        ['ui_move', 'ui_confirm', 'ui_back'],
  music:     ['music_menu', 'music_fight'],
};

function _now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
function _clamp01(v) { return Math.max(0, Math.min(1, v)); }

// Lazily create the AudioContext + master gain. Returns null where Web Audio
// isn't available (e.g. headless test harness) so everything no-ops safely.
function _ctx() {
  if (SFX.ctx) return SFX.ctx;
  const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  const c = new AC();
  SFX.ctx = c;
  SFX.masterGain = c.createGain();
  SFX.masterGain.gain.value = SFX.muted ? 0 : SFX.master;
  SFX.masterGain.connect(c.destination);
  return c;
}

// Fetch + decode one sound into an AudioBuffer (first extension that works).
function _loadBuffer(name) {
  const have = SFX.buffers[name];
  if (have !== undefined) return have;     // AudioBuffer | null | Promise
  const c = _ctx();
  if (!c || typeof fetch === 'undefined') { SFX.buffers[name] = null; return null; }
  const p = (async () => {
    for (const ext of SFX_EXTS) {
      try {
        const res = await fetch('assets/sfx/' + name + '.' + ext);
        if (!res.ok) continue;
        const data = await res.arrayBuffer();
        const buf = await c.decodeAudioData(data);
        SFX.buffers[name] = buf;
        return buf;
      } catch (e) { /* try next ext */ }
    }
    SFX.buffers[name] = null;               // missing/undecodable → silent forever
    return null;
  })();
  SFX.buffers[name] = p;                     // mark "decoding"
  return p;
}

function _spawn(name, buf, opts) {
  const c = SFX.ctx;
  const src = c.createBufferSource();
  src.buffer = buf;
  const pv = (opts && opts.pitch != null) ? opts.pitch : SFX.pitchVary;
  src.playbackRate.value = 1 + (Math.random() - 0.5) * 2 * pv;
  const sg = (SFX.gain[name] != null) ? SFX.gain[name] : 1;   // per-sound trim (tune by ear in SFX.gain)
  const g = c.createGain();
  g.gain.value = Math.max(0, (opts && opts.vol != null ? opts.vol : 1) * SFX.sfxVol * sg);
  src.connect(g); g.connect(SFX.masterGain);
  src.start();
}

// Fire a one-shot SFX. opts: { vol, pitch } (optional). Instant if preloaded.
function playSfx(name, opts) {
  if (!SFX.enabled || SFX.muted || !name) return;
  const c = _ctx();
  if (!c) return;                            // no Web Audio (headless) → silent
  if (c.state === 'suspended') { c.resume(); return; }   // not unlocked by a gesture yet
  const now = _now();
  if (SFX.last[name] && now - SFX.last[name] < SFX.throttleMs) return;   // throttle identical rapid plays
  const buf = SFX.buffers[name];
  if (buf && !buf.then) {                     // a decoded AudioBuffer (not a Promise, not null)
    SFX.last[name] = now;
    _spawn(name, buf, opts);
  } else if (buf === undefined) {
    _loadBuffer(name);                        // kick a decode for next time (don't play late)
  }
  // a Promise (still decoding) or null (missing) → skip this play
}

// Call on the first user gesture (wired in input.js): resumes the context and
// PRE-DECODES every sound so the first real play is instant + audible.
function unlockAudio() {
  const c = _ctx();
  if (c && c.state === 'suspended') c.resume();
  if (!SFX._preloaded) { SFX._preloaded = true; preloadSounds(); }
  if (SFX.music.el && SFX.music.el.paused && !SFX.muted) SFX.music.el.play().catch(() => {});
}

function preloadSounds() {
  for (const cat in SOUND_MANIFEST) {
    if (cat === 'music') continue;
    for (const name of SOUND_MANIFEST[cat]) _loadBuffer(name);
  }
}

// ── music: a streamed, looping <audio> element ──
function playMusic(name) {
  if (!name) return;
  if (SFX.music.name === name) {
    const el = SFX.music.el;
    if (el && el.paused && !SFX.muted) el.play().catch(() => {});   // retry past the autoplay gate
    return;
  }
  stopMusic();
  SFX.music.name = name;
  if (typeof Audio === 'undefined') return;
  let tries = 0;
  const tryNext = () => {
    if (tries >= SFX_EXTS.length) return;
    const el = new Audio('assets/music/' + name + '.' + SFX_EXTS[tries++]);
    el.loop = true;
    el.volume = SFX.musicVol * SFX.master;
    el.addEventListener('canplaythrough', () => {
      if (SFX.music.name !== name) return;
      SFX.music.el = el;
      if (!SFX.muted) el.play().catch(() => {});
    }, { once: true });
    el.addEventListener('error', tryNext, { once: true });
  };
  tryNext();
}

function stopMusic() {
  if (SFX.music.el) { try { SFX.music.el.pause(); } catch (e) {} }
  SFX.music.el = null; SFX.music.name = null;
}

function setMasterVolume(v) { SFX.master = _clamp01(v); if (SFX.masterGain && !SFX.muted) SFX.masterGain.gain.value = SFX.master; if (SFX.music.el) SFX.music.el.volume = SFX.musicVol * SFX.master; }
function setMusicVolume(v) { SFX.musicVol = _clamp01(v); if (SFX.music.el) SFX.music.el.volume = SFX.musicVol * SFX.master; }

// M key toggles this (wired in main.js). Returns the new muted state.
function toggleMute() {
  SFX.muted = !SFX.muted;
  if (SFX.masterGain) SFX.masterGain.gain.value = SFX.muted ? 0 : SFX.master;
  if (SFX.music.el) { if (SFX.muted) SFX.music.el.pause(); else SFX.music.el.play().catch(() => {}); }
  return SFX.muted;
}
