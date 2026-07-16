// ─────────────────────────────────────────────────────────────
// MindlessBrawler — tuning constants.
// Every number that defines "feel" lives here. Tweak freely.
// Units: pixels, frames (60 logic frames = 1 second).
// ─────────────────────────────────────────────────────────────
const CFG = {
  // Arena — tight and walled. Fixed camera, hard walls, cornering is real.
  STAGE_W: 1280,
  STAGE_H: 720,
  FLOOR_Y: 640,
  WALL_L: 40,
  WALL_R: 1240,

  // 16-bit RETRO filter (js/retro.js) — toggle live with V. Tune by feel:
  RETRO: {
    scale: 2,            // pixel chunkiness: render at 1280/2×720/2 = 640×360, then nearest-neighbor upscale.
                         //   use a CLEAN divisor (2,4,5,8) for uniform pixels — 2 = fine/hi-res retro, 4 = chunky 16-bit, 5 = chunkier.
                         //   NOTE: FX_PX (js/render.js) follows this value, so FX chunks + sparks stay aligned to the retro grid.
    levels: 32,          // colors PER CHANNEL (the "16-bit" banding): lower = more banded/retro. 32≈subtle, 16=punchy, 8=poster.
    quantize: true,      // palette-reduce the buffer (set false for pure pixelation, full color)
    scanlines: false,    // thin CRT scanline overlay
    scanlineAlpha: 0.14, // ...how dark each scanline is
    scanlineGap: 3,      // ...screen px between scanlines
  },

  // Physics
  GRAVITY: 0.85,

  // Locomotion — "light feet": fast, nimble movement. (+15% speed pass)
  WALK_SPEED: 4.83,
  RUN_SPEED: 9.78,
  SLIDE_TACKLE_SPEED: 15,        // initial glide speed of the run+down slide tackle (decays through the move)
  JUMP_VEL: -16.5,
  JUMP_DRIFT_FWD: 6.5,
  JUMP_DRIFT_BACK: 5,
  PREJUMP_FRAMES: 4,
  LAND_FRAMES: 3,
  BACKDASH_SPEED: 11,
  BACKDASH_FRAMES: 16,
  BACKDASH_INVULN: 6,
  DOUBLE_TAP_WINDOW: 12,

  // Vitality — high HP on purpose: you survive long enough for the absurd stuff.
  MAX_HP: 1000,

  // Meter — the gateway to the absurd ceiling. Earned, never given.
  MAX_METER: 100,
  METER_PER_DAMAGE: 0.12,   // attacker meter per point of damage dealt
  METER_ON_PARRY: 15,
  METER_ON_BLOCK: 1,        // attacker gets a trickle for blocked pressure

  // Stamina — THE governor of aggression. Spam is legal; the tank is the law.
  MAX_STAMINA: 100,
  STAMINA_REGEN: 0.4,           // per frame while not attacking
  ADVANCE_REGEN_BONUS: 0.15,    // extra regen while walking the opponent down
  WHIFF_STAMINA_PENALTY: 0.5,   // extra fraction of cost on whiff — HEAVY moves only
  GASSED_FRAMES: 80,            // wide open this long when you hit zero
  GASSED_RECOVER_STAMINA: 40,   // pool refill after gassing out
  BLOCK_REGEN_MULT: 0.5,        // blockstun regens at HALF rate (was zero) — blocking guards your tank too, turtling isn't self-destructive

  // Forward pressure — never stop dead to throw hands.
  MOMENTUM_KEEP: 0.6,           // fraction of walk/run speed carried into a strike
  PRESS_DRIFT: 1.6,             // px/frame advancing while striking (hold toward)
  // AFTERIMAGE TRAIL — when a body moves THIS fast (px/frame), draw fading ghost copies along its path
  // so lunges/dashes/slides/air-flies read as an intentional dash, not a teleport glitch. Tune by feel.
  TRAIL_MIN_SPEED: 8,         // speed floor (px/frame) — a `dashTrail` move only trails while actually dashing this fast (so a standalone thrust's small lunge stays quiet; the combo-magnet dash trails)
  TRAIL_GHOSTS: 5,            // how many ghost copies trail behind (more = longer/heavier trail)
  // Air-dash (Vesper, gated on char.airDash): a double-tap in the air blinks her horizontally once per jump.
  AIR_DASH_VX: 13,              // horizontal blink speed
  AIR_DASH_VY: -2,              // slight lift so it reads as a dash, not a fall
  AIR_DASH_COST: 8,             // stamina
  // Double jump + wall jump (Vesper, gated on char flags).
  DOUBLE_JUMP_COST: 6,          // stamina for the second jump
  DOUBLE_JUMP_MULT: 0.92,       // second jump is a touch weaker than the first
  WALL_JUMP_VX: 9,              // horizontal kick off the wall
  WALL_JUMP_REACH: 54,          // how close to a wall counts as "on it"
  WALL_JUMP_COST: 5,            // stamina; a wall jump REFRESHES her double jump + air-dash
  // BULLET ARTS (Vesper): hold P/K after a CONNECTED strike → trailing gunfire (small bullets).
  BULLET_SPEED: 26,             // px/frame forward
  BULLET_DMG: 6,                // per bullet (combo chip)
  BULLET_HITSTUN: 12,           // brief re-stun — combo glue, no knockdown
  BULLET_INTERVAL: 4,           // frames between rounds while held
  BULLET_MAX: 3,                // rounds per strike
  BULLET_COST: 3,               // stamina per round
  PISTOL_ROUND_DMG: 24,         // ◀P pistol shot (one projectile, CRUMPLES on hit)
  PISTOL_ROUND_SPEED: 22,
  RIFLE_ROUND_DMG: 50,          // ↓K assault rifle: one big fast round, heavy damage + knockback (blast)
  RIFLE_ROUND_SPEED: 44,        // twice the pistol
  // ── Vesper SUPERS ──
  CLIMAX_FRAMES: 44,            // Bullet Climax: how long the barrage fires
  CLIMAX_INTERVAL: 3,          // frames between volleys
  // WRATH OF GOD (Xamora's super): she raises the staff and the sky FALLS — meteors rain across the arena.
  WRATH_FRAMES: 66,            // how long the meteor storm rains
  WRATH_INTERVAL: 6,           // frames between meteor volleys
  WRATH_DMG: 20,               // per-meteor damage (many connect over the window → big total, combo-scaled)
  WRATH_SPEED: 6,              // meteor initial fall speed
  WRATH_GRAV: 0.7,             // meteor downward acceleration
  TANGO_HITS: 7,               // Killer Tango: teleport slashes before the finisher
  TANGO_DELAY: 6, TANGO_INTERVAL: 6, TANGO_RADIUS: 120,
  WITCH_DODGE_FRAMES: 22,      // Witch Time: the dodge window (invuln) that can trigger the slow
  WITCH_TIME_FRAMES: 150,      // how long the world crawls (she stays full speed) on a successful dodge
  WITCH_RANGE: 200,            // (unused gate placeholder)
  PRESS_DRIFT_STAMINA: 0.1,     // ...which sips stamina: relentlessness is a spend
  FLOW_CANCEL_RECOVERY: 4,      // on a clean HIT recovery caps at this — block rides FULL recovery (negative on block), whiffs eat it all

  // MAGIC PUNCH COMBO — jab→cross→uppercut→cross: an inescapable, magnetic grounded string.
  MAGNET_DIST: 76,              // px the attacker latches at (just outside the pushbox so bodies don't separate)
  MAGNET_PULL: 0.5,            // how hard it snaps to that range each frame
  MAGNET_HITSTUN: 15,          // re-stun on each magic-combo hit — covers the next link → inescapable
  PUNCHCHAIN_GRACE: 50,        // frames the magic-combo input chain stays armed between links (loose-timing leniency)
  CANCEL_WINDOW_PAD: 12,        // frames past a move's active window you can still chain-cancel (flow leniency)

  // Defense
  PARRY_WINDOW: 7,              // block held ≤ this many frames before impact = parry
  PARRY_ATTACKER_STAGGER: 28,   // attacker locked out — the opening you earned
  PARRY_HITSTOP: 14,
  BLOCK_PUSHBACK: 4.5,
  CHIP_RATIO: 0.12,             // chip damage fraction on block
  CHIP_FLOOR: 1,                // chip can't KO — hp floors at 1

  // Neutral & defensive tools (Phase 5)
  DASH_ATTACK_LUNGE: 9,         // px/frame forward lunge during a dash attack's startup
  DASH_ATTACK_STAMINA: 6,       // dash attacks cost more than the normal they replace — the run commits you
  WALLSPLAT_MIN_VX: 9,          // a launched body must cross the wall faster than this |vx| to SPLAT (else just rebound)
  WALLSPLAT_FRAMES: 26,         // frames pinned to the wall, fully hittable — the corner-carry juggle window
  WALLSPLAT_DROP_VY: -6,        // small pop when the pin times out — slides down into the bounce/fall path
  WALLSPLAT_SHAKE: 6,           // splat impact shake (heavier than the old rebound's 4)
  PUSHBLOCK_COST: 12,           // stamina to pushblock — priced like a tool, not a super (was 22: nobody used it)
  PUSHBLOCK_PUSH: 22,           // outward shove on the attacker (vs BLOCK_PUSHBACK 4.5) — ~100px: a real reset to footsie range
  FEINT_COST: 14,               // stamina to feint-cancel a startup into neutral — the bait has a price
  FEINT_WINDOW_PAD: 0,          // extra frames past startup the feint stays live (0 = startup only)

  // Combo system — soft decay only. No hard cap: the escape valves are
  // parry, retreat-block, pushback, and the attacker's own gas tank.
  DMG_SCALE_PER_HIT: 0.10,      // each combo hit scales damage down 10%
  MIN_DMG_SCALE: 0.35,
  HITSTUN_DECAY_PER_HIT: 0.06,  // gentle: long strings leak frames eventually
  SAME_MOVE_EXTRA_DECAY: 0.12,  // flow pass: was 0.22 — simple rhythmic pressure (jab jab jab) holds longer
  MIN_HITSTUN_SCALE: 0.30,
  MAX_AIR_HITS: 3,              // juggle limit — after this, hits stop lifting
  GRUNT_DMG: 45,               // a hit dealing at least this much can trigger a random pain grunt
  GRUNT_CHANCE: 0.4,           // ...and only this fraction of the time, so grunts pepper in (not every hit)
  // Gazelle hook — a leaping lead hook off 2 jabs (forward+P). Launches into the air juggle.
  GAZELLE_LAUNCH_VY: -13,       // launch height of the gazelle hook (between hook's drop and uppercut's -13.5 pop) — starts the air juggle
  GAZELLE_HOP_VX: 6.5,          // forward leap speed of the gazelle-step (seeded into attackDrift, glides/decays through the swing)
  GAZELLE_HOP_APEX: 28,         // px the body rises at the leap peak — LOW enough that the hook's hitbox still meets a standing body (was 64: flew clean over the opponent's head)

  // IMPACT ENERGY — landing violence scales with how hard the body ACTUALLY hit.
  // energy = |vy| + IMPACT_VX_WEIGHT·|vx| at every launched body-vs-surface contact:
  // high falls integrate into vy for free (gravity), fast tumbles carry the vx term.
  // The tier drives every juice channel at once (blood / dust / shake / sfx layer /
  // stains / micro-hitstop). `hardSlam` (armed by spike-class moves in receiveSpike)
  // forces the TOP tier on the next contact — spikes always read brutal. Corpses get
  // an energy bump. Techs never reach the juice (clean escapes stay clean).
  IMPACT_VX_WEIGHT: 0.6,        // how much horizontal tumble speed counts toward the crunch
  IMPACT_KO_BONUS: 6,           // a corpse hits a tier harder (dead weight)
  IMPACT_TIERS: [               // ascending: highest `min` ≤ energy wins
    { min: 5,  blood: 4,  power: 0, dust: 8,  shake: 3 },                                                        // thud
    { min: 13, blood: 14, power: 1, dust: 13, shake: 5, sfx: 'hit_heavy2', stains: 2 },                          // slam
    { min: 18, blood: 26, power: 2, dust: 20, shake: 8, sfx: 'hard_slam', stains: 4, upBurst: 12, hitstop: 5, flash: true },   // brutal — blood knocked OUT of them (hard_slam = flesh+bone crunch, NOT the wall-spike sting)
  ],

  // Knockdown / ground game — downed bodies are HITTABLE (full damage).
  // Kicks/heavies pop them off the floor for ground juggles; after
  // MAX_GROUND_HITS they rise fast, fully invulnerable, flashing transparent.
  MAX_GROUND_HITS: 2,
  GROUND_POP_VY: -9.5,          // default pop height (soccer overrides higher)
  KNOCKDOWN_FRAMES: 55,
  FALL_FRAMES: 12,              // "sack of potatoes" collapse time
  GETUP_FRAMES: 14,             // fast getup, fully invulnerable
  GETUP_INVULN_EXTRA: 8,        // still invulnerable briefly once actionable
  GROUND_BOUNCE: 0.45,          // bounce factor on hard landings
  BOUNCE_MIN_VY: 6,             // landing slower than this doesn't bounce

  // Ground tech — the defender's half of the knockdown game. At FIRST floor
  // contact of a launched body, a tight buffered-input read lets them escape the
  // OTG juggle: fresh BACK = invuln roll away, JUMP = fast kip-up. KO launches,
  // the point-blank flying knee, and the execution are un-techable (noTech flag).
  TECH_WINDOW: 5,               // read window (frames) — TIGHT: a skill check, not a gift
  BACKROLL_SPEED: 7.5,          // px/frame of the back-roll (eased out)
  BACKROLL_FRAMES: 20,          // roll duration → idle
  BACKROLL_INVULN: 16,          // invuln during the roll (tail is punishable)
  KIPUP_FRAMES: 14,             // spring-up duration → idle
  KIPUP_INVULN: 8,              // brief invuln — kip-up stays in the pocket, less safe
  DI_NUDGE: 2.2,                // directional influence: hold a way to bend the launch arc

  // Okizeme — the defender's wakeup half. Off `downed`/`getup`:
  //   tap DOWN (hold) → delay your getup · tap a DIRECTION → reposition roll
  //   buffer P/K through the early rise → REVERSAL (death on whiff, like fly-uppercut)
  WAKEUP_REVERSAL_WINDOW: 5,    // early-getup frames a buffered P/K reads as a reversal
  WAKEUP_REVERSAL_RECOVERY: 16, // whiffed reversal eats this MUCH extra recovery — punishable
  DELAYED_GETUP_MAX: 40,        // holding DOWN while downed extends the floor timer this much
  WAKEUPROLL_SPEED: 9,          // px/frame reposition roll, eased out
  WAKEUPROLL_FRAMES: 16,        // roll duration before standing
  WAKEUPROLL_INVULN: 12,        // invuln on the roll — SHORTER than the roll: tail is exposed

  // Throw tech — mash P+K in the first few frames of being thrown (or clinched) to break out.
  THROW_TECH_WINDOW: 6,         // techable frames after the grab connects
  THROW_TECH_PUSHBACK: 8,       // outward shove on BOTH bodies on a clean tech (neutral reset)

  // Hitstop ("time-freeze beat") & juice
  HITSTOP_LIGHT: 8,             // flow pass: was 4 (~half the genre norm) — more weight + a wider cancel window
  HITSTOP_MED: 10,              // flow pass: was 7
  HITSTOP_ENDER: 16,
  SUPER_FREEZE: 40,
  SHAKE_HEAVY: 7,
  SHAKE_MED: 3,                 // every solid hit shakes a little — med/light tiers so a cross isn't flat
  SHAKE_LIGHT: 1.5,
  HIT_FLASH: 3,                 // frames the body flashes white on a CLEAN contact (universal, frame-locked to the hit)
  HIT_FLASH_BLOCK: 2,          // shorter white blip on block
  HIT_VIB: 3,                   // px the freshly-hit body vibrates during the hitstop freeze (a freeze without jitter reads as a dropped frame)

  // RENDER INTERPOLATION — logic is a fixed 60fps; render lerps body positions
  // between ticks so motion is smooth on >60Hz displays (144Hz no longer shows the
  // same frame 2-3× in a row). Visual only — hitboxes/sfx/state never interpolate.
  RENDER_INTERP: true,
  INTERP_SNAP: 120,             // a prev→current jump bigger than this is a TELEPORT (reset/wall-snap) → don't glide it
  KO_SLOWMO_FRAMES: 90,
  KO_FLASH: 12,                 // screen-flash frames on EVERY KO (shared KO-juice helper)
  KO_FREEZE: 20,                // KO cinematic: world freezes on black, just white silhouettes, before the launch
  KO_KNOCKBACK_MULT: 1.5,       // KO blows launch 1.5x harder — sends the loser flying, cinematic
  HEAVY_BLOOD: 16,              // blood particles spurted on every HEAVY hit (HITSTOP_ENDER tier)

  // Crumple stun (shared: liver shot / spinning elbow / calf kick). One state,
  // one router, one timer. Stand = doubled-over body-shot freeze; kneel = buckle.
  CRUMPLE_FRAMES: 34,           // shared default open window (kneel/elbow)
  LIVERSHOT_CRUMPLE_FRAMES: 46, // liver shot's longer body-shot freeze (via move.crumpleFrames)
  LIVERSHOT_DRAIN: 30,          // stamina ripped by the liver shot

  // SUPER-ARMOR. MOVE-armor is generic: any move flagged `armor:N` eats N hits through
  // its commital windup (Xamora's slam/ring-smash/smite; MEKA's robot-arm backfist +
  // overhand — the cyborg arm doesn't flinch). WALK-armor (eating hits while advancing,
  // stamina-priced) stays Xamora-exclusive. Reduced damage still lands (a trade, never
  // free). Counterplay is built in: THROWS bypass it (a grab overwrites the 'attack'
  // state), MULTI-HIT breaks it (the N cap), and an `armorBreak:true` move blows through.
  ARMOR_CHIP: 0.7,              // fraction of damage still taken through armor (a trade, never free)
  ARMOR_WALK_STAMINA: 34,       // stamina drained per hit eaten while walking → self-limits to ~2 advancing hits

  // OVERCLOCK (MEKA — char.overclock flag): below the HP threshold the cyborg redlines —
  // stamina regen ramps up (comeback fuel) and the body crackles. Reuses existing systems only.
  OVERCLOCK_HP_FRAC: 0.3,       // hp fraction at/below which the overclock kicks in
  OVERCLOCK_REGEN_MULT: 1.6,    // stamina regen multiplier while overclocked (stacks with the blockstun half-rate)

  // MINDLESS RAMPAGE (GIIIOOO's super — an INSTALL, not a hit). His kill condition: meter
  // fills fast, damage is tiny... until he pops it and the street kid turns into a beast.
  // While it runs: damage multiplied, movement faster, afterimages + crackle. When it
  // expires in neutral he CRASHES — briefly winded (all-in has a price).
  RAMPAGE_FRAMES: 480,          // install duration (~8s)
  RAMPAGE_DMG_MULT: 2.2,        // every hit lands MUCH harder during the rampage — god mode, not a buff
  RAMPAGE_SPEED_MULT: 1.35,     // walk/run speed multiplier while raging — visibly faster, not subtly
  RAMPAGE_CRASH_FRAMES: 30,     // winded beat when it expires in neutral (reuses the gassed state, shortened)
  // (char.rampageArmor: every attack windup has 1 hit of super-armor while raging — he does not flinch)

  // ── BLACKWILL (char #5): heavy grappler — machete, chainsaw, throwables ──
  // MOLOTOV (◀K): an UNDERHAND sling — flat, fast, and FAR (his long-range tool; the
  // grenade owns mid-range with its lob-and-bounce). Splashes into the fire pool on impact.
  MOLOTOV_VX: 13, MOLOTOV_VY: -4.5, MOLOTOV_GRAV: 0.42,
  MOLOTOV_DMG: 22,              // the bottle itself on a direct hit (the pool is the point)
  FIREPOOL_FRAMES: 170,         // how long the flames burn (~2.8s of area denial)
  FIREPOOL_W: 130,              // width of the burning patch
  FIREPOOL_TICK: 14,            // a burn every N frames while standing in it...
  FIREPOOL_DMG: 6,              // ...for this much (chip pressure, not a killer)
  // GRENADE (↓K): bounces a couple times, then EXPLODES — AoE launch + moderate damage.
  GRENADE_VX: 5.2, GRENADE_VY: -9.5, GRENADE_GRAV: 0.5,   // shorter first hop — the grenade OWNS mid-range, the molotov owns far
  GRENADE_BOUNCE: 0.55,         // floor-bounce restitution (it skips a couple times)
  GRENADE_FUSE: 75,             // frames until detonation
  GRENADE_DMG: 55,
  GRENADE_RADIUS: 130,          // blast reach from the detonation point
  // CHAINSAW RIP — his P+K command grab (replaces the clinch, like Xamora's Talon Snatch):
  // grabs you and SAWS. Mash to shove him off early (same feel as the ground&pound mash-out).
  SAW_GRAB_FRAMES: 12,          // the grab/rev beat before the teeth bite
  SAW_TICKS: 6,                 // saw bites if you don't escape...
  SAW_TICK_EVERY: 8,            // ...one every N frames
  SAW_TICK_DMG: 16,             // per bite (~96 total — heavy, but mashable)
  SAW_ESCAPE_THRESHOLD: 50,     // victim mash (× CLINCH_MASH_PER_PRESS) to break the grip early
  SAW_HURL_VX: 10, SAW_HURL_VY: -8,   // the contemptuous throw-away when he's done
  SAWPLUNGE_STUCK_FRAMES: 34,   // a WHIFFED plunge jams the saw in the floor — he wrenches it out, fully punishable
  SAWPLUNGE_OTG_BONUS: 45,      // finishing a FLOORED body with the plunge pays extra (the meteor-elbow rule)

  // SCORCHED EARTH — his super: he pulls a Milkor-style GRENADE LAUNCHER and thumps out
  // SIX impact grenades — fast, flat, tight arcs, exploding ON IMPACT (direct hit = huge,
  // near miss = AoE knock) — then shoulders a ROCKET for the straight-line finale.
  SCORCHED_NADES: 6,            // rounds in the cylinder
  SCORCHED_NADE_INTERVAL: 15,   // a THUMP every quarter second — a bombardment, not a spray
  SCORCHED_ROCKET_DELAY: 34,    // the half-second SWAP beat — he drops the MGL and shoulders the Gustav
                                //   (and the victim gets back UP from the barrage, so the rocket hits them STANDING)
  IMPACT_NADE_VX: 13,           // round 1 lands mid-screen...
  IMPACT_NADE_STEP: 2.3,        // ...and each thump reaches FURTHER — round 6 crosses ~75% of the stage
  IMPACT_NADE_VY: -2.6,         // just enough loft for the tight arc
  IMPACT_NADE_GRAV: 0.3,
  IMPACT_NADE_DMG: 55,          // a DIRECT hit hurts badly (×6 potential — blockable, chip applies)
  IMPACT_NADE_AOE_R: 110,       // near-miss blast reach...
  IMPACT_NADE_AOE_DMG: 32,      // ...for real chip + a knock
  ROCKET_VX: 19,                // dead straight, chest height
  ROCKET_DMG: 190,              // eating the rocket is a CATASTROPHE
  ROCKET_DIRECT_FREEZE: 26,     // direct hit: the world stops on the impact... then the whiteout sends them flying
  ROCKET_AOE_R: 190,            // the massive detonation
  ROCKET_AOE_DMG: 75,
  // GRENADE COOK — hold K through the toss to cook it: he stands holding the live grenade,
  // the fuse burning down, and releases a shorter-fuse (even instant) blast. A declared bet.
  GRENADE_COOK_MAX: 48,         // max frames the throw can be held (fuse shrinks 1:1)
  // MOLOTOV ARC CONTROL — the held direction at release aims the lob: forward = deep
  // downfield arc, back = drop it at his feet (oki/wall), neutral = the standard toss.
  MOLOTOV_LONG_MULT: 1.5,
  MOLOTOV_SHORT_MULT: 0.5,
  // IRON WILL — below this HP fraction his ARMORED moves absorb one extra hit. The
  // wounded bull is harder to stop (comeback pressure that still loses to throws/grabs).
  IRONWILL_HP_FRAC: 0.35,

  // GIIIOOO boxer tech (research pass): the WEAVE — his backdash doubles as a boxer's sway.
  WEAVE_CANCEL_COST: 6,         // stamina to dissolve a CONNECTED string into the weave (back+JUMP mid-string)
  WEAVE_COUNTER_WINDOW: 8,      // backdash frames in which P converts to the CHECK HOOK counter (dart back in)
  PERFECT_WEAVE_WINDOW: 40,     // an attack WHIFFING through his sway opens this window — a check hook inside it fires the full slip-counter CINEMATIC
  // SAW REV (Blackwill): hold K through the SAW SWING windup — the saw screams, and the
  // charge converts into EXTRA TEETH: 4 bites base, up to EIGHT fully revved.
  SAW_REV_MAX: 48,              // max frames the rev can be held (armor 1 covers the gamble — barely)
  SAW_REV_BITE_EVERY: 12,       // every N revved frames = +1 bite...
  SAW_REV_BITES_MAX: 4,         // ...capped at +4 (the full 8-tooth scream)
  // GROUND CRUSH (Blackwill's EXECUTIONER): the meteor-elbow beat delivered FROM THE GROUND —
  // the overhand slams a standing body flat, pins it crushed under the lights-down beat,
  // then the floor erupts them skyward. His answer to the meteor elbow, no jump required.
  GROUNDCRUSH_VY: -24,          // the delayed eruption launch
  GROUNDCRUSH_FREEZE: 22,       // impact freeze under the dim
  GROUNDCRUSH_DELAY: 4,         // live frames crushed flat after the freeze, then the eruption

  // (grenade afterfire was CUT — fire is the MOLOTOV's identity; the grenade's is the boom)

  // THE FLATLINER — just-frame overhand off the machine-gun's FINAL hit → one-punch KO.
  // A clean primed overhand diverts into the shared cine harness (kind:'flatliner') instead
  // of the blast: small impact hitstop, white flash, freeze, body crumples, round ends.
  FLATLINER_JF_WINDOW: 3,       // just-frame window (frames after the machine-gun's final hit) — widened (was 1): his signature one-punch KO should actually happen in matches; still a timing read, most overhands stay the regular (electric) one
  FLATLINER_FLASH: 12,          // white-flash frames on the connect (reuses game.flash)
  FLATLINER_SLOWMO: 70,         // slow-mo frames after the release (reuses game.slowmo)
  FLATLINER_FREEZE: 26,         // beat 1: dead-still freeze on the connected fist (runFlatlinerCine OWNS this — startCine sets only a small hitstop)
  FLATLINER_CRUMPLE: 28,        // beat 2: the body folds straight down into a heap (also drives the render fold)
  FLATLINER_END: 54,            // beat 3 (= FREEZE+CRUMPLE): release → hp 0, both reset, round ends
  FLATLINER_DMG: 240,           // the KO punch's damage (overkill — it ends the round regardless)

  // Flying moves — tap jump during knee/uppercut startup to convert.
  // Range-gated so they're strikes, not a movement exploit.
  FLY_KNEE_RANGE: 500,
  FLY_UPPERCUT_RANGE: 260,
  FLY_LAND_RECOVERY: 16,        // whiffed flight = long, punishable landing
  FLY_LAND_RECOVERY_HIT: 6,
  SUPERMAN_VX: 15,              // flat, FAST forward leap of the superman punch (× facing) — crosses a big chunk of the stage
  SUPERMAN_VY: -8.5,           // shallow upward hop: the arc stays FLAT (a dive, not a jump)
  GROUND_BOUNCE_VY: -8,        // shared: groundBounce moves pop a standing victim up so the slam triggers the existing bounce

  // Aerials — air P / air K / divekick (one attack per jump, gated by usedAirAttack).
  // Divekick redirects your jump arc steeply down-forward on start, then plants
  // hard on whiff. Air punch is the safe, low-commitment air poke.
  DIVEKICK_VX: 9,                 // forward punch of the dive (× facing)
  DIVEKICK_VY: 15,                // downward dive speed (positive = down)
  DIVEKICK_LAND_RECOVERY: 14,     // whiffed dive = long, punishable landing
  AIRPUNCH_LAND_RECOVERY: 5,      // air punch = short, safe landing

  // Elbow drop — MEKA's air down+P: a slow STRAIGHT-DOWN meteor elbow. The grounded
  // super-punish: combo someone onto the floor, then land ON the downed body → a
  // crescent-slam-style eruption launch (the OTG finisher). vs standing = a small
  // brush-aside; vs airborne = the spike (unchanged). Landing always erupts the floor.
  ELBOWDROP_VX: 7,                // forward dive of VESPER's dive-grab elbow (× facing) — hers keeps the old arc
  ELBOWDROP_VY: 13,               // downward dive speed of Vesper's version (positive = down)
  ELBOWDROP_DROP_VY: 16,          // MEKA's meteor drop: dead-vertical fall speed (no forward travel)
  ELBOWDROP_LAND_RECOVERY: 36,    // MEKA's crash-landing plant: the full 6-cell @10fps crash-and-rise sheet (0.6s).
                                  // Deliberately long, uncancellable, and fully hittable — the meteor's price tag.
  ELBOWDROP_OTG_BONUS: 110,       // flat bonus on a DOWNED body (on top of base) — the finisher payoff
  ELBOWDROP_OTG_VY: -30,          // the eruption launch off a downed body — the HARDEST launch in the game (crescent is -25): "THIS is what the move is for"
  ELBOWDROP_FREEZE: 26,           // the nuke's impact freeze (hitstop) — held under the lights-down IMPACT FADE (execution-style dim, NOT the KO blackout: that read as a K.O.)
  ELBOWDROP_LAUNCH_DELAY: 4,      // live frames the victim stays CRUSHED flat on the floor after the freeze releases, THEN erupts — smashed INTO the ground, not just flying up
  ELBOWDROP_NUKE_RANGE: 95,       // a DOWNED body this close to the LANDING point gets the nuke (the eruption IS the hit — resolves at touchdown, not mid-fall)
  ELBOWDROP_SHOVE_VX: 11,         // a STANDING victim is brushed aside by the eruption (small dmg, knocked away — not the point of the move)
  ELBOWDROP_AOE_RANGE: 150,       // eruption reach: grounded foes this close to the impact get the shove (direct or near-miss — one rule)
  ELBOWDROP_AOE_DMG: 18,          // ...for chip damage (the eruption, not the elbow)
  ELBOWDROP_SPIKE_VY: 16,         // vy DRIVEN into an AIRBORNE victim on hit — well past BOUNCE_MIN_VY (6) → hard bounce + OTG
  AXEKICK_SPIKE_VY: 15,           // the axe kick chops bodies DOWN into the floor too (grounded + tumbling) → bounce
  SPIKE_LIFT: 62,                  // a STANDING spike victim is yanked this high into a mid-air tumble first, THEN rocketed down → a real slam + bounce (not a quiet thud-to-downed)

  // ELECTRIC OVERHAND — the charged overhand: a horizontal SIDE SPIKE + a lingering electrocution.
  SIDESPIKE_VX: 48,                // horizontal launch force (× away) — blasts them flat across the stage (FAST)
  SIDESPIKE_LIFT: 84,              // lifted to ~head height (where the overhand strikes) so they fly flat into the wall
  SIDESPIKE_FRAMES: 36,            // frames of REDUCED gravity (the dead-flat flight window)
  SIDESPIKE_GRAV_MULT: 0.12,       // gravity SUPPRESSED (not zero) during the flight → flies straight, sags slightly
  SIDESPIKE_WALL_DMG: 130,         // a side-spiked body that SLAMS the wall takes SIGNIFICANT extra damage (can KO)
  SIDESPIKE_WALL_SHAKE: 16,        // the wall-spike screen rumble (vs the normal WALLSPLAT_SHAKE 6)
  SIDESPIKE_WALL_FREEZE: 24,       // extra-long IMPACT FREEZE on the wall spike (vs HITSTOP_ENDER 16) — the weight beat
  SIDESPIKE_WALL_FLASH: 7,         // white screen-flash frames on the wall spike
  SIDESPIKE_WALL_KICK: 1.6,        // directional camera-kick strength (× shake) AWAY from the wall, into the stage
  WALLSPIKE_SLIDE_SPEED: 3,        // px/frame the wall-spiked body slowly slides DOWN the wall
  WALLSPIKE_SLIDE_FRAMES: 34,      // how long it slides (smearing a blood trail) before peeling off
  OVERHAND_FREEZE: 26,             // dramatic hit-freeze when the charged overhand lands
  OVERHAND_FLASH: 10,              // white flash on the connect
  ELECTRIC_BURST: 46,              // electric particles in the on-hit explosion (bigger blast)
  SIDESPIKE_BURST: 22,             // particles in the side-spike's own launch burst (horizontal energy)
  ELECTRIC_FRAMES: 168,            // electrocution duration (~2.8s) — DoT + seize, begins once they land
  ELECTRIC_TICK: 14,               // passive-damage cadence (a jolt every ~0.23s)
  ELECTRIC_DMG: 7,                 // HP per jolt (~12 jolts → ~84 over the shock)

  // Clinch throw — punch+kick mid-string: judo toss BEHIND you (side switch)
  THROW_RANGE: 220,            // matched to CLINCH_GRAB_RANGE (was 360 — a vacuum grab from a third of the arena)
  THROW_DMG: 50,
  THROW_FRAMES: 26,             // canned arc over your head

  // German Suplex — clinch up+P+K: backward over-the-head bridge that SPIKES
  // them head-first BEHIND the thrower (side switch). Bigger than the judo toss.
  SUPLEX_STAMINA: 16,           // costs more than clinchknee (4) — a committed finisher
  SUPLEX_DMG: 130,             // the spike — hardest throw in the game (vs THROW_DMG 50)
  SUPLEX_FRAMES: 32,           // canned bridge arc duration (a touch longer than THROW_FRAMES 26)
  SUPLEX_ARC_H: 150,           // peak height of the over-the-head bridge (vs throw's 120)
  SUPLEX_BACK_DIST: 95,        // px the victim lands BEHIND the thrower (over the head, far side)
  SUPLEX_TECH_WINDOW: 6,       // mash P+K within this to break the bridge (reuses thrown-tech feel)

  // Vesper cinematic finishers (scissor takedown / 3-shot execution / skeet / auto-kick followups)
  CMDGRAB_RANGE: 200,          // reach for the chain command grabs (EXECUTION / SKEET) at the gun fire-frame
  SCISSOR_FRAMES: 18,          // scissor windup before the throw-down
  SCISSOR_HANG: 16,            // beat Vesper holds FROZEN airborne while the victim drops
  SCISSOR_AIR_H: 168,          // how high she freezes during the takedown
  SCISSOR_DMG: 130,            // the slam
  SCISSOR_SPIKE_VY: 23,        // victim DOWN-spike velocity (positive = into the floor → bounce)

  // TALON SNATCH — Xamora's winged command grab (P+K): hoist the foe overhead on the staff, then SLAM.
  TALON_FRAMES: 18,            // the lift (foe hauled up off the floor)
  TALON_HANG: 10,             // beat she holds them at the apex before the slam
  TALON_LIFT_H: 150,          // how high the victim is hoisted
  TALON_DMG: 140,             // the slam payoff (her heaviest grab — the catch-and-kill identity)
  TALON_SPIKE_VY: 20,         // down-spike velocity into the floor (untechable)

  // SKY TALON — the AIR command grab (air ↑K): she snatches a jumping foe and HURLS them into the ground.
  SKYTALON_AIR_H: 196,        // how high she hovers (winged) holding them
  SKYTALON_GRIP_H: 150,       // height the victim is gripped at before the hurl-down
  SKYTALON_FRAMES: 13,        // the grip beat
  SKYTALON_HANG: 13,          // the hurl-down arc duration
  SKYTALON_DMG: 120,          // the air-slam payoff
  EXEC3_STEPBACK: 130,         // px Vesper backs off to execute
  EXEC3_DELAY: 16,             // frames before the first shot
  EXEC3_INTERVAL: 15,          // frames between the 3 shots
  EXEC3_DMG: 42,               // damage per execution shot
  EXEC3_TUMBLE_VX: 13,         // the last shot sends him tumbling away
  EXEC3_TUMBLE_VY: -9,
  SKEET_KICK_FRAME: 8,         // frame the launching kick lands
  SKEET_RISE: 4,               // px/frame the 'clay pigeon' climbs after the kick
  SKEET_AIR_H0: 70,            // starting height of the kicked-up victim
  SKEET_BLAST_FRAME: 30,       // frame the shotgun fires
  SKEET_KICK_DMG: 26,
  SKEET_BLAST_DMG: 95,
  SKEET_BLAST_VX: 10,
  SKEET_BLAST_VY: -7,
  KICKFOLLOW_WINDUP: 32,       // frames before the auto-followup (heel-spike / side-kick) 2nd hit lands — also the window the follow-up sprite animates across (raised from 7 so sheets play out)
  KEBAB_CARRY_FRAMES: 14,      // SHISH KEBAB: frames spent dragging the impaled victim to the wall
  KEBAB_REACH: 96,             // how far behind the victim Vesper stays (blade-length) during the carry
  KEBAB_DMG: 120,              // the stab-through-and-pin damage

  // Xamora (char #3) — winged bo-staff heavy zoner
  GLIDE_GRAV_MULT: 0.30,       // wings: gravity while gliding (hold JUMP falling) — a slow, drifting descent
  GLIDE_MAX_VY: 3.2,           // terminal fall speed while gliding (she hangs)
  GLIDE_DRIFT: 0.35,           // horizontal nudge per frame while gliding + holding a direction
  WISP_DMG: 26, WISP_SPEED: 9, // drifting magic orb (her main ranged poke)
  TREMOR_DMG: 54, TREMOR_SPEED: 11,  // traveling ground shockwave that DETONATES — tons of damage
  VACUUM_DMG: 8, VACUUM_SPEED: 7,    // the GAP-CLOSER orb: low damage, its job is the PULL not the hit
  VACUUM_PULL: 16,             // how hard the vacuum orb yanks the victim toward her (the "get over here")
  LANTERN_DMG: 30,             // the placed-trap orb: detonates on contact, pops them up (juggle/grab follow)
  LANTERN_LIFE: 170,           // frames the lantern hangs in space before it fizzles (~2.8s of zoning)
  LANTERN_ARM: 8,              // arming delay — it can't detonate the instant it's cast (it's a TRAP, not a melee)
  TIPPED_STAMINA_LOCK: 120,    // Extend Thrust SWEET SPOT: frames the victim is held at ZERO stamina (winded) — gassed on wakeup
  CRESCENT_BONUS: 95,          // CRESCENT SLAM: huge bonus on a DIRECT hit (on top of base×dmgMult) → THE most damaging non-special
  CRESCENT_FREEZE: 36,         // the WORLD STOPS — a long hitstop the instant it connects (cinematic impact)
  CRESCENT_BOUNCE_VY: -25,     // they're slammed to the floor then BOUNCE very high into the air
  CRESCENT_AOE_RANGE: 175,     // a WHIFFED slam erupts the ground: foes within this range get knocked back
  CRESCENT_AOE_DMG: 24,        // ...for chip damage (the explosion, not the direct slam)

  // Clinch — neutral P+K locks the bodies together: dirty boxing, body knees,
  // a judo throw off BACK, and a mash-escape for the victim. Auto-releases.
  CLINCH_GRAB_RANGE: 220,        // P+K grab range (clinch grab / Xamora Talon) — pulled back from the 375 over-reach (orig 125)
  // grabs slide INTO the reach with leftover momentum → a walk/dash grab reaches further
  GRAB_SLIDE_WALK: 4.5,          // forward px/frame a grab carries when started from a walk
  GRAB_SLIDE_RUN: 8.5,           // ...and from a dash (run) — a real lunging snatch
  GRAB_SLIDE_DECAY: 0.82,        // the slide bleeds off across the reach frames
  CLINCH_REACH_FRAME: 6,        // 'clinchgrab' tests the lock on this frame
  CLINCH_WHIFF_RECOVERY: 22,    // whiffed grab eats this many frames
  CLINCH_MAX_FRAMES: 150,       // auto-release timer on the hold (~2.5s)
  CLINCH_DIST: 78,             // px the bodies are pinned to each frame while clinched
  CLINCH_ESCAPE_THRESHOLD: 60,  // victim mash must cross this to break free
  CLINCH_MASH_PER_PRESS: 10,    // mash gained per fresh button/dir press
  CLINCH_BREAK_PUSHBACK: 9,     // outward shove on BOTH bodies when the clinch breaks

  // Execution — opponent gassed + below this HP fraction + close → P+K finishes them
  EXECUTE_HP_FRAC: 0.10,
  EXECUTE_RANGE: 120,

  // Ground & Pound — P+K standing over a DOWNED opponent (close) → mount + 4
  // hammerfists that DRAIN STAMINA and deal HP (can finish a low body). Re-seats
  // them downed (true oki) if they survive. Cooldown stops immediate re-mount looping.
  GROUNDPOUND_RANGE: 110,        // must be this close to a downed body to mount (tighter than EXECUTE_RANGE)
  GROUNDPOUND_DRAIN_PER_HIT: 16, // stamina ripped per hammerfist (4 hits → up to 64; can gas them out)
  GROUNDPOUND_DMG_PER_HIT: 34,   // HP per hammerfist (4 hits → ~136; a finished-off body gets KO'd)
  GROUNDPOUND_COOLDOWN: 70,      // attacker lockout after a pound — can't instantly re-mount the same wakeup (> KNOCKDOWN_FRAMES 55)
  GP_ESCAPE_THRESHOLD: 40,       // victim MASH (fresh presses × CLINCH_MASH_PER_PRESS) to shove the mount off early — a good masher eats ~2 hammerfists instead of 4
  GP_MOUNT: 14,                  // beat 1: seat onto the body (no damage)
  GP_FLURRY: 48,                 // beat 2: the 4-hammerfist window
  GP_BEAT: 12,                   // a hammerfist every this-many flurry frames (4 across GP_FLURRY)
  GP_OUT: 10,                    // beat 3: dismount → attacker idle, victim re-seated downed

  // Counter-hit — a clean strike during the victim's STARTUP triggers a cinematic.
  // Modeled on the execution sequencer: flash → slip → one hard blow → knockdown.
  COUNTER_FLASH: 10,        // white-flash frames; alpha = 0.85 * flash/COUNTER_FLASH
  COUNTER_COOLDOWN: 90,     // attacker lockout between counters (anti-cutscene-spam)
  COUNTER_SLIP: 14,         // beat 1: flash + slip/weave windup
  COUNTER_IMPACT: 20,       // beat 2: the hard blow connects (> COUNTER_SLIP)
  COUNTER_END: 30,          // beat 3: release → idle, game.counter cleared (> COUNTER_IMPACT)
  COUNTER_DMG_MULT: 2.0,    // counter blow = move.damage * this + COUNTER_BONUS
  COUNTER_BONUS: 60,        // flat bonus so even a jab counter bites
  COUNTER_LAUNCH_VX: 9,     // horizontal launch of the countered body (× att.facing)
  COUNTER_LAUNCH_VY: -12,   // vertical launch (up) — a hard knockdown

  // Super — Mech Cannon (placeholder super for both fighters in the proto)
  SUPER_COST: 100,
  SUPER_DMG: 450,               // ~half of max HP, per the design doc
  SUPER_CHIP: 90,
  SUPER_STARTUP: 24,            // after the cinematic freeze — reactable
  SUPER_RECOVERY: 34,
  SUPER_SHOT_SPEED: 22,

  // BACK + super → the SUPER COMBO: pose-freeze → a starter punch; if it LANDS, an
  // inescapable 16-hit teleporting flurry (accelerating) → a 3-swipe sword finisher KO.
  COMBO_STARTER_RANGE: 155,     // reach of the starter punch (whiff = wasted meter)
  COMBO_HITS: 16,               // hits in the teleport flurry
  COMBO_START_DELAY: 8,         // frames after the starter connects before the flurry opens
  COMBO_START_INTERVAL: 9,      // initial frames between flurry hits...
  COMBO_MIN_INTERVAL: 2,        // ...accelerating down to this
  COMBO_ACCEL: 0.5,             // interval shrinks by this each hit
  COMBO_RADIUS: 128,            // how far around the victim the attacker teleports
  // ── MAGIC PUNCH COMBO auto-flurry (jab→cross→uppercut→cross STARTER → this cinematic) ──
  MAGIC_COMBO_HITS: 4,          // teleport hits in the automatic payoff combo
  MAGIC_COMBO_DELAY: 6,         // frames after the final cross lands before the flurry opens
  MAGIC_COMBO_INTERVAL: 7,      // initial frames between flurry hits...
  MAGIC_COMBO_MIN_INTERVAL: 3,  // ...accelerating down to this
  MAGIC_COMBO_ACCEL: 1.5,       // interval shrinks by this each hit
  MAGIC_COMBO_RADIUS: 116,      // teleport orbit radius around the victim
  MAGIC_COMBO_DMG: 26,          // damage per teleport hit (4 hits — strong but not a one-touch kill)
  MAGIC_COMBO_END_HITSTUN: 30,  // hitstun the victim is LEFT standing in (no launch) → loop / sword followup
  // ── SWORD-COMBO followup: a BACK KICK thrown out of the auto-combo (within the window) → this ──
  SWORD_FOLLOWUP_WINDOW: 45,    // frames after the auto-combo a back kick still triggers the sword combo
  SWORD_COMBO_SWIPES: 2,        // 2 slashes; the 2nd SIDE-SPIKES
  SWORD_COMBO_WINDUP: 12,       // snappy beat before the first slash
  SWORD_COMBO_DMG: 40,          // damage per slash (2nd also side-spikes → wall splat can finish)
  SWORD_WINDUP: 22,             // beat to pull the sword after the flurry
  SWORD_SWIPE_FRAMES: 15,       // frames per slash
  SWORD_SWIPES: 3,

  // FORWARD + super → the OVERDRIVE BEAM (neutral/back super stays the Mech Cannon).
  // A charge-up, then a giant multi-hit beam that engulfs a big chunk of the screen,
  // drags the body to the wall, and detonates.
  BEAM_CHARGE: 22,             // reactable wind-up after the super freeze (the ball forms)
  BEAM_ACTIVE: 48,             // frames the beam pours out
  BEAM_RECOVERY: 26,
  BEAM_HIT_INTERVAL: 4,        // a multi-hit tick every N firing frames
  BEAM_TICK_DMG: 24,           // damage per engulfed tick (direct, not combo-scaled)
  BEAM_FINISH_DMG: 130,        // the detonation hit
  BEAM_TICK_CHIP: 5,           // chip per tick if blocked
  BEAM_PUSH: 6.5,              // px/frame the engulfed body is dragged toward the wall
  BEAM_BLOCK_PUSH: 11,         // pushback per tick on a blocker
  BEAM_LEN: 820,               // beam length — covers a big chunk of the screen
  BEAM_H: 210,                 // beam thickness (hit + core height)
  BEAM_FINISH_VX: 17,          // launch on the detonation
  BEAM_FINISH_VY: -13,

  // Bodies
  BODY_W: 60,
  BODY_H: 170,
  CROUCH_H: 125,
  PUSHBOX_W: 70,
  DOWNED_W: 120,
  DOWNED_H: 40,
};
