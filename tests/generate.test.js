import test from 'node:test'
import assert from 'node:assert/strict'
import { makeGrid, connected, cluesFor, isSolved, H } from '../src/logic/rules.js'
import { solve, countSolutions, tierMask, bit } from '../src/logic/solver.js'
import { generate, puzzleHash, BANDS, BAND_IDS, MIN_SIZE, MAX_SIZE } from '../src/logic/generate.js'

test('generated boards are valid, unique and inside their difficulty band, across sizes and seeds', () => {
  for (const band of BAND_IDS) {
    const tier = BANDS[band].tier
    for (let size = MIN_SIZE; size <= MAX_SIZE; size++) {
      const count = band === 'fiendish' ? 4 : 10
      for (let k = 0; k < count; k++) {
        const p = generate({ size, band, seed: 12345 + k * 1009 + size * 17 })
        const g = makeGrid(size), label = `${band} ${size}x${size} #${k}`
        assert.equal(p.w, size); assert.equal(p.h, size)
        // the answer obeys the rules
        for (let i = 0; i < g.n; i++) if (p.sol[i] === H) for (const j of g.nb[i]) assert.notEqual(p.sol[j], H, `${label}: touching hedges`)
        assert.ok(connected(g, p.sol), `${label}: field in one piece`)
        const real = cluesFor(g, p.sol)
        let lookouts = 0
        for (let i = 0; i < g.n; i++) if (p.clues[i]) { lookouts++; assert.equal(p.sol[i], 0, `${label}: lookout on a hedge`); assert.equal(p.clues[i], real[i], `${label}: wrong number`) }
        assert.ok(lookouts >= 1, label)
        assert.ok(isSolved(g, p.clues, p.sol), label)
        // solvable by the band's deductions alone, and needs the band's tier
        assert.equal(p.inBand, true, `${label}: off band`)
        const r = solve(p, tierMask(tier))
        assert.equal(r.complete, true, `${label}: not solvable by deduction`)
        assert.equal(r.tier, tier, `${label}: tier`)
        if (tier > 1) assert.equal(solve(p, tierMask(tier - 1)).complete, false, `${label}: too easy for its band`)
        assert.equal(p.grade.tier, tier)
        // exactly one answer, by brute search too
        if (k < 4) { const c = countSolutions(p); assert.equal(c.count, 1, `${label}: not unique`); for (let i = 0; i < g.n; i++) assert.equal(c.first[i] === H, p.sol[i] === H) }
      }
    }
  }
})

test('generation is deterministic and seeds matter', () => {
  const a = generate({ size: 7, band: 'medium', seed: 42 }), b = generate({ size: 7, band: 'medium', seed: 42 }), c = generate({ size: 7, band: 'medium', seed: 43 })
  assert.equal(puzzleHash(a), puzzleHash(b))
  assert.notEqual(puzzleHash(a), puzzleHash(c))
})

test('allow / need / hedges options are honoured', () => {
  const allow = tierMask(1) | bit('over')
  const p = generate({ size: 5, band: 'medium', seed: 7, allow, need: bit('over') })
  assert.equal(p.inBand, true)
  assert.ok(p.grade.used & bit('over'))
  assert.equal(p.grade.used & ~allow, 0)
  const q = generate({ size: 4, band: 'gentle', seed: 3, hedges: 2 })
  assert.ok(q.sol.reduce((x, v) => x + v, 0) <= 2)
})

test('odd inputs are clamped, not fatal', () => {
  assert.equal(generate({ size: 99, band: 'nope', seed: 1 }).w, MAX_SIZE)
  assert.equal(generate({ size: 1, seed: -5 }).w, MIN_SIZE)
})

test('the largest board generates fast enough for page load', () => {
  const t = performance.now()
  for (let k = 0; k < 10; k++) generate({ size: 9, band: 'hard', seed: 100 + k })
  assert.ok((performance.now() - t) / 10 < 250, 'average under a quarter second (it is usually a few ms)')
})
