# Mindless Brawler — Character Animation Spec (for the artist)

One character, full move set, for a 2D fighting game (think Street Fighter III
style: smooth, expressive, weighty). Play the current prototype to see every
action in motion: **https://jaredb650.github.io/MindlessBrawler/**
(press `4` for a CPU opponent; `0` shows hitboxes; every action below can be
triggered with the controls printed at the bottom of the screen).

## Technical requirements (important!)

- **Draw the character facing RIGHT only.** The game mirrors it automatically.
- **Transparent PNGs.** Either one sheet per animation (frames in a row) or
  individual numbered frames (`jab_0.png, jab_1.png, …`) — artist's choice.
- **Consistent canvas + anchor:** every frame on the same canvas size
  (suggest **320×320**) with the character's standing feet always at the same
  anchor point (suggest bottom-center, ~40px above the bottom edge so low
  poses like the sweep don't clip). The character is ~170px tall standing —
  keep that scale consistent across all animations.
- **Don't draw:** hit sparks, motion-trail afterimages, white hit-flash,
  transparency flashing, screen shake — the engine does all of that. Just the
  character.
- Game logic runs at 60fps but holds each drawing for several ticks — the frame
  counts below are **drawn keyframes**, not 60ths of a second.

## Character design notes

Up to the artist within: modern brawler/MMA energy, reads at small size,
strong silhouette. (In-universe: a normal-looking dude who is secretly
part-cyborg — no visible cyborg parts. One subtle hint, like a faint seam or
glowing detail, is welcome but optional.)

---

## Animation list

### Tier 1 — core loop (game is playable with just these)

| # | Name (file prefix) | Frames | Notes |
|---|---|---|---|
| 1 | `idle` | 4–6 loop | fighting stance, breathing, fists up |
| 2 | `walk` | 6–8 loop | nimble footwork (also plays mirrored for walking back) |
| 3 | `run` | 6–8 loop | aggressive forward rush |
| 4 | `jab` | 4 | guard → snap out → contact → retract. FAST |
| 5 | `cross` | 5 | rear straight, weight transfer |
| 6 | `hitstun` | 3 | head snapped back, reeling |
| 7 | `block` | 2 | standing guard, forearms up (held pose + small flinch) |
| 8 | `blockcrouch` | 2 | crouching guard |
| 9 | `fallheavy` | 3 | drops like a sack of potatoes |
| 10 | `downed` | 2 loop | lying flat on back (slight breathing; also used as the K.O. pose) |
| 11 | `getup` | 3–4 | FAST kip-up / scramble to feet |
| 12 | `crouch` | 2 | drop into crouch + held pose |

### Tier 2 — full kit

| # | Name | Frames | Notes |
|---|---|---|---|
| 13 | `hook` | 6 | big wind-up hook, follow-through — knocks people DOWN |
| 14 | `uppercut` | 6 | rising launcher, whole body |
| 15 | `backfist` | 7 | spinning back fist — full spin, covers ground |
| 16 | `crouchjab` | 4 | crouching body jab |
| 17 | `frontkick` | 5 | long push kick |
| 18 | `legkick` | 5 | muay thai low kick, chopping |
| 19 | `sweep` | 6 | low spinning leg sweep |
| 20 | `knee` | 4 | clinch knee to the body |
| 21 | `backkick` | 8 | spinning BACK kick — big telegraph spin, devastating release, long recovery. The haymaker of the kit |
| 22 | `soccer` | 6 | soccer kick to a downed opponent's head. Full punt |
| 23 | `prejump` | 2 | crouch-load before takeoff |
| 24 | `air` | 2–3 | jump rise + fall poses |
| 25 | `land` | 2 | landing absorb |
| 26 | `jumpkick` | 3–4 | flying side kick held until landing |
| 27 | `backdash` | 3 | quick hop backward |
| 28 | `launched` | 4 loop | airborne tumble (engine may also rotate it) |
| 29 | `parried` | 3–4 | lurching off-balance stagger, totally exposed |
| 30 | `gassed` | 4–6 loop | bent over, heaving, arms dead — EXHAUSTED. Very readable |

### Tier 3 — specials & cinematics

| # | Name | Frames | Notes |
|---|---|---|---|
| 31 | `flyknee` | 4 | leaping knee: takeoff → flight pose (knee leading, flat arc) → drive |
| 32 | `flyuppercut` | 5 | rising corkscrew uppercut (Shoryuken energy), multi-hit on the way up |
| 33 | `throwgrab` | 3 | lunging two-hand collar grab |
| 34 | `throwanim` | 5 | judo hip toss: heave them up and over, behind |
| 35 | `thrown` | 3–4 | being thrown: grabbed → airborne over the shoulder (engine adds tumble) |
| 36 | `superstart` | 4 | super activation: brace + point/signal as the mech materializes behind (the mech itself is NOT in this commission — engine draws it for now) |
| 37 | `execute` | 6–8 | finisher (attacker): collar grab → rapid alternating body flurry (loopable 4) → huge wind-up → mega haymaker |
| 38 | `executed` | 3 loop | finisher (victim): held up, rag-dolling under the flurry |

**Totals:** Tier 1 ≈ 40 frames · Tier 2 ≈ +65 · Tier 3 ≈ +35 → **~140 drawn
frames for everything.** Commission Tier 1 first to validate the pipeline, then
2 and 3.

## Timing reference (authoritative)

Exact game-frame timings (startup / active / recovery at 60fps) for every
attack live in [`js/moves.js`](js/moves.js) — the anticipation → contact →
follow-through proportions of each animation should roughly match those
numbers. E.g. `jab: 2/3/5` = almost no wind-up, instant snap; `backkick:
12/4/26` = long telegraphed wind-up, big follow-through.

## Integration contract (for us, not the artist)

The engine already addresses every animation by `(name, frame)` — the names
above ARE the keys the game uses. When frames arrive, the placeholder renderer
(`js/render.js`) gets swapped for a sprite-sheet lookup and nothing else
changes.
