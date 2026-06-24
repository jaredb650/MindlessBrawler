# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mindless Brawler — a 2D fighting game ("MMA in a phone booth that occasionally
summons a mech"). **Vanilla JS + `<canvas>`, no build step, no dependencies, no
package.json.** Scripts are plain `<script>` tags in `index.html`, loaded in
dependency order; everything shares globals (`CFG`, `MOVES`, `CHARACTERS`, `SFX`,
`Pad`, `Fighter`, etc.). There is no module system and no transpiler.

## Running it

```bash
node server.js          # http://localhost:8000  (game) + /tools/sprite-tool.html
```

`server.js` is a zero-dependency static server that ALSO provides the sprite-tool
save API (`POST /api/sprites` writes `assets/sprites/sprites.json`, `POST /api/upload`
writes sheet PNGs). You only need it over `python3 -m http.server` (or opening
`index.html` directly) when using the sprite tool — the game itself runs from any
static server. `PORT=8001 node server.js` to avoid a port clash.

There is **no test suite, linter, or build**. "Verify" means run it in a browser
and play, or simulate through the real input path (see "Testing combat" below).

## Architecture

Load order (from `index.html`) is also the dependency order:

```
config.js   → CFG: every feel/tuning number (physics, frame timings, retro filter). Tweak feel HERE.
sfx.js      → SFX engine (see "Sound")
input.js    → keyboard → virtual Pad objects (buffered presses)
moves.js    → MOVES: the data-driven move table (frame data, hitboxes, cancels)
characters.js → CHARACTERS: per-character identity registry
fighter.js  → Fighter: the per-fighter state machine + physics
combat.js   → hit/block/parry resolution, combo decay, projectiles, cinematics
render.js   → all drawing; sprite system + placeholder vector renderer
retro.js    → Retro: optional 16-bit pixelation/quantize post filter (toggle V)
ui.js       → HUD + strike kill-feed (read-only view of game state)
ai.js       → CPU: drives P2's Pad with synthetic inputs (dummy mode 4)
menu.js     → front-end scenes (title/mode/movelist) state machine
main.js     → fixed 60fps loop, hitstop/superfreeze/slowmo gating, match flow, system keys
```

### The data-driven core (most edits live here)

A move is **pure data** in `MOVES` (`js/moves.js`): `startup`/`active`/`recovery`
frames, `hitbox` (relative to feet, facing right; combat.js mirrors for left),
`guard` height, `damage`/`hitstun`/`blockstun`/`stamina`, `cancels` (which moves
this can be canceled into), and `anim` (the animation key). Fighter/combat only
*interpret* this table, so **adding a move = adding an entry** — no engine changes.
Flags like `heavy`, `popsGround`, `knockdown`, `chainOnly`, `launcher` switch on
shared engine branches.

`CHARACTERS` (`js/characters.js`) is the single source of truth for a fighter's
**identity**: its `moves` table, `stats` (hp/speed/jump/gravity overrides), input
maps (`neutralMap`/`airMap`/`dashMap`/`superMap` resolve held-direction → move
name), `comboChain` + `comboFinish` (the signature magnet combo), and supers.
`brawler` is defined to reproduce the original mirror-match behavior EXACTLY —
**adding/editing a character must never change how the brawler plays.** A `Fighter`
reads its identity here at construction (`this.charType`, `this.moveSet`).

### The sprite-swap contract (critical)

A fighter is ALWAYS in exactly one `state` with `f` = frames elapsed in it, and
`animKey()` returns the animation name (`this.move.anim` during attacks, else the
state name like `idle`/`walk`/`run`/`crouch`/`air`/`hitstun`). The renderer keys
off `(animKey(), f, facing, x, y)` and nothing else — so animation is fully
decoupled from game logic. Move timings in `MOVES` are the authoritative frame
counts to author animations against.

**All sprite config lives in `assets/sprites/sprites.json`** (loaded by
`render.js` via `loadSprites()` into the `SPRITES` global). It is keyed by
character id → `global` defaults + `sheets` keyed by state name or a move's
`animKey`. Per-sheet keys: `src, cols, rows, cw, ch, start, frames, fps, mode,
scale, offX, offY, tint` (`mode` = `loop`/`once`/`syncMove`/`jumpStart`/`jumpAir`/
`jumpLand`). Edit it with the visual tool (`tools/sprite-tool.html`), not by hand.
`render.js` falls back to the vector "capsule-dude" renderer for any anim without a
configured sheet.

### Loop & timing

`main.js` runs a fixed 60-logic-fps timestep. Global time-gates live on the `game`
object: `hitstop`, `superFreeze`, `slowmo`, `witchTime`, `koFreeze` — these pause
or slow the sim for impact feel and cinematics. Cinematics (execution, counter-hit,
suplex/groundpound/flatliner, combo finisher) are pre-baked sequencers stored in
single `game` slots (`game.execution`, `game.counter`, `game.cine`) that drive both
bodies. **Input is buffered 8 frames and survives hitstop/superfreeze**, and each
press snapshots the direction held at press time — so chained inputs (`cross→hook`)
come out across freeze beats. Actions consume the buffer via `pad.consume(btn)`.

## Testing combat

There is no automated harness. To validate combat changes, **drive through the real
input path** — construct/feed a `Pad`, let `fighter.tryCancel`/`startMove` run, and
step the loop — rather than calling `landAttack`/internal resolution directly;
otherwise you bypass buffering, cancel routes, and direction snapshotting and get
false results. In-game system keys (see README) give you dummies and a CPU:
`1`–`4` set P2 mode (human / idle / auto-block / CPU), `5` fills meters, `0`
toggles the hitbox/debug overlay, `V` toggles the retro filter, `M` mutes.

## Sound

`sfx.js` auto-plays any file dropped into `assets/sfx/<name>.<ext>` (or
`assets/music/`) — missing files are silently skipped. The game fires sounds by
logical name; `assets/SOUND-LIST.md` is the authoritative shopping-list of every
name the code references. Supports multi-file variants (`name_1`, `name_2`),
per-category + master volume, random pitch per hit, and looping music.

## Tools

- `tools/sprite-tool.html` — the visual sprite editor (needs `node server.js` to save).
- `tools/normalize_sheet.py` — normalizes AI-generated green-screen sprite sheets
  into uniform, feet-anchored cells ready for the tool. `python3 tools/normalize_sheet.py --help`.
- `tools/check_align.js` — sprite-sheet alignment check.

## Conventions & gotchas

- **`*.png` and `.devspecs/` are gitignored.** Sprite sheets must be **force-added**
  (`git add -f`) to land in a deployed build — otherwise the deploy is unanimated.
- Hitbox coords in `MOVES` are relative to the fighter's feet, **facing right**; y
  negative = up. combat.js mirrors for the left-facing fighter — author them once,
  facing right.
- `CFG` is the ONLY place feel/tuning numbers belong. The `brawler` character's
  stats intentionally alias the original `CFG` constants.
- Files are heavily commented with design intent at the top — read the header
  block of a file before editing it.
- Char #2's id is `vesper` in code (input maps, sprite keys, char registry) but
  its **display name is "Andromeda"** — the rename is display-only; do not rename
  the `vesper` id.

## Design docs

`README.md` (controls, full move list, feel rules), `MASTER-PLAN.md` (design
bible), `ANIMATION-SPEC.md` (sprite/animation authoring spec), and `.devspecs/`
(per-phase + per-special JSON specs, gitignored) hold the design intent behind the
mechanics.
