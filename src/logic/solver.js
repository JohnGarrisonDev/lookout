// Lookout solver. Works the way a person does: a ladder of named deductions, easiest first. Pure, no DOM.
// The same engine grades difficulty (which techniques were needed), drives the generator, and writes the hints.
// A backtracking search is kept only to count solutions of arbitrary boards.
import { makeGrid, connected, analyse, U, H, O, DIR_NAMES } from './rules.js'

/** Techniques in the order a hint tries them. Tier 1 gentle, 2 medium, 3 hard, 4 fiendish. */
export const TECHS = ['neighbour', 'cap', 'full', 'reach', 'over', 'connect', 'combo', 'trial']
export const TIER = { neighbour: 1, cap: 1, full: 1, reach: 2, over: 2, connect: 2, combo: 3, trial: 4 }
export const WEIGHT = { neighbour: 1, cap: 1, full: 1, reach: 3, over: 3, connect: 4, combo: 8, trial: 16 }
export const bit = (tech) => 1 << TECHS.indexOf(tech)
export const maskOf = (list) => list.reduce((m, t) => m | bit(t), 0)
export const tierMask = (tier) => maskOf(TECHS.filter((t) => TIER[t] <= tier))
export const ALL = tierMask(4)

const lo = new Int8Array(4), hi = new Int8Array(4), mn = new Int8Array(4), mx = new Int8Array(4)
const feas = [new Uint8Array(40), new Uint8Array(40), new Uint8Array(40), new Uint8Array(40)]

/** A fresh state: lookout tiles are open, everything else unknown. */
export function startState(g, clues) {
  const st = new Uint8Array(g.n)
  for (let i = 0; i < g.n; i++) if (clues[i] > 0) st[i] = O
  return st
}

/** For the lookout at c: lo[d] = tiles surely seen looking in direction d, hi[d] = the most it could see. Returns [sum lo, sum hi]. */
function reach(g, st, c) {
  let sl = 0, sh = 0
  for (let d = 0; d < 4; d++) {
    const ray = g.rays[c * 4 + d]
    let a = 0
    while (a < ray.length && st[ray[a]] === O) a++
    let b = a
    while (b < ray.length && st[ray[b]] !== H) b++
    lo[d] = a; hi[d] = b; sl += a; sh += b
  }
  return sl * 64 + sh
}

/**
 * Try every way the lookout at c can see exactly N. Needs reach() called first. Fills mn/mx with the shortest and
 * longest view each direction takes across all the ways that work, and returns how many ways there are.
 */
function combos(g, st, c, N) {
  for (let d = 0; d < 4; d++) {
    const ray = g.rays[c * 4 + d], f = feas[d]
    // a view of length L works if tile L (the one that stops it) is the edge, a hedge, or could still become a hedge
    for (let L = lo[d]; L <= hi[d]; L++) f[L] = L === hi[d] || st[ray[L]] === U ? 1 : 0
    mn[d] = 99; mx[d] = -1
  }
  const need = N - 1
  let count = 0
  for (let a = lo[0]; a <= hi[0]; a++) {
    if (!feas[0][a]) continue
    for (let b = lo[1]; b <= hi[1]; b++) {
      if (!feas[1][b]) continue
      for (let s = lo[2]; s <= hi[2]; s++) {
        if (!feas[2][s]) continue
        const e = need - a - b - s
        if (e < lo[3] || e > hi[3] || !feas[3][e]) continue
        count++
        if (a < mn[0]) mn[0] = a; if (a > mx[0]) mx[0] = a
        if (b < mn[1]) mn[1] = b; if (b > mx[1]) mx[1] = b
        if (s < mn[2]) mn[2] = s; if (s > mx[2]) mx[2] = s
        if (e < mn[3]) mn[3] = e; if (e > mx[3]) mx[3] = e
      }
    }
  }
  return count
}

// ---------------------------------------------------------------- fast propagation (search and what-if checks)

const FAIL_TOUCH = -2, FAIL_CUT = -3
function setHedge(g, st, i) {
  if (st[i] === H) return true
  if (st[i] === O) return false
  st[i] = H
  for (const j of g.nb[i]) { if (st[j] === H) return false; st[j] = O }
  return true
}

/** Push every lookout's constraint to a fixpoint. Returns -1 if fine, a lookout index if that lookout cannot be satisfied, FAIL_TOUCH or FAIL_CUT. */
function propagate(g, clues, list, st) {
  for (let changed = true; changed;) {
    changed = false
    for (let q = 0; q < list.length; q++) {
      const c = list[q], N = clues[c]
      reach(g, st, c)
      if (!combos(g, st, c, N)) return c
      for (let d = 0; d < 4; d++) {
        const ray = g.rays[c * 4 + d]
        for (let k = lo[d]; k < mn[d]; k++) if (st[ray[k]] === U) { st[ray[k]] = O; changed = true }
        if (mn[d] === mx[d] && mn[d] < ray.length && st[ray[mn[d]]] === U) {
          // setHedge touches no scratch state, but re-run this lookout next round to stay simple
          if (!setHedge(g, st, ray[mn[d]])) return FAIL_TOUCH
          changed = true
        }
      }
    }
  }
  return connected(g, st) ? -1 : FAIL_CUT
}

const clueList = (g, clues) => { const list = []; for (let i = 0; i < g.n; i++) if (clues[i] > 0) list.push(i); return list }

// ---------------------------------------------------------------- named deductions

/**
 * Find deductions of one technique in the current state. A step is
 * { tech, clue (lookout index or -1), cells: [index...], vals: [H or O ...], dir, n }.
 * With `first`, stop at the first one found.
 */
export function findSteps(g, clues, st, tech, first = false) {
  const out = []
  const { n, rays, nb } = g
  if (tech === 'neighbour') {
    for (let i = 0; i < n; i++) {
      if (st[i] !== H) continue
      const cells = nb[i].filter((j) => st[j] === U)
      if (cells.length) { out.push({ tech, clue: -1, from: i, cells, vals: cells.map(() => O) }); if (first) return out }
    }
    return out
  }
  if (tech === 'connect') {
    for (let i = 0; i < n; i++) {
      if (st[i] !== U) continue
      let links = g.edge[i]
      for (const j of g.diag[i]) if (st[j] === H) links++
      if (links < 2 || connected(g, st, i)) continue
      out.push({ tech, clue: -1, cells: [i], vals: [O] }); if (first) return out
    }
    return out
  }
  if (tech === 'trial') {
    const list = clueList(g, clues)
    for (let i = 0; i < n; i++) {
      if (st[i] !== U) continue
      for (const v of [H, O]) {
        const t = st.slice()
        let why = -1
        if (v === H) { if (!setHedge(g, t, i)) why = FAIL_TOUCH } else t[i] = O
        if (why === -1) why = propagate(g, clues, list, t)
        if (why === -1) continue
        out.push({ tech, clue: why >= 0 ? why : -1, why: why >= 0 ? 'lookout' : why === FAIL_CUT ? 'cut' : 'touch', cells: [i], vals: [v === H ? O : H] })
        if (first) return out
        break
      }
    }
    return out
  }
  for (let c = 0; c < n; c++) {
    const N = clues[c]
    if (!(N > 0)) continue
    const sums = reach(g, st, c), sl = sums >> 6, sh = sums & 63
    if (sl === sh) continue // nothing left to decide around this lookout
    if (tech === 'cap') {
      if (sl !== N - 1) continue
      const cells = []
      for (let d = 0; d < 4; d++) { const ray = rays[c * 4 + d]; if (lo[d] < ray.length && st[ray[lo[d]]] === U) cells.push(ray[lo[d]]) }
      if (cells.length) out.push({ tech, clue: c, n: N, cells, vals: cells.map(() => H) })
    } else if (tech === 'full') {
      if (sh !== N - 1) continue
      const cells = []
      for (let d = 0; d < 4; d++) { const ray = rays[c * 4 + d]; for (let k = lo[d]; k < hi[d]; k++) if (st[ray[k]] === U) cells.push(ray[k]) }
      if (cells.length) out.push({ tech, clue: c, n: N, cells, vals: cells.map(() => O) })
    } else if (tech === 'reach') {
      for (let d = 0; d < 4; d++) {
        const must = N - 1 - (sh - hi[d]), ray = rays[c * 4 + d], cells = []
        for (let k = lo[d]; k < must && k < hi[d]; k++) if (st[ray[k]] === U) cells.push(ray[k])
        if (cells.length) { out.push({ tech, clue: c, n: N, dir: d, need: must, cells, vals: cells.map(() => O) }); if (first) return out }
      }
    } else if (tech === 'over') {
      for (let d = 0; d < 4; d++) {
        if (lo[d] >= hi[d]) continue
        const ray = rays[c * 4 + d]
        let run = lo[d] + 1
        while (run < ray.length && st[ray[run]] === O) run++
        const would = sl - lo[d] + run + 1
        if (would > N) { out.push({ tech, clue: c, n: N, dir: d, would, cells: [ray[lo[d]]], vals: [H] }); if (first) return out }
      }
    } else if (tech === 'combo') {
      if (!combos(g, st, c, N)) continue
      const cells = [], vals = []
      for (let d = 0; d < 4; d++) {
        const ray = rays[c * 4 + d]
        for (let k = lo[d]; k < mn[d]; k++) if (st[ray[k]] === U) { cells.push(ray[k]); vals.push(O) }
        if (mn[d] === mx[d] && mn[d] < ray.length && st[ray[mn[d]]] === U) { cells.push(ray[mn[d]]); vals.push(H) }
      }
      if (cells.length) out.push({ tech, clue: c, n: N, cells, vals })
    }
    if (first && out.length) return out
  }
  return out
}

/** The next deduction from this state, easiest technique first, or null if the ladder has nothing. */
export function nextStep(g, clues, st, allow = ALL) {
  for (const tech of TECHS) {
    if (!(allow & bit(tech))) continue
    const found = findSteps(g, clues, st, tech, true)
    if (found.length) return found[0]
  }
  return null
}

/**
 * Solve by deduction only, using the techniques in `allow` (a bit mask, see tierMask / maskOf).
 * Returns { st, complete, contradiction, counts, used, tier, score, steps }.
 * `complete` means every tile was deduced and the result obeys every rule, which also proves the solution is unique.
 */
export function solve(p, allow = ALL, from = null) {
  const g = makeGrid(p.w, p.h), clues = p.clues
  const st = from ? from.slice() : startState(g, clues)
  const counts = {}
  let used = 0, tier = 0, score = 0, steps = 0, contradiction = false
  for (let left = countUnknown(st); left > 0 && !contradiction;) {
    let progressed = false
    for (const tech of TECHS) {
      if (!(allow & bit(tech))) continue
      const found = findSteps(g, clues, st, tech, tech === 'trial')
      let applied = 0
      for (const s of found) {
        let did = false
        for (let k = 0; k < s.cells.length; k++) {
          const i = s.cells[k]
          if (st[i] === U) { st[i] = s.vals[k]; left--; did = true } else if (st[i] !== s.vals[k]) contradiction = true
        }
        if (did) applied++
      }
      if (!applied) continue
      counts[tech] = (counts[tech] || 0) + applied
      used |= bit(tech); steps += applied; score += applied * WEIGHT[tech]
      if (TIER[tech] > tier) tier = TIER[tech]
      progressed = true
      break
    }
    if (!progressed) break
  }
  const complete = !contradiction && countUnknown(st) === 0 && analyse(g, clues, st).solved
  return { st, complete, contradiction, counts, used, tier, score, steps }
}
const countUnknown = (st) => { let k = 0; for (let i = 0; i < st.length; i++) if (st[i] === U) k++; return k }

/** Count solutions by search, stopping at `limit`. Returns { count, first } where first is a Uint8Array of H / O. */
export function countSolutions(p, limit = 2) {
  const g = makeGrid(p.w, p.h), clues = p.clues, list = clueList(g, clues)
  let count = 0, first = null
  const rec = (st) => {
    if (propagate(g, clues, list, st) !== -1) return
    let pick = -1
    for (let i = 0; i < g.n; i++) if (st[i] === U) { pick = i; break }
    if (pick < 0) { if (analyse(g, clues, st).solved) { count++; if (!first) first = st.slice() } return }
    const a = st.slice()
    if (setHedge(g, a, pick)) rec(a)
    if (count >= limit) return
    st[pick] = O
    rec(st)
  }
  rec(startState(g, clues))
  return { count, first }
}

// ---------------------------------------------------------------- hints

/**
 * A hint for a board in play. `cells[i]`: 0 empty, 1 hedge, 2 dot. `sol[i]` is 1 where the answer has a hedge.
 * Returns { kind: 'mistake', wrong: [index...] } when the board already disagrees with the answer,
 * { kind: 'done' } when nothing is left, or { kind: 'step', step, text } with the next logical deduction.
 */
export function hintFor(p, cells) {
  const g = makeGrid(p.w, p.h), wrong = []
  const st = startState(g, p.clues)
  let open = 0
  for (let i = 0; i < g.n; i++) {
    if (p.clues[i] > 0) continue
    if (cells[i] === H) { if (p.sol[i] !== H) wrong.push(i); st[i] = H } else if (cells[i] === O) { if (p.sol[i] === H) wrong.push(i); st[i] = O } else open++
  }
  if (wrong.length) return { kind: 'mistake', wrong }
  if (!open) return { kind: 'done' }
  let step = nextStep(g, p.clues, st)
  if (!step) { // the ladder ran dry (should not happen on generated boards): give one tile away
    let i = 0
    while (st[i] !== U) i++
    step = { tech: 'reveal', clue: -1, cells: [i], vals: [p.sol[i] === H ? H : O] }
  }
  return { kind: 'step', step, text: describe(step) }
}

const plural = (k, one, many) => (k === 1 ? one : many)

/** One plain sentence (or two) explaining a step. */
export function describe(s) {
  const k = s.cells.length
  switch (s.tech) {
    case 'neighbour': return `Hedges never touch side by side, so the ${plural(k, 'tile', 'tiles')} next to this hedge must stay open.`
    case 'cap': return `This lookout already sees ${s.n}. One more tile would be too many, so ${plural(k, 'the next tile is a hedge', 'plant a hedge at the end of each view')}.`
    case 'full': return `This lookout wants ${s.n} and can only reach ${s.n} tiles in total, so every one of them must stay open.`
    case 'reach': return `Even looking as far as it can the other ways, this lookout still needs ${s.need} ${plural(s.need, 'tile', 'tiles')} to the ${DIR_NAMES[s.dir]}. ${plural(k, 'This tile is', 'These tiles are')} open.`
    case 'over': return `If the tile to the ${DIR_NAMES[s.dir]} were open, this lookout would see ${s.would} or more, but it wants ${s.n}. That tile is a hedge.`
    case 'connect': return 'A hedge here would cut the field in two. This tile must stay open.'
    case 'combo': return `Try every way this lookout can see exactly ${s.n}. ${plural(k, 'This tile comes', 'These tiles come')} out the same every time.`
    case 'trial': {
      const what = s.vals[0] === H ? 'were left open' : 'were a hedge', so = s.vals[0] === H ? 'So it is a hedge.' : 'So it stays open.'
      if (s.why === 'lookout') return `If this tile ${what}, the marked lookout could never see its number. ${so}`
      if (s.why === 'cut') return `If this tile ${what}, the field would end up cut in two. ${so}`
      return `If this tile ${what}, two hedges would be forced to touch. ${so}`
    }
    default: return s.vals[0] === H ? 'Take my word for it: this tile is a hedge.' : 'Take my word for it: this tile is open.'
  }
}

/** Difficulty label from a grade (the result of solve()). */
export const bandOf = (grade) => ['gentle', 'gentle', 'medium', 'hard', 'fiendish'][grade.tier] || 'gentle'
