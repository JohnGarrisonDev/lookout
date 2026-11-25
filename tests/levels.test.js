import test from 'node:test'
import assert from 'node:assert/strict'
import { hashString } from '../kit/kit.js'
import { CHAPTERS, PER_CHAPTER, LEVEL_COUNT, RECIPES, journeyLevel, levelLabel, isUnlocked } from '../src/logic/levels.js'
import { JOURNEY } from '../src/logic/journey-data.js'
import { makeGrid, cluesFor, isSolved, H } from '../src/logic/rules.js'
import { solve, countSolutions, maskOf, tierMask, bit } from '../src/logic/solver.js'
import { BANDS } from '../src/logic/generate.js'

// !! Players' stars are stored by level index. If this fails, a stored Journey board changed. Do not paste a new
// hash in to make it pass: append new levels instead (see AGENTS.md).
const JOURNEY_SNAPSHOT = 'e3d635c1'

test('40 levels in 4 chapters of 10, matching the snapshot', () => {
  assert.equal(CHAPTERS.length, 4)
  for (const c of CHAPTERS) { assert.equal(c.levels.length, PER_CHAPTER); assert.ok(c.name && c.blurb) }
  assert.equal(LEVEL_COUNT, 40); assert.equal(JOURNEY.length, 40)
  assert.equal(new Set(JOURNEY).size, 40)
  assert.equal(hashString(JOURNEY.join('|')).toString(16), JOURNEY_SNAPSHOT)
  assert.equal(levelLabel(0), '1-1'); assert.equal(levelLabel(16), '2-7'); assert.equal(levelLabel(39), '4-10')
})

test('every level is valid, unique, solvable by its recipe and teaches what it says', () => {
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const lvl = journeyLevel(i), r = RECIPES[i], g = makeGrid(lvl.w, lvl.h), label = `level ${levelLabel(i)}`
    assert.equal(lvl.w, r.size); assert.equal(lvl.h, r.size); assert.ok(lvl.w <= 9, 'fits a phone')
    assert.equal(lvl.index, i); assert.equal(lvl.chapter, Math.floor(i / 10))
    const real = cluesFor(g, lvl.sol)
    for (let k = 0; k < g.n; k++) if (lvl.clues[k]) assert.equal(lvl.clues[k], real[k], label)
    assert.ok(isSolved(g, lvl.clues, lvl.sol), label)
    assert.equal(countSolutions(lvl).count, 1, `${label}: unique`)
    const allow = (r.allow ? maskOf(r.allow) : tierMask(BANDS[r.band].tier)) | bit('neighbour')
    const res = solve(lvl, allow)
    assert.equal(res.complete, true, `${label}: solvable with its allowed deductions`)
    assert.equal(res.tier, BANDS[r.band].tier, `${label}: tier`)
    for (const t of r.need || []) assert.ok(res.used & bit(t), `${label}: uses ${t}`)
    if (r.hedges) assert.equal(lvl.sol.reduce((a, v) => a + (v === H ? 1 : 0), 0), r.hedges, label)
  }
})

test('the first three levels are tiny tutorials with a prompt', () => {
  for (let i = 0; i < 3; i++) {
    const lvl = journeyLevel(i)
    assert.equal(lvl.w, 4); assert.ok(lvl.tip.length > 20)
    assert.ok(lvl.sol.reduce((a, v) => a + v, 0) <= 4)
  }
})

test('difficulty climbs: later chapters score higher on average', () => {
  const avg = (c) => { let s = 0; for (let n = 0; n < 10; n++) s += journeyLevel(c * 10 + n).grade.score; return s / 10 }
  assert.ok(avg(0) < avg(1)); assert.ok(avg(1) < avg(3))
})

test('unlocking: the next level, plus two spare, are open', () => {
  const stars = new Array(40).fill(0)
  assert.equal(isUnlocked(stars, 0), true); assert.equal(isUnlocked(stars, 2), true); assert.equal(isUnlocked(stars, 3), false)
  stars[0] = 3; stars[1] = 1
  assert.equal(isUnlocked(stars, 4), true); assert.equal(isUnlocked(stars, 5), false)
  stars[3] = 2 // skipping ahead does not open more until the gap is filled
  assert.equal(isUnlocked(stars, 5), false)
  stars.fill(3)
  assert.equal(isUnlocked(stars, 39), true)
})
