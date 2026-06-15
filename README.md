# Mindless Brawler — Prototype

> MMA in a phone booth that occasionally summons a mech.

Vanilla JS + canvas, no build step, no dependencies. This is roughly **Slice 0–3
of the design bible in one pass**: the pocket/weight feel, stun strings + enders
with decay, parry, knockdown + the one soccer-kick punish, stamina, meter, and
the Mech Cannon super — all with placeholder capsule-dude rendering.

## Run it

Open `index.html` in a browser. That's it. (Or `python3 -m http.server` and hit
`localhost:8000` if you prefer.)

## Controls

|              | P1            | P2            |
|--------------|---------------|---------------|
| Move         | A / D         | ← / →         |
| Crouch       | S             | ↓             |
| Up-modifier  | W (NOT jump)  | ↑ (NOT jump)  |
| Punch        | F             | K             |
| Kick         | G             | L             |
| Jump         | Space         | ;             |
| Super        | H             | '             |

- **Double-tap toward** opponent = run. **Double-tap away** = backdash (brief invuln).
- **Hold away** = block. **Hold down+away** = low block (sweeps/leg kicks are lows).
- **Tap away just before impact** (≤7 frames) = **parry** → attacker staggered, you get the opening + meter.

**New in the v0.3 combat update:**
- **Clinch** — `P+K` in range ties them up: dirty punches, a stamina-draining body knee, a judo throw on back, or break out. They mash to escape; it auto-releases.
- **Knockdown teching** — at the **first ground bounce**, tap **away** = back-roll tech (roll clear, invuln) or **JUMP** = kip-up tech (spring up in place). Tight window; denies the ground juggle.
- **Okizeme** — on wakeup: tap a direction = roll · hold **down** = delay your getup · attack = wakeup reversal (death on whiff). Being thrown? **mash P+K** to tech it.
- **Counter-hits** — catch them in a move's **startup** and the screen flashes: you slip it and answer with a hard counter blow (big damage, hard knockdown).
- **Feint** — **back + JUMP** during a normal's startup cancels it (stamina) — bait the parry, then whiff-punish.
- **Pushblock** — **P+K while blocking** shoves the attacker off (stamina) — a corner-pressure escape valve.
- **Slip** — **crouch-block + tap back** under an overhead/jump-in ducks it straight into a counter.

System keys: `1` P2 human · `2` P2 idle dummy · `3` P2 auto-block dummy ·
`4` **P2 CPU (it fights back)** · `5` fill both meters · `0` toggle hitbox/debug view.

A kill-feed of landed strikes (top center) names everything that connects —
blocked hits, parries, judo tosses, tip-knee gas-outs, executions included.

## Sound effects

Drop files into `assets/sfx/<name>.mp3` (or `.wav`/`.ogg`) and they play
automatically — missing files are silent, so add them in any order. Names the
game fires:

| Category | Names |
|---|---|
| Impacts | `hit_light` `hit_med` `hit_heavy` `body_blow` (knee) `block` `parry` |
| Swings | `whoosh_light` `whoosh_heavy` `fly_takeoff` |
| Movement | `jump` `dash` (run/backdash) `getup` |
| Bodies | `bounce` `body_slam` `ground_pop` `throw_grab` `throw_slam` |
| Stamina | `gassed` |
| Super | `super_freeze` `cannon_fire` `explosion` `meter_ready` |
| Execution | `exec_grab` `exec_punch` `exec_riser` `exec_blast` |
| Match | `fight_start` `ko` |

Nice-to-haves (not wired yet): footsteps, crowd loop, music, announcer.

## Move list (both characters share a kit for now)

| Input            | Move        | Role |
|------------------|-------------|------|
| P                | Jab         | stun string starter, chains |
| → + P            | Cross       | string mid |
| → + P (after cross) | Hook     | **ender**: drops them like a sack of potatoes |
| ↑ + P            | Uppercut    | **ender**: launch → ground bounce → knockdown |
| ← + P            | Spinning backfist | range + lunges forward |
| ↓ + P            | Crouch jab  | fast low-profile string |
| K                | Front kick  | longest poke |
| → + K            | Leg kick    | THE pressure glue: big stun, no pushback, must block low |
| ↓ + K            | Sweep       | low **ender**: knockdown |
| → + K (opp. downed) | Soccer kick | the premium ground hit: biggest pop, biggest damage |
| ↑ + K            | **Axe kick** | overhead **ender** — must be blocked STANDING; slow, heavy, hard knockdown (the knee moved to the clinch). Tap JUMP in startup → flying knee, as before |
| ← + K            | Spinning back kick | huge telegraph, huge lunge, 100 dmg, blasts them ACROSS the stage — no flow cancel, ends exchanges |
| ↑ + K, tap JUMP  | **Flying knee** | the skill shot: POINT-BLANK = 130 dmg (hardest strike in the game) · rising = blast away · TIP of arc = instant full gas-out |
| ↑ + P, tap JUMP  | **Flying uppercut** | invuln rise, 3 hits, launches sky-high — the pop-out-of-pressure reversal, death on whiff |
| **P+K (neutral)** | **CLINCH** | tie them up → **P** dirty punches · **K** body knee (drains stamina) · **←** judo throw · **forward/jump** break. They mash to escape; auto-releases on a timer |
| P+K (mid-string) | **Clinch throw** | judo toss BEHIND you: side switch, corner escape, knockdown (skips the clinch) |
| Run + P / K      | **Dash attack** | committed lunging straight / kick off a run |
| P+K (opp. gassed + <10% HP, close) | **EXECUTION** | grab → 12-hit flurry → wind-up → haymaker wall splat. Match over. |
| P in air         | Air punch   | quick aerial straight |
| K in air         | Air kick    | the jump-in (must be blocked standing) |
| ↓ + K in air     | **Divekick** | steep dive — changes your jump arc, drives them down |
| Super (full meter) | Mech Cannon | cinematic freeze → 20mm shell, ~45% HP, blockable/jumpable |

Flying conversions are range-gated (knee ~500px, uppercut ~260px) — they're
strikes, not movement. Whiffed flights eat a long, punishable landing.

**The relentless rules (v0.2 feel pass):**
- **Flow cancel** — land a hit (or get blocked) and your recovery caps at 4 frames:
  touching them keeps you moving. Whiff and you eat every recovery frame.
- **No dead-stops** — strikes carry your walk/run momentum; holding toward keeps
  you advancing mid-swing (sips stamina).
- **Ground game** — ANY strike hits a downed body, full damage. Kicks/heavies pop
  it off the floor for ground juggles. Two ground hits per knockdown, then they
  rise fast and fully invulnerable — **flashing transparent = untouchable, solid
  = fair game**, always.
- **Whiff tax is heavies-only** — a whiffed jab is a shrug; a raw whiffed
  backfist/uppercut/sweep is how you gas out and die.
- **No hard combo cap** — only soft hitstun decay (same-move repeats decay fast,
  so one-button mash breaks itself; varied strings keep rolling). The real outs
  are parry, retreat-block, pushback, and the attacker's gas tank — hit 0 and
  you're **gassed**: no attacks, no block, wide open.

## Architecture (what survives the sprite pass)

```
js/config.js   every feel/tuning number, nothing else
js/input.js    keyboard → virtual Pads (gamepads later = another Pad filler)
js/moves.js    data-driven move table: frame data, hitboxes, guard, cancel routes
js/fighter.js  the state machine + physics; exposes (animKey(), f) per frame
js/combat.js   hit/block/parry resolution, combo decay, projectiles, push-apart
js/render.js   placeholder renderer — THE file sprites replace
js/ui.js       HUD (read-only view of game state)
js/main.js     fixed 60fps timestep, hitstop/superfreeze/slow-mo gating, match flow
```

**Sprite-swap contract:** a fighter is always in exactly one state with `f` =
frames elapsed, and `animKey()` returns the animation name (state name, or the
move's `anim` during attacks). A sprite renderer keys off `(animKey, f, facing,
x, y)` and replaces `drawFighter` in `render.js`. Move timings in `moves.js`
(startup/active/recovery) are the authoritative frame counts to author sprite
animations against. Nothing in fighter/combat/main changes.

## Known cuts / next steps (per the design bible)

- Clinch/throws, feints, per-character signature counters (slip → counter): not yet.
- Slip→counter would slot in as a new fighter state triggered by a parry variant.
- Per-character kits: give each character their own `MOVES` table + super fn.
- Both fighters currently share the Mech Cannon super as the meter test.

Already built in (so you don't rebuild it): presses are buffered 8 frames and
survive hitstop/super-freeze, and each press snapshots the direction held at
press time — so `cross → hook` comes out even if you release forward during the
freeze beat. Actions consume the buffer via `pad.consume(btn)`.
