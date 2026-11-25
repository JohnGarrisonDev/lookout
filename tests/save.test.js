import test from 'node:test'
import assert from 'node:assert/strict'
import { defaults, sanitize, recordJourney, recordDaily, pruneDailyProgress, totalStars, solvedCount } from '../src/logic/save.js'
import { LEVEL_COUNT } from '../src/logic/levels.js'

test('junk becomes a clean default save', () => {
  for (const junk of [undefined, null, 0, 'hello', [], [1, 2], { settings: 5, journey: 'x', daily: [], free: null, progress: 7, last: 3 }]) {
    assert.deepEqual(sanitize(junk), defaults())
  }
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(defaults()))), defaults())
})

test('fields are clamped and unknown keys dropped', () => {
  const s = sanitize({
    evil: '<script>', settings: { timer: 'yes', dotFirst: true, lines: false, extra: 1 },
    journey: { stars: [3, 9, -2, 'x', 2.7], best: [10, -5, 1e12] },
    daily: {
      bestStreak: 4.9,
      history: { '2026-11-24': { s: { t: 48.7, h: 1, c: 0 }, m: { t: 'x' }, q: { t: 1 } }, '2026-13-45': { s: { t: 5 } }, nope: { s: { t: 5 } }, '2026-11-23': { l: { t: 9, h: -3, c: 2, late: true } }, '2026-11-22': {} },
    },
    free: { size: 40, band: 'impossible', solved: -3 },
    progress: {
      journey: { level: 3, board: { cells: '0120', time: 5, hints: 1, checks: 0 } },
      free: { def: { size: 6, band: 'hard', seed: 123 }, board: { cells: '00', time: 'x' } },
      daily: { '2026-11-24:s': { cells: '012', time: 3 }, '2026-11-24:z': { cells: '0' }, 'bad': { cells: '0' }, '2026-11-24:m': { cells: 'abc' } },
    },
    last: { mode: 'daily', date: '2026-11-24', id: 'm', junk: true },
  })
  assert.equal(s.evil, undefined)
  assert.deepEqual(s.settings, { timer: true, dotFirst: true, lines: false })
  assert.deepEqual(s.journey.stars.slice(0, 6), [3, 3, 0, 0, 2, 0]); assert.equal(s.journey.stars.length, LEVEL_COUNT)
  assert.deepEqual(s.journey.best.slice(0, 3), [10, 0, 359999])
  assert.deepEqual(s.daily.history, { '2026-11-24': { s: { t: 48, h: 1, c: 0 } }, '2026-11-23': { l: { t: 9, h: 0, c: 2, late: true } } })
  assert.equal(s.daily.bestStreak, 4)
  assert.deepEqual(s.free, { size: 9, band: 'medium', solved: 0 })
  assert.deepEqual(s.progress.journey, { level: 3, board: { cells: '0120', time: 5, hints: 1, checks: 0 } })
  assert.deepEqual(s.progress.free, { def: { size: 6, band: 'hard', seed: 123 }, board: { cells: '00', time: 0, hints: 0, checks: 0 } })
  assert.deepEqual(Object.keys(s.progress.daily), ['2026-11-24:s'])
  assert.deepEqual(s.last, { mode: 'daily', date: '2026-11-24', id: 'm' })
  assert.equal(sanitize({ last: { mode: 'daily', date: 'x', id: 's' } }).last, null)
  assert.equal(sanitize({ progress: { journey: { level: 999, board: { cells: '0' } } } }).progress.journey, null)
  assert.equal(sanitize({ progress: { free: { def: { size: 6, band: 'hard', seed: 'x' }, board: { cells: '0' } } } }).progress.free, null)
})

test('journey results keep the best stars and time', () => {
  const s = defaults()
  assert.deepEqual(recordJourney(s, 2, 2, 90.4), { newBest: false, prev: 0 })
  assert.equal(s.journey.stars[2], 2); assert.equal(s.journey.best[2], 90)
  assert.equal(recordJourney(s, 2, 1, 120).newBest, false)
  assert.equal(s.journey.stars[2], 2); assert.equal(s.journey.best[2], 90)
  assert.equal(recordJourney(s, 2, 3, 61).newBest, true)
  assert.equal(s.journey.stars[2], 3); assert.equal(s.journey.best[2], 61)
  assert.equal(totalStars(s), 3); assert.equal(solvedCount(s), 1)
})

test('daily results: first solve sticks, archive solves are marked late', () => {
  const s = defaults()
  recordDaily(s, '2026-11-24', 's', { time: 48.2, hints: 1, checks: 0 }, '2026-11-24')
  recordDaily(s, '2026-11-24', 's', { time: 5, hints: 0, checks: 0 }, '2026-11-24')
  recordDaily(s, '2026-11-20', 'm', { time: 200, hints: 0, checks: 2 }, '2026-11-24')
  assert.deepEqual(s.daily.history, { '2026-11-24': { s: { t: 48, h: 1, c: 0 } }, '2026-11-20': { m: { t: 200, h: 0, c: 2, late: true } } })
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s))).daily.history, s.daily.history)
})

test('old in-progress dailies are pruned', () => {
  const s = defaults()
  s.progress.daily = { '2026-11-01:s': { cells: '0' }, '2026-11-11:m': { cells: '0' }, '2026-11-24:l': { cells: '0' } }
  pruneDailyProgress(s, '2026-11-11')
  assert.deepEqual(Object.keys(s.progress.daily), ['2026-11-11:m', '2026-11-24:l'])
})
