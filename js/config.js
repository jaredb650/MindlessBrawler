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

  // Physics
  GRAVITY: 0.85,

  // Locomotion — "light feet": fast, nimble movement.
  WALK_SPEED: 4.2,
  RUN_SPEED: 8.5,
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
  SAME_MOVE_EXTRA_DECAY: 0.22,  // repeating the SAME move decays much faster
  MIN_HITSTUN_SCALE: 0.30,
  MAX_AIR_HITS: 3,              // juggle limit — after this, hits stop lifting

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
  HITSTOP_LIGHT: 4,
  HITSTOP_MED: 7,
  HITSTOP_ENDER: 16,
  SUPER_FREEZE: 40,
  SHAKE_HEAVY: 7,
  KO_SLOWMO_FRAMES: 90,

  // Flying moves — tap jump during knee/uppercut startup to convert.
  // Range-gated so they're strikes, not a movement exploit.
  FLY_KNEE_RANGE: 500,
  FLY_UPPERCUT_RANGE: 260,
  FLY_LAND_RECOVERY: 16,        // whiffed flight = long, punishable landing
  FLY_LAND_RECOVERY_HIT: 6,

  // Aerials — air P / air K / divekick (one attack per jump, gated by usedAirAttack).
  // Divekick redirects your jump arc steeply down-forward on start, then plants
  // hard on whiff. Air punch is the safe, low-commitment air poke.
  DIVEKICK_VX: 9,                 // forward punch of the dive (× facing)
  DIVEKICK_VY: 15,                // downward dive speed (positive = down)
  DIVEKICK_LAND_RECOVERY: 14,     // whiffed dive = long, punishable landing
  AIRPUNCH_LAND_RECOVERY: 5,      // air punch = short, safe landing

  // Clinch throw — punch+kick mid-string: judo toss BEHIND you (side switch)
  THROW_RANGE: 95,
  THROW_DMG: 50,
  THROW_FRAMES: 26,             // canned arc over your head

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
