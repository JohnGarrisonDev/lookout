// A board in play: the player's marks, undo and redo, hints used, the clock. Pure, no DOM.
import { makeGrid, analyse, H, O } from './rules.js'

export const EMPTY = 0, HEDGE = H, DOT = O
const UNDO_MAX = 400

/** Start (or resume) a board. `saved` is a snapshot() from earlier; anything odd in it is ignored. */
export function createSession(puzzle, saved = null) {
  const g = makeGrid(puzzle.w, puzzle.h)
  const s = { p: puzzle, g, cells: new Uint8Array(g.n), time: 0, hints: 0, checks: 0, undo: [], redo: [], stroke: null, solved: false, info: null }
  if (saved && typeof saved === 'object' && typeof saved.cells === 'string' && saved.cells.length === g.n && /^[012]+$/.test(saved.cells)) {
    for (let i = 0; i < g.n; i++) if (!puzzle.clues[i]) s.cells[i] = saved.cells.charCodeAt(i) - 48
    s.time = num(saved.time, 0, 359999); s.hints = num(saved.hints, 0, 999) | 0; s.checks = num(saved.checks, 0, 999) | 0
  }
  refresh(s)
  return s
}
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo)

export function refresh(s) { s.info = analyse(s.g, s.p.clues, s.cells); s.solved = s.info.solved }

/** What a tap turns a tile into. Hedge-first: empty, hedge, dot, empty. Dot-first: empty, dot, hedge, empty. */
export const cycle = (cur, dotFirst = false) => (dotFirst ? [DOT, EMPTY, HEDGE][cur] : [HEDGE, DOT, EMPTY][cur])

/** Can the player change tile i? Lookout tiles and solved boards are fixed. */
export const canEdit = (s, i) => !s.solved && i >= 0 && i < s.g.n && !s.p.clues[i]

/** A stroke is one undo step: a tap, or a whole drag. */
export function beginStroke(s) { endStroke(s); s.stroke = [] }
export function endStroke(s) {
  const k = s.stroke
  s.stroke = null
  if (!k || !k.length) return false
  s.undo.push(k); if (s.undo.length > UNDO_MAX) s.undo.shift()
  s.redo.length = 0
  return true
}

/** Set tile i. Returns true if it changed. Outside a stroke, the change is its own undo step. */
export function setCell(s, i, to) {
  if (!canEdit(s, i) || s.cells[i] === to) return false
  const own = !s.stroke
  if (own) s.stroke = []
  s.stroke.push(i, s.cells[i], to)
  s.cells[i] = to
  refresh(s)
  if (own) endStroke(s)
  return true
}

function replay(s, from, to, back) {
  if (s.solved || !from.length) return null
  const k = from.pop(), changed = []
  if (back) for (let j = k.length - 3; j >= 0; j -= 3) { s.cells[k[j]] = k[j + 1]; changed.push(k[j]) }
  else for (let j = 0; j < k.length; j += 3) { s.cells[k[j]] = k[j + 2]; changed.push(k[j]) }
  to.push(k)
  refresh(s)
  return changed
}
/** Undo / redo one stroke. Returns the tiles that changed, or null if there was nothing to do. */
export const undo = (s) => (endStroke(s), replay(s, s.undo, s.redo, true))
export const redo = (s) => (endStroke(s), replay(s, s.redo, s.undo, false))

/** Clear every mark (one undo step). */
export function clearAll(s) {
  if (s.solved) return false
  beginStroke(s)
  for (let i = 0; i < s.g.n; i++) if (s.cells[i]) { s.stroke.push(i, s.cells[i], EMPTY); s.cells[i] = EMPTY }
  refresh(s)
  return endStroke(s)
}

/** Tiles where the player's marks disagree with the answer. */
export function mistakes(s) {
  const out = []
  for (let i = 0; i < s.g.n; i++) if ((s.cells[i] === HEDGE && s.p.sol[i] !== H) || (s.cells[i] === DOT && s.p.sol[i] === H)) out.push(i)
  return out
}

/** 3 stars with no help, 2 if a hint was used, 1 if mistakes were shown. */
export const starsFor = (hints, checks) => (checks > 0 ? 1 : hints > 0 ? 2 : 3)

/** What goes in the save file. */
export const snapshot = (s) => ({ cells: Array.from(s.cells).join(''), time: Math.round(s.time * 10) / 10, hints: s.hints, checks: s.checks })
