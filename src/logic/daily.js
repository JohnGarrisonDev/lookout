// Daily mode: three boards per local calendar date, the same for every player. Streaks and the share text. Pure, no DOM.
import { makeRng, hashString } from '../../kit/kit.js'
import { generate } from './generate.js'

/** The three daily boards. Never reorder or resize these in place: it would change everyone's daily (see AGENTS.md). */
export const DAILY = [
  { id: 's', letter: 'S', label: 'Small', size: 6, band: 'gentle' },
  { id: 'm', letter: 'M', label: 'Medium', size: 7, band: 'medium' },
  { id: 'l', letter: 'L', label: 'Large', size: 9, band: 'hard' },
]
export const DAILY_IDS = DAILY.map((d) => d.id)
export const ARCHIVE_DAYS = 14

const pad = (v) => String(v).padStart(2, '0')
/** Local calendar date as YYYY-MM-DD. */
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12) }
export const isDateKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && dateKey(parseKey(k)) === k
/** The date `days` away from a date key (negative = earlier). */
export function shiftDay(key, days) { const d = parseKey(key); d.setDate(d.getDate() + days); return dateKey(d) }
/** { weekday: 0-6 (Sunday 0), day, month: 0-11 } for a date key. */
export function dayParts(key) { const d = parseKey(key); return { weekday: d.getDay(), day: d.getDate(), month: d.getMonth() } }

/** Generator definitions for one date: the three seeds come from one rng seeded by the date string. */
export function dailyDefs(key) {
  const rng = makeRng(hashString('lookout:' + key))
  return DAILY.map((d) => ({ id: d.id, size: d.size, band: d.band, seed: Math.floor(rng() * 4294967296) >>> 0 }))
}
export const dailyDef = (key, id) => dailyDefs(key).find((d) => d.id === id) || null
export const dailyPuzzle = (key, id) => generate(dailyDef(key, id))

/** Does this day count for the streak? The Small board must have been solved on the day itself. */
export const dayCounts = (rec) => !!(rec && rec.s && !rec.s.late)

/** { current, best } streaks from the history, as of `today`. Today not played yet does not break a streak. */
export function streakInfo(history, today) {
  let current = 0
  for (let k = dayCounts(history[today]) ? today : shiftDay(today, -1); dayCounts(history[k]); k = shiftDay(k, -1)) current++
  let best = current
  const keys = Object.keys(history).filter((k) => dayCounts(history[k])).sort()
  for (let i = 0, run = 0; i < keys.length; i++) { run = i > 0 && shiftDay(keys[i - 1], 1) === keys[i] ? run + 1 : 1; if (run > best) best = run }
  return { current, best }
}

export function formatTime(sec) {
  const t = Math.max(0, Math.floor(sec)), m = Math.floor(t / 60), s = t % 60
  return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Spoiler-free result line for one date, e.g. "Lookout 2026-11-24 · S 0:48 · M 2:31 · L 6:02 💡1". */
export function shareText(key, rec) {
  const parts = DAILY.map((d) => `${d.letter} ${rec && rec[d.id] ? formatTime(rec[d.id].t) : '–'}`)
  const hints = DAILY.reduce((a, d) => a + (rec && rec[d.id] ? rec[d.id].h : 0), 0)
  return `Lookout ${key} · ${parts.join(' · ')}${hints ? ` 💡${hints}` : ''}\nhttps://games.oddvale.com/lookout/`
}
