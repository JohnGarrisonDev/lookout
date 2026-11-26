# Notes for the next AI

Lookout is an Oddvale Games title. Read the hub's `GAME_GUIDE.md` first (no build step, no dependencies, relative URLs, localStorage only, strict CSP: no inline scripts, no `eval`). This file is what you need on top of that.

## Architecture in one minute

- `src/logic/*` is pure: no DOM, no clock, no `window`. Rules, solver, generator, save schema and daily seeds live there and are covered by `tests/`. Keep it that way.
- `src/main.js` owns the app: one `app` object (mode, session, view, cursor, drag, hint), the `actions` table (every button lands here by name), pointer and keyboard input, the frame loop and all saving.
- `src/ui.js` builds the DOM overlays once and exposes dumb setters. Buttons carry `data-act="name"`; one click listener calls `actions[name](dataset, element)`.
- `src/render.js` draws the canvas every frame from a session plus an `anim` object (`makeAnim`: when each tile last changed, when a hedge became "bad", solve time, the hint on show, mistake flags). Logic is instant; visuals catch up.
- The canvas fills the stage. DOM layouts contain an empty `.slot`; `main.js` measures it and `layoutBoard` fits the board inside. So layout is CSS: move the slot, the board follows.
- `kit/talk.js` (hub kit, do not edit) adds the anonymous player-input widgets: `dailyTalk` fills a `.talk-slot` at the bottom of the solved card for **today's** daily fields only (boards `small`/`medium`/`large` from ids `s`/`m`/`l`, score = the recorded solve time in whole seconds, lower is better), and `tellUs` fills `#tell-us` in the info section. Both stay hidden when the studio API is unreachable.
- `main.js` adds `.portrait` to the stage when it is taller than wide (and `.short` when it is a landscape stage under 520px tall, a phone on its side: two-column solved card) and sets the `.ui` font-size from the stage size.
- Touch (1.2): taps use `hitTileNear` (a tap up to 0.4 tile outside the frame lands on the edge tile); finger drags use `hitTileSticky` (a point less than 0.22 tile past a row or column line still counts as the last one, so a wobble does not paint the next row); the tile under a painting finger gets the cursor ring. `lostpointercapture` ends a stroke like `pointercancel`. `haptic()` on a touch placement, touching hedges, long-press dot and the solve. Hit helpers are pure and tested in `tests/hit.test.js`.
- Full screen (kit `wireChrome`): `.ui` carries the kit's `stage-inset` class and the board slots are measured against the canvas, so both keep clear of notches; the HUD keeps the top-right corner free for the kit's exit button. All sizes in `game.css` are in `em`. The stage is always a sunny field, also in dark mode.

## Rules and cell codes

Index `i = y * w + x`. `clues[i]` is 0 or a lookout's number. Cell states are shared by solver and player boards: `0` unknown / empty, `1` hedge, `2` open / dot (`U`, `H`, `O` in `rules.js`). A lookout's count includes itself and runs until a hedge or the edge. Solved (`analyse().solved`) means: every lookout sees exactly its number, no two hedges touch, all non-hedge tiles are one piece. Dots are only notes; empty tiles count as open. Because every board has one answer, "the rules hold" and "matches the answer" are the same thing.

`analyse()` also produces the live feedback: `mood` per lookout (1 happy, 2 worried = sees too few already, or its unbroken run of known-open tiles is already too long), `bad` hedges (touching), `cut` tiles (outside the biggest open patch).

## The solver (the heart of the game)

`solver.js` is a ladder of named deductions, tried easiest first. Each has a tier, a weight for the score, and a sentence in `describe()`:

| tech | tier | idea |
| --- | --- | --- |
| `neighbour` | 1 | tiles beside a hedge are open |
| `cap` | 1 | lookout already sees its number: hedge at the end of each view |
| `full` | 1 | lookout can only just reach its number: all of it is open |
| `reach` | 2 | even maxing the other three directions, it must see k tiles this way |
| `over` | 2 | opening the next tile would join a run and show too much: hedge |
| `connect` | 2 | a hedge here would cut the field: open |
| `combo` | 3 | enumerate every way the lookout can see exactly N; keep what is common |
| `trial` | 4 | suppose a tile, propagate, hit a contradiction |

- `solve(p, allowMask)` sweeps the cheapest technique that makes progress until done or stuck. `complete` means every tile was deduced and the result passes the rules, which also proves uniqueness. The result is the grade: `tier` (hardest technique used), `counts`, `score`.
- `hintFor(p, cells)` is the hint: mistakes first (never reason from a wrong board), else `nextStep` from the player's own marks, else (should never happen) a give-away.
- `countSolutions` is a plain backtracking search with propagation. It is only used by tests and `tools/`, as an independent check on the deduction solver.
- Soundness matters more than strength. Every deduction must be true on any board with a solution; `tests/solver.test.js` replays the ladder on generated boards and compares every step to the answer. If you add a technique, add it to `TECHS` (order = hint order), `TIER`, `WEIGHT`, `findSteps`, `describe`, and that test covers it automatically.
- Techniques assume `neighbour` has been applied first (an unknown tile next to a hedge is treated as "could be a hedge" by `combo` otherwise). `generate` always allows `neighbour`; keep it first in `TECHS`.

## Generator, seeds and snapshots (read before touching generate.js or solver.js)

`generate({ size, seed, band, allow?, need?, hedges? })`: plant hedges legally, put a lookout on every open tile, remove lookouts in random order while `solve` still completes with the allowed techniques, then accept only if the grade's tier equals the band's tier (and uses a technique from that tier). Otherwise retry with the next attempt number (same seed, so still deterministic). Bands: gentle = tier 1, medium = 2, hard = 3, fiendish = 4. It is fast: a 9x9 hard board takes a few milliseconds, fiendish tens of milliseconds, so everything is generated on demand with no loading state.

Consequences:

- **Daily boards are regenerated from the date every time.** `dailyDefs(key)` seeds one rng with `hashString('lookout:' + 'YYYY-MM-DD')` and draws three seeds. Any change to `generate.js`, to the order or number of `rng()` calls, to the kit's `makeRng`/`hashString`, **or to what the solver can deduce at tiers 1 to 3** (the removal loop asks the solver) changes everyone's daily and breaks in-progress saves. `tests/daily.test.js` pins four dates. If it fails, do not paste new hashes in. Add the new behaviour as a new path chosen by a field (for example `gen: 2` in the definition, used from a cut-over date) and leave the old path byte-for-byte.
- **Journey boards are stored as text** in `src/logic/journey-data.js`, so they do not move when the generator does. `tests/levels.test.js` pins a hash of all 40 and re-checks each against its recipe (allowed techniques, techniques it must use, uniqueness).
- Free play uses `Math.random()` only to pick a seed; the seed is saved with the in-progress board.

### Board text format

One string per board, rows joined by `/`: `#` hedge (this is the answer), `.` open tile, a base-36 digit for a lookout's number (`a` = 10 ... `h` = 17). `encodeBoard` / `decodeBoard` in `rules.js`.

### Adding Journey levels

1. Append recipes to a chapter in `levels.js` (or add a chapter of exactly 10). Never insert or reorder: stars are stored by level index.
2. In `tools/build-journey.mjs`, generate only the new rows (keep existing strings as they are) and append the output to `journey-data.js`. Running the tool with `--write` today re-rolls all 40, which is only safe if the generator and solver are unchanged (it then reproduces the same boards; the snapshot test tells you).
3. Keep sizes at 9 or below (35px tiles on a 360px phone). Update `JOURNEY_SNAPSHOT`, the counts in the tests, `game.json`, README and CHANGELOG.

## Save data

One blob at `oddvale:lookout`; schema at the top of `src/logic/save.js`. `sanitize()` rebuilds a clean save from whatever it finds, so add new fields there with a default. In-progress boards: one for Journey, one for Free play, and one per daily board (`progress.daily['YYYY-MM-DD:s']`, pruned to the 14-day archive window). `last` remembers what was on screen so a reload drops the player back into the field. Undo history is not saved.

Daily history: `history[date] = { s?, m?, l? }`, each `{ t, h, c, late? }`. A day counts for the streak when `s` exists without `late`; solving from the archive sets `late`. A solved daily reopens showing the finished field.

## Testing by hand

Serve the folder (see README) and open `/?debug`. `window.__game` has `state()`, `solve(leave)` (plants the answer through the real code path), `tick()` (run one frame; background tabs throttle rAF), `tilePoint(i)` (client coordinates for synthetic PointerEvents), `place(i, to)`, plus `app`, `save`, `actions`, `ui`, `demo`. Portrait layout depends on the stage's shape, not on a media query, so you can preview the phone layout on a desktop by setting `max-width: 331px` and `--stage-ratio: 3 / 5` on `#stage`.

## Balance and feel notes

- Hedge density is 17% to 27% of the field, drawn per board. Typical lookout counts: 6x6 gentle about 9, 7x7 medium about 9, 9x9 hard about 14 (`node tools/bench.mjs`).
- Gentle boards never need more than counting. Hard boards average under two `combo` steps; the rest is tier 1 and 2. Fiendish averages around ten what-if steps on 9x9 and is free play only.
- Stars: 3 with no help, 2 if a hint was used, 1 if Check was used (even when it finds nothing: "no mistakes" is information too).
- The clock starts when the field opens and pauses in menus and when the tab is hidden.
- Tile size on a 360px phone at 9 columns is about 35px, 38px at 390px. Do not go wider than 9 without zoom.
- Colour is never the only signal: happy = tick tag and wide eye, worried = brow and orange tag, touching hedges = "!" tag and a shake, cut-off patch = hatching, plus the status line in the HUD.

## Known weak spots

- The corner tag (what a lookout sees now) is small on 9x9 phone boards; the status line shows the same numbers when you tap a lookout.
- Undo history is lost on reload.
- Short landscape windows squeeze the side HUD; it scrolls rather than shrinking the board (text stays at 13px or more).
- Not checked on a real phone: native full screen (the dev browser pane never settles `requestFullscreen`; the kit falls back to focus mode), iPhone Safari, real multi-touch.
- The 14-day archive buttons are 39px wide at 360px (53px tall); seven across do not fit at 44px.
- The solved card covers part of the board (left side on desktop, lower half on phones).
- `trial` hints say what would break but not the chain of steps that gets there.
- Fiendish generation limits how many lookouts it tries to remove with what-if checks (14), so some fiendish boards need only one what-if.
- The canvas redraws every frame even when idle.

## Ideas backlog

- Walk-through for `trial` hints: play the supposition forward step by step, then rewind.
- A pencil mode for "maybe" marks, and auto-dots around a fresh hedge as an option.
- Weekly giant (12x12 with pinch-zoom), which needs pan and zoom on phones.
- Symmetric or themed lookout layouts as an extra generator path (`gen: 2`).
- Share image: the hedge pattern as emoji rows or a small PNG once all three dailies are done.
- Per-level best times on the level buttons; a "no dots" badge.
- Colour-blind friendly palette toggle and a larger-tag option for small screens.
- Save the undo stack with the board.
- Idle frame throttling to save battery.
