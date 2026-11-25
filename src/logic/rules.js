// Lookout rules: the grid, sight counts, hedge adjacency, connectivity, and the win check. Pure, no DOM.
//
// A board is w x h tiles, index i = y * w + x. `clues[i]` is 0 for a plain tile, or the number a lookout standing
// there wants to see (itself plus every open tile up, down, left and right until a hedge or the edge).
// Solver cell states: U unknown, H hedge, O open. A player's board uses the same numbers: 0 empty, 1 hedge, 2 dot.
export const U = 0, H = 1, O = 2

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]
export const DIR_NAMES = ['north', 'east', 'south', 'west']
const grids = new Map()

/** Precomputed geometry for a w x h board (cached). rays[i * 4 + d] lists the tiles seen from i looking in direction d. */
export function makeGrid(w, h = w) {
  const key = w * 64 + h
  let g = grids.get(key)
  if (g) return g
  const n = w * h, rays = new Array(n * 4), nb = new Array(n), diag = new Array(n), edge = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0, ns = [], dg = []
    for (let d = 0; d < 4; d++) {
      const ray = []
      for (let cx = x + DX[d], cy = y + DY[d]; cx >= 0 && cy >= 0 && cx < w && cy < h; cx += DX[d], cy += DY[d]) ray.push(cy * w + cx)
      rays[i * 4 + d] = ray
      if (ray.length) ns.push(ray[0])
    }
    for (let k = 0; k < 4; k++) {
      const cx = x + (k === 0 || k === 3 ? -1 : 1), cy = y + (k < 2 ? -1 : 1)
      if (cx >= 0 && cy >= 0 && cx < w && cy < h) dg.push(cy * w + cx)
    }
    nb[i] = ns; diag[i] = dg; edge[i] = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 1 : 0
  }
  g = { w, h, n, rays, nb, diag, edge, stack: new Int16Array(n), mark: new Int32Array(n), stamp: 0 }
  grids.set(key, g)
  return g
}

/** Are all non-hedge tiles (ignoring `skip`, treated as a hedge) joined in one piece? `st[i] === H` marks a hedge. */
export function connected(g, st, skip = -1) {
  const { n, nb, stack, mark } = g
  const stamp = ++g.stamp
  let start = -1, total = 0
  for (let i = 0; i < n; i++) if (st[i] !== H && i !== skip) { total++; if (start < 0) start = i }
  if (total <= 1) return true
  let top = 0, seen = 1
  stack[top++] = start; mark[start] = stamp
  while (top) {
    const c = stack[--top], ns = nb[c]
    for (let k = 0; k < ns.length; k++) {
      const j = ns[k]
      if (mark[j] === stamp || st[j] === H || j === skip) continue
      mark[j] = stamp; seen++; stack[top++] = j
    }
  }
  return seen === total
}

/** How many tiles a lookout at i sees right now: itself plus every non-hedge tile until a hedge or the edge. */
export function sightCount(g, st, i) {
  let s = 1
  for (let d = 0; d < 4; d++) { const ray = g.rays[i * 4 + d]; for (let k = 0; k < ray.length && st[ray[k]] !== H; k++) s++ }
  return s
}

/** How many tiles a lookout at i is certain to see: itself plus the unbroken run of known-open tiles each way. */
export function sureCount(g, st, clues, i) {
  let s = 1
  for (let d = 0; d < 4; d++) { const ray = g.rays[i * 4 + d]; for (let k = 0; k < ray.length && (st[ray[k]] === O || clues[ray[k]] > 0); k++) s++ }
  return s
}

/** The clue numbers for a full solution: every open tile gets its sight count. `hedges[i]` is 1 for a hedge. */
export function cluesFor(g, hedges) {
  const clues = new Int8Array(g.n)
  for (let i = 0; i < g.n; i++) if (hedges[i] !== H) clues[i] = sightCount(g, hedges, i)
  return clues
}

/**
 * Live feedback for a board in play. `cells[i]`: 0 empty, 1 hedge, 2 dot.
 * Returns { sees, mood, bad, cut, happy, lookouts, touching, cutCount, solved }:
 *  - sees[i]: current sight count of the lookout at i
 *  - mood[i]: 0 not there yet, 1 happy (sees exactly its number), 2 worried (can no longer be satisfied)
 *  - bad[i]: 1 if the hedge at i touches another hedge, or stands on a lookout
 *  - cut[i]: 1 if the open tile at i is in a patch cut off from the biggest open area
 */
export function analyse(g, clues, cells) {
  const { n, nb } = g
  const sees = new Int16Array(n), mood = new Uint8Array(n), bad = new Uint8Array(n), cut = new Uint8Array(n)
  let happy = 0, lookouts = 0, touching = 0, worried = 0
  for (let i = 0; i < n; i++) {
    if (cells[i] === H) {
      if (clues[i] > 0) bad[i] = 1
      for (const j of nb[i]) if (cells[j] === H) bad[i] = 1
      if (bad[i]) touching++
    }
    if (clues[i] > 0) {
      lookouts++
      sees[i] = sightCount(g, cells, i)
      if (sees[i] === clues[i]) { mood[i] = 1; happy++ } else if (sees[i] < clues[i] || sureCount(g, cells, clues, i) > clues[i]) { mood[i] = 2; worried++ }
    }
  }
  // open patches: flag everything outside the biggest one
  const comp = new Int16Array(n).fill(-1), sizes = []
  const stack = []
  for (let s = 0; s < n; s++) {
    if (cells[s] === H || comp[s] >= 0) continue
    const id = sizes.length
    let size = 0
    comp[s] = id; stack.push(s)
    while (stack.length) { const c = stack.pop(); size++; for (const j of nb[c]) if (cells[j] !== H && comp[j] < 0) { comp[j] = id; stack.push(j) } }
    sizes.push(size)
  }
  let big = 0, cutCount = 0
  for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[big]) big = k
  if (sizes.length > 1) for (let i = 0; i < n; i++) if (comp[i] >= 0 && comp[i] !== big) { cut[i] = 1; cutCount++ }
  return { sees, mood, bad, cut, happy, lookouts, worried, touching, cutCount, solved: lookouts > 0 && happy === lookouts && !touching && !cutCount }
}

/** Does this set of hedges satisfy every rule? */
export const isSolved = (g, clues, cells) => analyse(g, clues, cells).solved

/** Compact text form: one char per tile, rows joined by "/". "#" hedge, "." open, a base-36 digit for a lookout's number. */
export function encodeBoard(p) {
  const rows = []
  for (let y = 0; y < p.h; y++) {
    let r = ''
    for (let x = 0; x < p.w; x++) { const i = y * p.w + x; r += p.sol[i] === H ? '#' : p.clues[i] > 0 ? p.clues[i].toString(36) : '.' }
    rows.push(r)
  }
  return rows.join('/')
}

/** Inverse of encodeBoard. Returns { w, h, clues, sol } or null if the text is not a rectangle of known characters. */
export function decodeBoard(text) {
  const rows = String(text).split('/'), h = rows.length, w = rows[0].length
  if (!w || rows.some((r) => r.length !== w)) return null
  const clues = new Int8Array(w * h), sol = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x], i = y * w + x
    if (ch === '#') sol[i] = H
    else if (ch !== '.') { const v = parseInt(ch, 36); if (!(v > 0)) return null; clues[i] = v }
  }
  return { w, h, clues, sol }
}
