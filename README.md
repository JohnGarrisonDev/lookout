# Lookout

A daily deduction puzzle for [Oddvale Games](https://games.oddvale.com/lookout/).

Odd little robot **lookouts** stand in a field. Each one has a number: exactly how many tiles it wants to see, its own included, looking up, down, left and right until a hedge or the edge. Plant **hedges** to block the views.

1. Every lookout sees exactly its number.
2. Hedges never touch side by side (corners are fine).
3. All open tiles stay joined in one piece.

Every field has exactly one answer and can be solved by logic alone.

- **Daily:** three fields per calendar day, the same for everyone: Small (6x6, gentle), Medium (7x7), Large (9x9, hard). Streak, a 14-day archive, and a copyable spoiler-free result.
- **Journey:** 40 fixed levels in 4 chapters, each chapter teaching one more kind of deduction. Up to 3 stars each.
- **Free play:** endless fields, 4x4 to 9x9, four difficulty levels.
- **Hints that explain themselves:** the hint button runs the same solver that built the puzzle and says, in a sentence, why the next step must be so.

Designed, built and updated by AI models. No build step, no dependencies, no network requests.

## Run it

Any static file server works. From the hub repo:

```
node ../oddvale-games/scripts/serve.mjs . 4304
```

then open http://127.0.0.1:4304/ . Add `?debug` to the URL to get a `window.__game` hook for automated play-testing (`__game.solve()`, `__game.state()`, `__game.tick()`, ...).

## Test it

```
node --test tests/
```

## Layout

```
index.html          page shell (from the hub's kit/template.html)
game.json           metadata the hub reads
cover.webp          cover art (supplied separately)
kit/                copy of the hub kit. Do not edit; re-copy from the hub to update
src/main.js         app state, screen flow, pointer and keyboard input, frame loop, saving, debug hook
src/ui.js           DOM overlays: title, daily picker, level select, free-play setup, HUD, toolbar, modals
src/game.css        styles for everything inside the stage
src/render.js       canvas drawing: field, hedges, dots, lookouts, sight lines, hint rings, confetti
src/audio.js        synth sound effects
src/fx.js           confetti pool
src/logic/          pure rules, no DOM, shared with the tests
  rules.js          grid geometry, sight counts, connectivity, live feedback, win check, board text format
  solver.js         the ladder of named deductions, grading, hints and their wording, solution counting
  generate.js       seeded generator and difficulty bands
  levels.js         Journey chapters and recipes
  journey-data.js   the 40 Journey boards as text (built by tools/build-journey.mjs)
  daily.js          daily seeds, dates, streaks, share text
  session.js        a board in play: marks, strokes, undo/redo, mistakes, stars, snapshot
  save.js           save schema + sanitiser
tools/              dev-only: build-journey.mjs (grow Journey boards), bench.mjs (generator speed and mix)
tests/              node --test
```

See [AGENTS.md](AGENTS.md) for architecture notes, the board format, and the ideas backlog.

## License
Code is MIT licensed, see [LICENSE](LICENSE). The fonts in `kit/fonts/` (Fraunces, Figtree, DM Mono) are under the SIL Open Font License 1.1. The Oddvale name and mark are not covered by the MIT license.
