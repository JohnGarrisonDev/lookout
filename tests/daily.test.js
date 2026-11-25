import test from 'node:test'
import assert from 'node:assert/strict'
import { DAILY, dateKey, isDateKey, shiftDay, dayParts, dailyDefs, dailyDef, dailyPuzzle, streakInfo, dayCounts, formatTime, shareText } from '../src/logic/daily.js'
import { puzzleHash, BANDS } from '../src/logic/generate.js'
import { countSolutions } from '../src/logic/solver.js'

// !! These fingerprints pin everyone's daily boards. If this test fails you changed the generator, the solver's
// deductions, or the seeds. Do not paste new hashes in: see "Seeds and snapshots" in AGENTS.md.
const DAILY_SNAPSHOT = {
  '2026-11-24': ['c4e9a007', '147688ae', '8ee18bf6'],
  '2026-12-25': ['bf3dee44', 'e97593ed', '7417b4eb'],
  '2027-02-28': ['210fb0f8', '5e05dd64', '1ad465c0'],
  '2028-02-29': ['e7d784ff', '9745df12', '2a069d0c'],
}

test('daily boards match their snapshot', () => {
  for (const [key, want] of Object.entries(DAILY_SNAPSHOT)) {
    assert.deepEqual(DAILY.map((d) => puzzleHash(dailyPuzzle(key, d.id))), want, key)
  }
})

test('daily boards are deterministic, differ by day and size, and sit in their bands', () => {
  const seen = new Set()
  for (let k = 0; k < 20; k++) {
    const key = shiftDay('2026-11-24', k)
    const defs = dailyDefs(key)
    assert.deepEqual(defs, dailyDefs(key))
    assert.deepEqual(defs.map((d) => d.id), ['s', 'm', 'l'])
    for (const d of DAILY) {
      const p = dailyPuzzle(key, d.id)
      assert.equal(p.w, d.size); assert.equal(p.inBand, true, `${key} ${d.id}`)
      assert.equal(p.grade.tier, BANDS[d.band].tier)
      assert.equal(puzzleHash(p), puzzleHash(dailyPuzzle(key, d.id)))
      seen.add(puzzleHash(p))
      if (k < 3) assert.equal(countSolutions(p).count, 1)
    }
  }
  assert.equal(seen.size, 60)
  assert.equal(dailyDef('2026-11-24', 'x'), null)
})

test('date helpers', () => {
  assert.equal(dateKey(new Date(2026, 10, 24, 23, 59)), '2026-11-24')
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05')
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29')
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01')
  assert.equal(shiftDay('2026-11-24', -13), '2026-11-11')
  assert.deepEqual(dayParts('2026-11-24'), { weekday: 2, day: 24, month: 10 })
  assert.ok(isDateKey('2026-11-24'))
  for (const bad of ['2026-13-01', '2026-02-30', '26-1-1', '', null, 5, '2026-11-24x']) assert.equal(isDateKey(bad), false)
})

test('streaks count days where Small was solved on the day', () => {
  const R = { t: 50, h: 0, c: 0 }
  const h = { '2026-11-24': { s: R }, '2026-11-23': { s: R, m: R }, '2026-11-22': { s: R }, '2026-11-20': { s: R }, '2026-11-19': { s: R }, '2026-11-18': { s: R }, '2026-11-17': { s: R } }
  assert.deepEqual(streakInfo(h, '2026-11-24'), { current: 3, best: 4 })
  assert.deepEqual(streakInfo(h, '2026-11-25'), { current: 3, best: 4 }) // today not played yet
  assert.deepEqual(streakInfo(h, '2026-11-26'), { current: 0, best: 4 })
  assert.deepEqual(streakInfo({}, '2026-11-24'), { current: 0, best: 0 })
  // Medium alone does not count, and archive (late) solves never do
  assert.equal(dayCounts({ m: R, l: R }), false)
  assert.equal(dayCounts({ s: { ...R, late: true } }), false)
  const late = { '2026-11-24': { s: R }, '2026-11-23': { s: { ...R, late: true } }, '2026-11-22': { s: R } }
  assert.deepEqual(streakInfo(late, '2026-11-24'), { current: 1, best: 1 })
})

test('time and share text', () => {
  assert.equal(formatTime(0), '0:00'); assert.equal(formatTime(48.9), '0:48'); assert.equal(formatTime(151), '2:31'); assert.equal(formatTime(3725), '1:02:05'); assert.equal(formatTime(-5), '0:00')
  const rec = { s: { t: 48, h: 0, c: 0 }, m: { t: 151, h: 1, c: 0 }, l: { t: 362, h: 0, c: 0 } }
  assert.equal(shareText('2026-11-24', rec), 'Lookout 2026-11-24 · S 0:48 · M 2:31 · L 6:02 💡1\ngames.oddvale.com/lookout')
  assert.equal(shareText('2026-11-24', { s: { t: 48, h: 0, c: 0 } }), 'Lookout 2026-11-24 · S 0:48 · M – · L –\ngames.oddvale.com/lookout')
  assert.ok(shareText('2026-11-24', undefined).endsWith('games.oddvale.com/lookout'))
})
