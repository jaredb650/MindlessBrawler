// ─────────────────────────────────────────────────────────────
// MindlessBrawler — tuning constants.
// Every number that defines "feel" lives here. Tweak freely.
// Units: pixels, frames (60 logic frames = 1 second).
// ─────────────────────────────────────────────────────────────
const CFG = {
  // Arena — the phone booth. Fixed camera, hard walls, cornering is real.
  STAGE_W: 1280,
  STAGE_H: 720,
  FLOOR_Y: 640,
  WALL_L: 40,
  WALL_R: 1240,

  // 16-bit RETRO filter (js/retro.js) — toggle live with V. Tune by feel:
  RETRO: {
    scale: 4,            // pixel chunkiness: render at 1280/4×720/4 = 320×180, then nearest-neighbor upscale.
                         //   use a CLEAN divisor (2,4,5,8) for uniform pixels — 4 is the 16-bit sweet spot; 5 = chunkier.
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

  // Forward pressure — never stop dead to throw hands.
  MOMENTUM_KEEP: 0.6,           // fraction of walk/run speed carried into a strike
  PRESS_DRIFT: 1.6,             // px/frame advancing while striking (hold toward)
  PRESS_DRIFT_STAMINA: 0.1,     // ...which sips stamina: relentlessness is a spend
  FLOW_CANCEL_RECOVERY: 4,      // on CONTACT (hit/block) recovery caps at this — whiffs eat it all
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
  PUSHBLOCK_COST: 22,           // stamina to pushblock — a panic button, never free corner-escape
  PUSHBLOCK_PUSH: 13,           // outward shove on the attacker (vs BLOCK_PUSHBACK 4.5)
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
  GAZELLE_HOP_APEX: 64,         // px the body rises at the peak of the grounded leap (cosmetic+spacing; not an air state)

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

  // THE FLATLINER — just-frame overhand off the machine-gun's FINAL hit → one-punch KO.
  // A clean primed overhand diverts into the shared cine harness (kind:'flatliner') instead
  // of the blast: small impact hitstop, white flash, freeze, body crumples, round ends.
  FLATLINER_JF_WINDOW: 3,       // just-frame window (frames after the machine-gun's final hit) for the flatliner overhand
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

  // Elbow drop — down+P in the air: diving elbow that SPIKES an airborne body to the floor.
  ELBOWDROP_VX: 7,                // forward punch of the dive (× facing) — slightly shorter reach than divekick
  ELBOWDROP_VY: 13,               // downward dive speed (positive = down)
  ELBOWDROP_SPIKE_VY: 16,         // vy DRIVEN into an airborne victim on hit — well past BOUNCE_MIN_VY (6) → hard bounce + OTG

  // Clinch throw — punch+kick mid-string: judo toss BEHIND you (side switch)
  THROW_RANGE: 95,
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

  // Clinch — neutral P+K locks the bodies together: dirty boxing, body knees,
  // a judo throw off BACK, and a mash-escape for the victim. Auto-releases.
  CLINCH_GRAB_RANGE: 100,        // reach at the lock frame (a touch longer than THROW_RANGE)
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
  // hammerfists. NON-lethal: drains stamina only, never HP. Re-seats them downed
  // (true oki). Cooldown stops immediate re-mount looping (must exceed KNOCKDOWN_FRAMES).
  GROUNDPOUND_RANGE: 110,        // must be this close to a downed body to mount (tighter than EXECUTE_RANGE)
  GROUNDPOUND_DRAIN_PER_HIT: 16, // stamina ripped per hammerfist (4 hits → up to 64; can gas them out)
  GROUNDPOUND_COOLDOWN: 70,      // attacker lockout after a pound — can't instantly re-mount the same wakeup (> KNOCKDOWN_FRAMES 55)
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

  // Bodies
  BODY_W: 60,
  BODY_H: 170,
  CROUCH_H: 125,
  PUSHBOX_W: 70,
  DOWNED_W: 120,
  DOWNED_H: 40,
};
