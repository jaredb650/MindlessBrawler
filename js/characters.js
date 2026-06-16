// ─────────────────────────────────────────────────────────────
// Characters: per-character definitions — the single source of truth for a
// fighter's IDENTITY (moveset, stats, input mapping, render profile, supers).
// The game began as a mirror match (both fighters = the MMA 'brawler'); this
// registry is the seam a 2nd character (Vesper, gun-kata) layers in through.
//
// A Fighter reads its identity from here at construction: this.char / charType /
// moveSet (and, as the per-character refactor proceeds, stats / input maps /
// render profile). 'brawler' is defined to reproduce the ORIGINAL behavior
// exactly — adding a character must never change how the brawler plays.
// ─────────────────────────────────────────────────────────────
const CHARACTERS = {
  brawler: {
    id: 'brawler',
    name: 'BRAWLER',
    moves: MOVES,        // the shared MMA moveset (js/moves.js)
  },
};

// resolve the active character for a fighter, tolerant of an id string or a def.
function charDef(c) {
  if (!c) return CHARACTERS.brawler;
  return typeof c === 'string' ? (CHARACTERS[c] || CHARACTERS.brawler) : c;
}
