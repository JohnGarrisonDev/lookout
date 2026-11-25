// Save schema and sanitiser. Pure, no DOM. One blob lives at localStorage "oddvale:lookout".
//
// {
//   v: 1,
//   settings: { timer: bool (show the clock), dotFirst: bool (taps place a dot before a hedge), lines: bool (sight lines) },
//   journey:  { stars: [0-3 per level], best: [best time in seconds per level, 0 = none] },
//   daily:    { history: { 'YYYY-MM-DD': { s?: R, m?: R, l?: R } }, bestStreak }   R = { t: seconds, h: hints, c: checks, late?: true }
//   free:     { size, band, solved },
//   progress: { journey: { level, board } | null, free: { def: { size, band, seed }, board } | null, daily: { 'YYYY-MM-DD:s': board } },
//   last:     null | { mode: 'journey' } | { mode: 'free' } | { mode: 'daily', date, id }     (what was on screen, so a reload resumes)
// }
// board = { cells: '0120...', time, hints, checks } (see session.js snapshot)
import { LEVEL_COUNT } from './levels.js'
import { BANDS, MIN_SIZE, MAX_SIZE } from './generate.js'
import { DAILY_IDS, isDateKey } from './daily.js'

const HISTORY_MAX = 800, DAILY_PROGRESS_MAX = 24

export const defaults = () => ({
  v: 1,
  settings: { timer: true, dotFirst: false, lines: true },
  journey: { stars: new Array(LEVEL_COUNT).fill(0), best: new Array(LEVEL_COUNT).fill(0) },
  daily: { history: {}, bestStreak: 0 },
  free: { size: 6, band: 'medium', solved: 0 },
  progress: { journey: null, free: null, daily: {} },
  last: null,
})

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const int = (v, lo, hi, d = lo) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d)
const bool = (v, d) => (typeof v === 'boolean' ? v : d)

function board(v) {
  const b = obj(v)
  if (typeof b.cells !== 'string' || b.cells.length > 400 || !/^[012]+$/.test(b.cells)) return null
  return { cells: b.cells, time: Number.isFinite(b.time) ? Math.max(0, Math.min(359999, b.time)) : 0, hints: int(b.hints, 0, 999), checks: int(b.checks, 0, 999) }
}
function result(v) {
  const r = obj(v)
  if (!Number.isFinite(r.t)) return null
  const out = { t: int(r.t, 0, 359999), h: int(r.h, 0, 999), c: int(r.c, 0, 999) }
  if (r.late === true) out.late = true
  return out
}

/** Build a clean save from whatever was stored. Never throws; junk becomes defaults. */
export function sanitize(raw) {
  const d = defaults(), r = obj(raw)
  const st = obj(r.settings)
  d.settings = { timer: bool(st.timer, true), dotFirst: bool(st.dotFirst, false), lines: bool(st.lines, true) }
  const j = obj(r.journey), stars = Array.isArray(j.stars) ? j.stars : [], best = Array.isArray(j.best) ? j.best : []
  for (let i = 0; i < LEVEL_COUNT; i++) { d.journey.stars[i] = int(stars[i], 0, 3); d.journey.best[i] = int(best[i], 0, 359999) }
  const dl = obj(r.daily), hist = obj(dl.history)
  for (const key of Object.keys(hist).filter(isDateKey).sort().slice(-HISTORY_MAX)) {
    const rec = obj(hist[key]), out = {}
    for (const id of DAILY_IDS) { const x = result(rec[id]); if (x) out[id] = x }
    if (Object.keys(out).length) d.daily.history[key] = out
  }
  d.daily.bestStreak = int(dl.bestStreak, 0, 99999)
  const f = obj(r.free)
  d.free = { size: int(f.size, MIN_SIZE, MAX_SIZE, 6), band: BANDS[f.band] ? f.band : 'medium', solved: int(f.solved, 0, 9999999) }
  const p = obj(r.progress), pj = obj(p.journey), pf = obj(p.free), pfd = obj(pf.def), pd = obj(p.daily)
  if (Number.isInteger(pj.level) && pj.level >= 0 && pj.level < LEVEL_COUNT && board(pj.board)) d.progress.journey = { level: pj.level, board: board(pj.board) }
  if (Number.isInteger(pfd.size) && pfd.size >= MIN_SIZE && pfd.size <= MAX_SIZE && BANDS[pfd.band] && Number.isFinite(pfd.seed) && board(pf.board)) {
    d.progress.free = { def: { size: pfd.size, band: pfd.band, seed: pfd.seed >>> 0 }, board: board(pf.board) }
  }
  const dk = Object.keys(pd).filter((k) => isDateKey(k.slice(0, 10)) && k[10] === ':' && DAILY_IDS.includes(k.slice(11)) && board(pd[k])).sort().slice(-DAILY_PROGRESS_MAX)
  for (const k of dk) d.progress.daily[k] = board(pd[k])
  const l = obj(r.last)
  if (l.mode === 'journey' || l.mode === 'free') d.last = { mode: l.mode }
  else if (l.mode === 'daily' && isDateKey(l.date) && DAILY_IDS.includes(l.id)) d.last = { mode: 'daily', date: l.date, id: l.id }
  return d
}

export const totalStars = (save) => save.journey.stars.reduce((a, b) => a + b, 0)
export const solvedCount = (save) => save.journey.stars.reduce((a, b) => a + (b > 0 ? 1 : 0), 0)

/** Record a Journey result. Keeps the best stars and the best time. Returns { newBest } (a faster time than an earlier one). */
export function recordJourney(save, i, stars, time) {
  const t = Math.max(1, Math.round(time)), prev = save.journey.best[i]
  save.journey.stars[i] = Math.max(save.journey.stars[i], stars)
  if (!prev || t < prev) save.journey.best[i] = t
  return { newBest: prev > 0 && t < prev, prev }
}

/** Record a Daily result (first solve only). `today` decides whether it counts for the streak. Returns the stored record. */
export function recordDaily(save, date, id, res, today) {
  const day = save.daily.history[date] || (save.daily.history[date] = {})
  if (!day[id]) { day[id] = { t: Math.max(1, Math.round(res.time)), h: res.hints | 0, c: res.checks | 0 }; if (date !== today) day[id].late = true }
  return day[id]
}

/** Drop in-progress daily boards older than the archive window. */
export function pruneDailyProgress(save, oldestKey) {
  for (const k of Object.keys(save.progress.daily)) if (k.slice(0, 10) < oldestKey) delete save.progress.daily[k]
}
