// ─────────────────────────────────────────────────────────────
// Input: raw keyboard → per-player virtual pads.
// Pads expose held/pressed per logical button plus double-tap dashes,
// so Fighter never touches key codes. Adding gamepad support later
// only means writing another thing that fills a Pad.
//
// Presses are BUFFERED for a few frames (and the buffer doesn't tick
// during hitstop/super-freeze), so a chain input pressed during the
// freeze beat of the previous hit still comes out. Actions that fire
// must call pad.consume(btn) so one press can't trigger twice.
// ─────────────────────────────────────────────────────────────
const RawKeys = {};
const KeyQueue = [];   // one-shot system keys (debug toggles etc.), drained by main
const INPUT_BUFFER = 8;

const GAME_CODES = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Quote', 'Semicolon']);

window.addEventListener('keydown', e => {
  if (GAME_CODES.has(e.code)) e.preventDefault();
  if (!e.repeat) KeyQueue.push(e.code);
  RawKeys[e.code] = true;
});
window.addEventListener('keyup', e => { RawKeys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in RawKeys) RawKeys[k] = false; });

const P1_MAP = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', punch: 'KeyF', kick: 'KeyG', jump: 'Space', super: 'KeyH' };
const P2_MAP = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', punch: 'KeyK', kick: 'KeyL', jump: 'Semicolon', super: 'Quote' };

class Pad {
  constructor(map) {
    this.map = map;
    this.held = {};
    this.pressed = {};   // buffered edge: true while the press is still "live"
    this.snap = {};      // direction state captured at each button's press edge —
                         // buffered presses resolve against THIS, not current held
    this._prev = {};
    this._buf = {};      // frames of buffer left per button
    this.tapDir = 0;     // ±1 on the frame a double-tap completes (dash trigger)
    this._lastTapDir = 0;
    this._tapTimer = 0;
  }

  // `synth` (optional) replaces the keyboard as the down-state source — dummy AI uses this.
  // `frozen` = hitstop/super-freeze: edges still register, but buffers don't tick down.
  update(synth, frozen) {
    this.tapDir = 0;
    if (!frozen && this._tapTimer > 0) this._tapTimer--;
    for (const btn in this.map) {
      const down = synth ? !!synth[btn] : !!RawKeys[this.map[btn]];
      const edge = down && !this._prev[btn];
      if (edge) {
        this._buf[btn] = INPUT_BUFFER;
        // direction keys come first in the map, so held.* is current-frame here
        this.snap[btn] = { up: this.held.up, down: this.held.down, left: this.held.left, right: this.held.right };
      } else if (!frozen && this._buf[btn] > 0) this._buf[btn]--;
      this.held[btn] = down;
      this._prev[btn] = down;
      this.pressed[btn] = this._buf[btn] > 0;

      // double-tap dash detection uses true edges, not buffered presses
      if (edge && (btn === 'left' || btn === 'right')) {
        const dir = btn === 'left' ? -1 : 1;
        if (this._lastTapDir === dir && this._tapTimer > 0) {
          this.tapDir = dir;
          this._tapTimer = 0;
          this._lastTapDir = 0;
        } else {
          this._lastTapDir = dir;
          this._tapTimer = CFG.DOUBLE_TAP_WINDOW;
        }
      }
    }
  }

  consume(btn) {
    this._buf[btn] = 0;
    this.pressed[btn] = false;
  }
}
