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
| 36 | `superstart` | 4 | **NEUTRAL** super activation (the Mech Cannon): brace + point/signal as the mech materializes behind (the mech itself is NOT in this commission — engine draws it for now). *Forward+super is a different move — the OVERDRIVE BEAM, see `beamcharge`/`beamfire` in Tier 6.* |
| 37 | `execute` | 6–8 | finisher (attacker): collar grab → rapid alternating body flurry (loopable 4) → huge wind-up → mega haymaker |
| 38 | `executed` | 3 loop | finisher (victim): held up, rag-dolling under the flurry |

### Tier 4 — the v0.3 combat update (clinch, aerials, teching, counters)

| # | Name | Frames | Notes |
|---|---|---|---|
| 39 | `axekick` | 6 | overhead axe kick: leg raises STRAIGHT UP overhead → heel chops down through the body to the floor. Slow, heavy, telegraphed (replaces the standalone `knee` on up+K) |
| 40 | `airpunch` | 3 | aerial straight punch, angled down-forward (held until landing) |
| 41 | `divekick` | 3 | steep dive: body angled, leg extended down-forward, driving toward the floor (held until landing) |
| 42 | `clinchgrab` | 3 | reach into the clinch — two hands snatching the collar/neck |
| 43 | `clinch` | 2–4 loop | the clinch hold: hunched, hands behind the opponent's head, controlling. Readable as "locked up" |
| 44 | `clinched` | 2–4 loop | being held in the clinch: bent, struggling to break free (mirror energy to `clinch`) |
| 45 | `clinchpunch` | 3 | short dirty-boxing uppercut/hook from inside the clinch |
| 46 | `clinchknee` | 3 | driving knee to the body from inside the clinch |
| 47 | `backroll` | 4 | knockdown tech: backward shoulder roll → up to feet (tucked tumble). Also reused for `wakeuproll` |
| 48 | `kipup` | 4 | knockdown tech: lying flat → kick legs up → spring upright in place. Explosive |
| 49 | `wakeuproll` | 4 | wakeup roll (shares the `backroll` tucked-tumble look; engine routes here) |
| 50 | `slipcounter` | 5 | the counter highlight: slip/weave off-axis (duck the incoming) → explode into a hard cross or kick. Cocky, decisive |
| 51 | `countered` | 3 | getting countered: caught mid-windup, head snapping back as the slip-counter lands |
| 52 | `wallsplat` | 3 | pinned flat against the wall on impact, then peeling off (stunned, spread-eagled) |
| 53 | `dashpunch` | 4 | lunging running straight — committed forward drive behind it |
| 54 | `dashkick` | 4 | lunging running kick — committed forward drive behind it |

### Tier 5 — signature specials (the "you earned it" payoffs)

These bloom out of STRINGS (they're never raw neutral options) — the flashy
finishers of a combo. Big personality, strong silhouettes.

| # | Name | Frames | Notes |
|---|---|---|---|
| 55 | `livershot` | 5 | a tight, low LEAD hook digging into the liver/body — deep forward lean, short and mean. (Drops them into the `crumple` stun) |
| 56 | `calfkick` | 5 | a standing low chop to the lead leg, BELOW the knee — drive weight through it. (Buckles them to a knee — the `crumple` kneel variant) |
| 57 | `spinelbow` | 7 | "the Buzzsaw" — a full spinning REAR ELBOW. Body whips 360, the POINT of the elbow leads as the weapon. (Crumples on hit) |
| 58 | `overhand` | 6 | a looping overhand RIGHT — rear fist cocked high & back, loops OVER THE TOP and drops onto the head. (Also the Flatliner finisher — see `crumpled`) |
| 59 | `machinegun` | 4 loop | rapid-fire dirty-boxing flurry — both fists pistoning in & out at the body/head, blurring. Loopable; auto-fires off a 3-jab string |
| 60 | `gazelle` | 6 | a LEAPING lead hook — gazelle-steps off the floor (a low hop, NOT a full jump) and arcs the hook to the head. Launches them up |
| 61 | `tornado` | 8 | a HIGH spinning heel hook — full 360 body spin, lead leg whipping out to head height. Big telegraph, head-hunting payoff |
| 62 | `superman` | 4 | the SUPERMAN PUNCH — leaps off the back foot and FLIES forward, body fully extended, rear fist driving an overhand down. Flat, fast arc; held until landing |
| 63 | `elbowdrop` | 3 | a diving ELBOW DROP from the air — body tucked, rear elbow point spearing down-forward to spike a launched body to the floor (held until landing) |
| 64 | `slidetackle` | 4 | a baseball SLIDE TACKLE along the ground — lead leg scythes out front, body low and committed. (Off a sprint + down) |

### Tier 6 — stuns, finishers & cinematic bodies

Sequencer-driven poses: the artist draws the keyframes, the engine times and
positions both bodies. (`crumpled`, `suplex*`, `gp*` are owned by the engine.)

| # | Name | Frames | Notes |
|---|---|---|---|
| 65 | `crumple` | 3 (+ kneel) | the CRUMPLE stun — a long, open hurt stun: doubled-over and clutching the body (after a liver shot / spinning elbow). The calf kick uses a KNEEL variant (buckled onto one knee). Two looks, one state |
| 66 | `slip` | 3 | a deep defensive WEAVE — duck off the centerline under an incoming high (the read just before a counter lands) |
| 67 | `suplexthrow` | 5 | GERMAN SUPLEX (thrower): clasp the waist, arch BACKWARD into a bridge — hips thrust, both bodies go up & over the top |
| 68 | `suplexed` | 4 | German suplex (victim): hauled up INVERTED, head-first, dumped on the back of the neck/shoulders — spiked into the floor |
| 69 | `gpmount` | 4 loop | GROUND & POUND (attacker): mounted over a downed body, hips low, raining alternating hammerfists straight down |
| 70 | `gpmounted` | 3 loop | ground & pound (victim): flat on the floor, arms up covering, eating the hammerfists |
| 71 | `crumpled` | 4 | THE FLATLINER (victim): frozen bolt-upright on the connecting fist, then the knees buckle and the body folds STRAIGHT DOWN into a heap — the one-punch KO. (Attacker reuses `overhand`, held on the connect) |
| 72 | `beamcharge` | 3 | OVERDRIVE BEAM wind-up (forward+super): rear back, cup BOTH hands at the hip, gathering energy (the engine draws the glowing ball forming) |
| 73 | `beamfire` | 4 | OVERDRIVE BEAM release: thrust BOTH palms forward, whole body braced into the recoil as the beam erupts (the engine draws the beam itself) |

**Totals:** Tier 1 ≈ 40 frames · Tier 2 ≈ +65 · Tier 3 ≈ +35 · Tier 4 ≈ +55 ·
Tier 5 ≈ +52 · Tier 6 ≈ +35 → **~280 drawn frames for everything.** Commission
Tier 1 first to validate the pipeline, then 2 → 6 in order (Tier 6 last — the
engine already animates those, so they're the lowest priority).

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

Two sub-keyed cases for the sprite pass (the artist names above are correct;
these are just wiring notes for us): the directional super shares the
`superstart` state — pick `superstart` vs the beam art off `fighter.superKind`
(`'cannon'` | `'beam'`), and within the beam split `beamcharge` vs `beamfire` on
`f < CFG.BEAM_CHARGE`. The `crumple` state likewise picks its stand vs kneel art
off `fighter.crumpleKind`.
