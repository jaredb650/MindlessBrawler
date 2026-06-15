# Mindless Brawler — Master Update Plan

> Living document. Built on the `dev` branch. Check phases off as they land.
> Every edit references real files/lines in `js/` so we don't lose the thread.

## Status

| Phase | Feature | State |
|---|---|---|
| 1 | Clinch · Axe Kick · Aerials | ✅ built + verified |
| 2 | Ground Tech (back-roll / kip-up) + DI | ✅ built + verified |
| 3 | Counter-Hit Cinematic | ✅ built + verified |
| 4 | Okizeme & Throw Tech | ✅ built + verified |
| 5 | Neutral & Defensive Tools | ✅ built + verified |

### Build log (v0.3 — built on `dev`)
- **Implemented** all 5 phases in dependency order via serialized agents on the real tree (~791 insertions across 7 engine files).
- **Design pass** caught 2 latent spec bugs pre-code (Phase 2 tech f-gate; Phase 1C dead snap.jump line).
- **Adversarial review** (6 dimensions, every finding independently verified) raised 12, confirmed 8, fixed 6 distinct issues:
  - HIGH: clinch `inClinch` leak on feint / mid-string P+K → phantom clinch (guarded both interrupt branches with `!mv.clinchHit`).
  - HIGH: slip→counter was dead code (canBlock rejects crouched-high) → hoisted the slip check above `canBlock`.
  - HIGH: pushblock shoved the attacker the wrong way → flipped the `away` sign.
  - LOW: getupDelay leak across knockdowns; clinch press-drift sliding the locked pair; counter-KO launch was techable (added `noTech`).
  - Refuted (intended/ harmless): wallsplat-peeloff techable, backroll key-read, vestigial `slip` state.
- **Verified:** `node --check` (10 files) · static (CFG keys / braces / move+state refs / fixes present) · core fuzz (6000f, no crash/NaN/OOB) · full-stack fuzz (8000f through real `logicStep`+`render`+`ui`, 28 states incl. all new, cinematics release, hitstop clamped).
- **Not yet done:** human playtest for FEEL/tuning; per-character kits; sprite art (see updated `ANIMATION-SPEC.md` Tier 4).

## Decided design forks
- **Fork A — CONFIRMED:** lights cancel into the **axe kick** (overhead ender) instead of the old knee; the stamina-drain knee becomes a **clinch-only** reward.
- **Fork B — CONFIRMED:** **flying knee stays on `up+K`** — it jump-cancels the axe kick's startup (same muscle memory, more forgiving window).

## Subsumed earlier suggestions (already covered, don't re-add)
- "Neutral throw" → **clinch → back** (judo throw, now reachable from neutral).
- "Grounded overhead" → **axe kick** (`up+K`, `guard: high`).
- "Air variety" → **aerial kit** (air P / air K / divekick).

## Recommended build order
Phase 1 → 2 → 3 is the high-value core (offense mixup, then both sides of the
knockdown game, then the counter read). Phases 4–5 are breadth/polish.

## Architecture reminders (the contracts every phase must respect)
- A fighter is always in exactly one state; `f` = frames in state; `animKey()` =
  state name (or live move's `anim`). New states need a pose in `render.js`.
- All feel numbers live in `config.js` — never hardcode tuning in logic.
- A move is pure data in `moves.js`; adding a move = adding an entry.
- Presses are buffered 8f and survive hitstop/freeze; actions call `pad.consume(btn)`.
- Scripted cinematics (execution) take over both bodies, run from `logicStep`,
  draw via their own overlay in `render()`. Counter-hit follows this pattern.

---

# Phase 1 — Clinch · Axe Kick · Aerials

## 1A. Axe kick (replaces `up+K`)
**moves.js**
- New `axekick`: `kind:'kick'`, slow startup (~14), `heavy`, big recovery, big
  damage, `knockdown:true`, `popsGround:true`, `guard:'high'` (overhead — must be
  blocked standing), tall hitbox covering head→floor, `flyConvert:'flyknee'`.
- `resolveNeutralMove` (moves.js:174): kick + `up` → `'axekick'` (was `'knee'`).
- **Fork A:** in each light's `cancels` array (jab :29, cross :36, crouchjab :68,
  frontkick :76) swap `'knee'` → `'axekick'` so strings get an overhead ender.

**fighter.js** — none (axe kick is a normal `attack`-state move). The existing
fly-convert logic (fighter.js:322) works unchanged because `axekick.flyConvert`
is set; `up+K` then tap-jump in range still produces the flying knee.

**render.js** — add an `axekick` pose case (overhead arc: arm/leg high → down).

## 1B. Aerials
**moves.js**
- New `airpunch`: `kind:'punch'`, fast, light (~35), `guard:'high'`, `air:true`,
  hitbox angled down-forward, active-until-land (`active:999, recovery:0`).
- Keep `jumpkick` as the **air kick** (`kind:'kick'`).
- New `divekick`: `kind:'kick'`, `air:true`, steep dive — on start set
  `vx = facing*DIVEKICK_VX, vy = +DIVEKICK_VY` (downward), big hitstun, drives
  opponent down on hit; whiff lands with recovery.
- New helper `resolveAirMove(btn, dirCat)`: P→`airpunch`, K→`jumpkick`,
  down+K→`divekick`.

**fighter.js**
- `air` state (fighter.js:296-303): replace the hardcoded `startMove('jumpkick')`
  with `resolveAirMove(btn, this.dirCategory(opp))`; keep the `usedAirAttack` gate.
- Divekick needs its velocity redirect applied in `startMove` (or right after) —
  add a `dive:{vx,vy}` field read on move start, similar to `flight`.

**render.js** — pose cases for `airpunch` and `divekick` (steep down-forward leg).

**config.js** — `DIVEKICK_VX`, `DIVEKICK_VY`, optional `AIRPUNCH_*`.

## 1C. Clinch system
**Trigger:** neutral `P+K` (in `idle/walk/crouch`) → `clinchgrab`. Mid-string
`P+K` keeps its CURRENT behavior (→ `throwgrab`, fighter.js:313) — "clinch during
a combo = instant throw, skips clinch." No change needed there.

**New states (fighter.js switch + docstring list :10-13):**
| State | Who | Behavior |
|---|---|---|
| `clinchgrab` | initiator | reach ~`CLINCH_REACH_FRAME`; in range & opp not invuln/airborne/downed → lock; whiff → `CLINCH_WHIFF_RECOVERY` |
| `clinch` | clincher | pins opp at `CLINCH_DIST`; reads inputs; runs `CLINCH_MAX_FRAMES` auto-release timer |
| `clinched` | victim | pinned, can't act; **mash** any button/dir builds escape → break at `CLINCH_ESCAPE_THRESHOLD` |

**Clincher inputs while in `clinch`:**
- Punch → `clinchpunch` (dirty boxing, ~20) → return to `clinch`.
- Kick → `clinchknee` (relocated body knee, ~30 + `staminaDrain`) → return to `clinch`.
- Back → **judo throw** (reuse `beginThrown`, fighter.js:216) → ends clinch.
- Forward / up / jump → **break/cancel** → `idle` (or jump).

**moves.js** — `clinchpunch`, `clinchknee` (knee stats + `staminaDrain`), both
flagged `clinchHit:true`.

**combat.js** — new `clinchHit` branch in `landAttack`: apply damage/stamina/feed
but DO NOT change victim state (keep them `clinched`). Add feed labels.

**fighter.js**
- `tryActions` (fighter.js:162): add neutral `P+K` → `clinchgrab` branch (above the
  single-button resolve; after the `canExecute` check so execution still wins).
- New state cases for `clinchgrab` / `clinch` / `clinched`.
- `reset()`: `clinchTimer`, `clinchMash` fields.
- Pin logic: each frame in `clinch`/`clinched`, lock both bodies to `CLINCH_DIST`.
- `clinchpunch`/`clinchknee` started via `startMove`; on `endMove`, if started from
  clinch and timer alive → return to `clinch` (re-pin), else `idle`. Use an
  `inClinch` flag.

**config.js** — `CLINCH_GRAB_RANGE`, `CLINCH_REACH_FRAME`, `CLINCH_MAX_FRAMES`,
`CLINCH_DIST`, `CLINCH_ESCAPE_THRESHOLD`, `CLINCH_MASH_PER_PRESS`,
`CLINCH_BREAK_PUSHBACK`, `CLINCH_WHIFF_RECOVERY`.

**render.js** — poses for `clinchgrab`, `clinch`, `clinched`, `clinchpunch`,
`clinchknee`.

**sfx** — reuse `throw_grab` (lock), `body_blow` (knee); add `clinch_break`.

**Risk:** clinch couples two bodies — model it on `throwgrab`/`thrown`, which
already do this. Auto-release timer + mash escape prevent infinite holds.

---

# Phase 2 — Ground Tech (back-roll / kip-up) + DI

**Hook:** the `state==='launched'` landing block, **fighter.js:453-482** (first
ground contact / first bounce).

**fighter.js**
- New states `backroll` and `kipup` (switch cases + docstring + invuln grant in
  `setState`, like `getup` at :76).
- At first ground contact in `launched`, BEFORE the bounce/fallheavy decision,
  check a tight window (~`TECH_WINDOW`, parry-style):
  - fresh **back** press → `backroll` (invuln roll away, ends `idle`).
  - **jump** press → `kipup` (fast in-place rise, brief invuln, ends `idle`).
- **Guards (no tech):** `hp<=0` KO launches, point-blank flying knee, gassed /
  execution flows.
- **DI (folded in):** during hitstop/launch, hold a direction to nudge knockback
  angle (small clamp) — pairs with choosing where to tech. Read held dir in
  `setLaunched` / hitstop.

**config.js** — `TECH_WINDOW`, `BACKROLL_SPEED`, `BACKROLL_FRAMES`,
`BACKROLL_INVULN`, `KIPUP_FRAMES`, `KIPUP_INVULN`, `DI_NUDGE`.

**render.js** — `backroll` (rolling tuck) + `kipup` (spring-up) poses.

**sfx** — reuse `getup`; add `tech` for the roll.

**Risk:** keep the window TIGHT so teching is a skill check that denies the ground
juggle (OTG + soccer-kick) only on good reads — preserves the ground game's value.

---

# Phase 3 — Counter-Hit Cinematic

**Fantasy:** hit them during their move STARTUP → screen flashes white, your
fighter SLIPS, then cracks them with a hard punch/kick (by the move's `kind`),
big damage + hard knockdown. Modeled on the **execution sequencer**.

**moves.js** — add `kind:'punch'|'kick'` to every striking move (also lets
render.js drop its hardcoded isPunch/isKick lists at :208-209).

**combat.js** — in `landAttack` clean-hit branch (combat.js:102), before normal
resolution:
```js
const vicCommitting = MOVE_STATES.has(vic.state) && vic.move && vic.f <= vic.move.startup;
if (live && move.kind && !att.isAirborne() && !vic.isAirborne()
    && vicCommitting && att.counterCD <= 0 && !game.counter) {
  startCounter(att, vic, move, game);
  return;
}
```

**main.js** (next to `startExecution`/`runExecution`):
- `startCounter(att, vic, move, game)`: set `game.counter`, `game.flash`, face
  off, store `att.counterKind`, set `att.counterCD`, states → `slipcounter` /
  `countered`, feed + float "COUNTER!".
- `runCounter(game)`: 3 beats driving both anim clocks —
  (1) flash+slip, (2) hard blow at `COUNTER_IMPACT` (apply
  `dmg*COUNTER_DMG_MULT + COUNTER_BONUS`, heavy spark/shake/`hit_heavy`,
  `setLaunched`), (3) `att→idle`, `game.counter=null` at `COUNTER_END`.
- Gate in `logicStep` near the execution gate (:153): `if (game.counter) { runCounter(game); return; }`
- `game` object (:11): add `counter:null`, `flash:0`. `resetMatch` clears both.
- Decrement `game.flash` by the `shake` decay (:126).

**fighter.js**
- New no-op states `slipcounter` / `countered` (like execute/executed :414-416);
  add to docstring + `NO_REGEN` (:239).
- `reset()`: `counterKind=null; counterCD=0;`
- `update()`: `if (this.counterCD>0) this.counterCD--;`

**render.js**
- Flash overlay at end of `render()` before debug (:579):
  `rgba(255,255,255, 0.85 * game.flash/COUNTER_FLASH)` full-screen.
- Optional cinematic darkening while `game.counter` (like execution :552).
- Poses: `slipcounter` (slip/weave early → hard `strikeTo` by `f.counterKind` on
  blow frames), `countered` (snapped-back recoil).

**config.js** — `COUNTER_FLASH`, `COUNTER_COOLDOWN`, `COUNTER_SLIP`,
`COUNTER_IMPACT`, `COUNTER_END`, `COUNTER_DMG_MULT`, `COUNTER_BONUS`,
`COUNTER_LAUNCH_VX/VY`.

**sfx** — `counter_slip`, `counter_hit`.

**Risk:** cutscene spam — `counterCD` + grounded-only gate. Lethal counters are
free (KO check fires the next frame after the cinematic applies damage).

---

# Phase 4 — Okizeme & Throw Tech (defender's wakeup half)

**fighter.js**
- Wakeup options off `getup` (already invuln, :427): **reversal** (attack as you
  rise), **delayed getup** (hold down → extend `downed`), **forward/back wakeup
  roll** (tap a direction during `downed`/early `getup`).
- **Throw tech:** add a break window to the judo throw — victim mashing P+K during
  `thrown`/clinch escapes (clinch mash from Phase 1 is the seed). Make `beginThrown`
  techable for the first few frames.

**config.js** — `WAKEUP_*`, `THROW_TECH_WINDOW`.

**render.js** — `wakeuproll` pose (reuse `backroll` from Phase 2 if shared).

**Risk:** don't make wakeup reversal too safe — keep it whiff-punishable, mirror
the flying-uppercut "death on whiff" idea.

---

# Phase 5 — Neutral & Defensive Tools

Remaining breadth items. Each is small and independent.

- **Dash attack** — `run + P/K` → dedicated lunge move (today `run` just carries
  momentum into a normal, fighter.js:140). New `dashpunch`/`dashkick` + a branch in
  the `run` state's `tryActions`.
- **Wall-splat** — `backkick`'s blast already rebounds off walls
  (fighter.js:500-506); upgrade to a real `wallsplat` stun state for corner-carry
  juggles. New state + detect launched-into-wall at high vx.
- **Pushblock / guard-cancel** — stamina-cost shove from `blockstun` to relieve
  corner pressure. New branch in `blockstun` reading a button+back; applies
  `applyPush` outward, costs stamina.
- **Feint** — cancel a move's startup into `idle`/block for a stamina cost (bait
  parries / whiff-punishes). Branch in `attack` state before active frames.
- **Slip → counter** — a parry VARIANT that ducks a high and auto-counters; the
  per-character signature. Slots in as a new reaction off the parry path
  (combat.js:71) → a `slip` state that feeds Phase 3's counter blow.

**config.js** — `DASH_ATTACK_*`, `WALLSPLAT_*`, `PUSHBLOCK_*`, `FEINT_*`.

---

# Cross-cutting checklist (apply per phase as it lands)
- [ ] `config.js` — all new tunables grouped + commented.
- [ ] `render.js` — placeholder pose for every new `animKey()`.
- [ ] `combat.js` — `MOVE_LABELS` kill-feed entries for new moves.
- [ ] `sfx.js` — new sound names (silent until files dropped in `assets/sfx/`).
- [ ] `ANIMATION-SPEC.md` — new anims with frame counts for the sprite commission.
- [ ] `README.md` — controls table + move list + mechanic blurbs.
- [ ] Manual playtest on `dev` (system keys: `4` = CPU, `0` = hitbox debug).
