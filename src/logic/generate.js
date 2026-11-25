// Seeded Lookout generator. Pure, no DOM, integer maths only, so every browser grows the same field from the same seed.
//
// 1. Plant hedges at random: never side by side, never cutting the open tiles apart.
// 2. Stand a lookout on every open tile (that board always has exactly one answer).
// 3. Send lookouts home one at a time, in random order, as long as the board can still be solved by the allowed
//    deductions alone. Being solvable by deduction is also the proof that the answer is unique.
// 4. Grade what is left. If it is not in the wanted difficulty band, try again with the next attempt number.
//
// !! Changing anything here (or the order of rng() calls) changes every Daily board. See AGENTS.md.
import { makeRng } from '../../kit/kit.js'
import { makeGrid, connected, cluesFor, H } from './rules.js'
import { solve, tierMask, bit, TECHS } from './solver.js'

/** Difficulty bands: the hardest technique tier a board may need, and must need. */
export const BANDS = {
  gentle: { tier: 1, label: 'Gentle' },
  medium: { tier: 2, label: 'Medium' },
  hard: { tier: 3, label: 'Hard' },
  fiendish: { tier: 4, label: 'Fiendish' },
}
export const BAND_IDS = Object.keys(BANDS)
export const MIN_SIZE = 4, MAX_SIZE = 9
const MAX_ATTEMPTS = 400

function shuffled(count, rng) {
  const a = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) { const j = rng.int(i + 1), t = a[i]; a[i] = a[j]; a[j] = t }
  return a
}

function plantHedges(g, rng, target) {
  const sol = new Uint8Array(g.n)
  let placed = 0
  for (const i of shuffled(g.n, rng)) {
    if (placed >= target) break
    if (g.nb[i].some((j) => sol[j] === H)) continue
    sol[i] = H
    if (connected(g, sol)) placed++; else sol[i] = 0
  }
  return sol
}

/**
 * Make a puzzle. def: { size, seed, band = 'gentle', allow?, need?, hedges? }
 *  - allow: bit mask of techniques the solve may use (default: everything up to the band's tier)
 *  - need: bit mask of techniques the solve must use at least once (default: one from the band's own tier)
 *  - hedges: exact number of hedges to aim for (default: 17% to 27% of the field)
 * Returns { w, h, clues, sol, grade, band, attempt, inBand }.
 */
export function generate(def) {
  const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, def.size | 0)), band = BANDS[def.band] ? def.band : 'gentle', tier = BANDS[band].tier
  const g = makeGrid(size), allow = (def.allow || tierMask(tier)) | bit('neighbour'), need = def.need | 0
  const bandBits = tier > 1 ? TECHS.filter((t) => tierMask(tier) & ~tierMask(tier - 1) & bit(t)).reduce((m, t) => m | bit(t), 0) : 0
  let best = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = makeRng(((def.seed >>> 0) + Math.imul(attempt, 0x9e3779b1)) >>> 0)
    const target = def.hedges > 0 ? def.hedges : Math.round((g.n * (17 + rng.int(11))) / 100)
    const sol = plantHedges(g, rng, target)
    const clues = cluesFor(g, sol)
    const p = { w: size, h: size, clues, sol }
    // Tier 4 (what-if checks) is slow, so the bulk of the lookouts go home under the cheaper rules first.
    const cheap = allow & tierMask(3)
    const order = shuffled(g.n, rng)
    for (const i of order) {
      if (!clues[i]) continue
      const keep = clues[i]
      clues[i] = 0
      if (!solve(p, cheap).complete) clues[i] = keep
    }
    if (allow !== cheap) {
      let tries = 0
      for (const i of order) {
        if (!clues[i]) continue
        if (++tries > 14) break
        const keep = clues[i]
        clues[i] = 0
        if (!solve(p, allow).complete) clues[i] = keep
      }
    }
    const grade = solve(p, allow)
    const inBand = grade.complete && grade.tier === tier && (grade.used & need) === need && (!bandBits || (grade.used & bandBits) !== 0)
    const out = { w: size, h: size, clues, sol, grade, band, attempt, inBand }
    if (inBand) return out
    if (!best || (grade.complete && grade.score > best.grade.score)) best = out
  }
  return best
}

/** Short fingerprint of a puzzle (clues and answer), for snapshot tests. */
export function puzzleHash(p) {
  let h = 2166136261
  const mix = (v) => { h ^= v; h = Math.imul(h, 16777619) }
  mix(p.w); mix(p.h)
  for (let i = 0; i < p.clues.length; i++) mix(p.clues[i] * 2 + (p.sol[i] === H ? 1 : 0) + 7)
  return (h >>> 0).toString(16).padStart(8, '0')
}
