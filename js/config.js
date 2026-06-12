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

  // Clinch throw — punch+kick mid-string: judo toss BEHIND you (side switch)
  THROW_RANGE: 95,
  THROW_DMG: 50,
  THROW_FRAMES: 26,             // canned arc over your head

  // Execution — opponent gassed + below this HP fraction + close → P+K finishes them
  EXECUTE_HP_FRAC: 0.10,
  EXECUTE_RANGE: 120,

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
