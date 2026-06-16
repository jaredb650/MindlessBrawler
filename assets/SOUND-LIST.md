# Mindless Brawler — Sound shopping list

Everything the game fires. **Just drop a file named `<name>.mp3` into the folder
and it plays automatically** — missing files are silent, so add them in any order.

- **SFX** → `assets/sfx/<name>.mp3`  (`.ogg` and `.wav` also work; first that loads wins)
- **Music** → `assets/music/<name>.mp3`
- Every SFX gets a subtle **random pitch** each play, so even a *single* file won't
  sound identical on repeats.
- Want true variety on a sound? Drop `hit_heavy_1.mp3`, `hit_heavy_2.mp3`, … and set
  `SFX.variants.hit_heavy = 3` in `js/sfx.js` — it'll rotate them at random.
- **M** mutes/unmutes in-game. Volumes live in `js/sfx.js` (`master`, `sfxVol`, `musicVol`).

Format tips: short SFX as **mp3 / m4a / ogg**, keep them punchy (trim silence). Music
as a seamless **loop**. When I add a batch I **loudness-normalize** them (boost the
quiet, cut the loud) so everything sits at a consistent level — drop new ones in raw
and I'll level them.

---

## Status (what's in / what's still needed)

**✅ In (27, normalized to ~−4 dBFS peak):** all impacts · all swings · all movement ·
all grapples · gassed · super_freeze · explosion · meter_ready · counter_slip ·
counter_hit · ko.

**⬜ Still needed (12 SFX + 2 music):**
`exec_grab` `exec_punch` `exec_riser` `exec_blast` (execution cinematic) ·
`flatliner_freeze` `flatliner_hit` `flatliner_drop` `flatliner_ko` (the one-punch KO) ·
`fight_start` · `ui_move` `ui_confirm` `ui_back` (menus) · `music_menu` `music_fight`.

---

## SFX (`assets/sfx/`)

### Impacts — hits landing (the most important; these carry the game's feel)
| file | what it should sound like |
|---|---|
| `hit_light` | light jab/poke landing — quick sharp slap/thud |
| `hit_med` | solid cross/kick — meatier mid thud |
| `hit_heavy` | a heavy ender connecting — deep bassy **CRACK** |
| `body_blow` | shot to the body/liver — dull *winding* thud (knee, liver shot) |
| `block` | attack stopped on guard — deflecting clack/clang |
| `parry` | clean parry — crisp metallic *ting* |
| `bounce` | launched body bouncing off the floor — soft body whump |
| `body_slam` | body hitting the ground hard — heavy slam |
| `ground_pop` | downed body kicked off the floor (OTG) — juicy thwack |
| `wall_splat` | body splatting into the wall — hard crunch + thud |

### Swings — wind-ups / whiffs
| file | sound |
|---|---|
| `whoosh_light` | fast light swing — short airy whoosh |
| `whoosh_heavy` | big heavy swing — deeper, longer whoosh |
| `fly_takeoff` | leaping into a flying knee/uppercut — launch swoosh |

### Movement
| file | sound |
|---|---|
| `jump` | push-off — light foot/cloth |
| `dash` | run / backdash burst — quick scuff-step |
| `getup` | scrambling off the floor — effort + cloth |
| `tech` | teching a knockdown (roll/kip-up) — sharp recovery whoosh/grunt |

### Grapples / throws
| file | sound |
|---|---|
| `throw_grab` | grabbing / clinching — cloth snatch |
| `throw_slam` | judo toss / suplex landing — big body slam |
| `clinch_break` | breaking the clinch — shove/scuffle |

### Stamina
| file | sound |
|---|---|
| `gassed` | running out of gas — heavy exhausted exhale/pant |

### Crumple stuns
| file | sound |
|---|---|
| `crumple` | a body-shot CRUMPLE (liver shot / spinning elbow) — a pained hurt grunt |
| `buckle` | the calf-kick BUCKLE to one knee — a sharp bone-crack |

### Super (Mech Cannon)
| file | sound |
|---|---|
| `super_freeze` | activation — cinematic power-up charge/whoosh |
| `explosion` | the 20mm shell / blast — heavy explosion boom |
| `meter_ready` | meter hits full — rising "ready" chime |

### Counter
| file | sound |
|---|---|
| `counter_slip` | the slip — quick dodge whoosh |
| `counter_hit` | the counter blow — extra-crunchy CRACK |

### Execution (the gassed-finisher cinematic)
| file | sound |
|---|---|
| `exec_grab` | the collar grab — menacing snatch |
| `exec_punch` | each flurry hit — rapid punch thud (plays many times) |
| `exec_riser` | the wind-up before the haymaker — rising tension |
| `exec_blast` | the final haymaker — devastating impact + wall splat |

### The Flatliner (just-frame one-punch KO)
| file | sound |
|---|---|
| `flatliner_freeze` | trigger moment — sharp time-stop stinger |
| `flatliner_hit` | the connecting fist — one huge CRACK |
| `flatliner_drop` | the body crumpling — heavy collapse |
| `flatliner_ko` | the finishing beat — dramatic boom/sting |

### Match flow
| file | sound |
|---|---|
| `fight_start` | round start — announcer "FIGHT!" or bell + sting |
| `ko` | the knockout — big "K.O." sting / impact |
| `ko_freeze` | the black/white KO freeze-frame — a sharp electric/time-stop stinger |

### UI (menus)
| file | sound |
|---|---|
| `ui_move` | cursor move — soft tick/blip |
| `ui_confirm` | select — confirm chime |
| `ui_back` | cancel/back — back blip |

---

## Music (`assets/music/`)

| file | what it is |
|---|---|
| `music_menu` | title / menu loop — moody, hype, seamless loop |
| `music_fight` | in-match loop — driving fight track, seamless loop |

---

## Nice-to-haves (not wired yet — say the word and I'll add the hooks)
- **footsteps** while walking/running
- **crowd** ambience loop (cheers, swells on big hits)
- **announcer** voice lines ("FIGHT", "K.O.", "EXECUTED", combo callouts)
- distinct per-move whooshes (spinning kicks, the divekick, etc.)
