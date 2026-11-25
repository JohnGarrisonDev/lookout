import test from 'node:test'
import assert from 'node:assert/strict'
import { makeGrid, decodeBoard, cluesFor, H, O, U } from '../src/logic/rules.js'
import { solve, countSolutions, findSteps, nextStep, startState, hintFor, describe, tierMask, maskOf, bit, TECHS, TIER, ALL } from '../src/logic/solver.js'
import { generate } from '../src/logic/generate.js'

const hedgesOf = (st) => Array.from(st, (v) => (v === H ? 1 : 0)).join('')

// Hand-made boards. "#" marks the answer's hedges; the numbers were counted by hand (and are re-counted below).
const HAND = [
  { text: '4#3./.6../..#4/..47', note: 'two hedges, gentle' },
  { text: '4#35/..../5.#./..4.', note: 'same field, fewer lookouts, needs reach and over' },
  { text: '3#3/5../.#3', note: '3x3' },
  { text: '#5.#/.7../..7./#.5#', note: 'four corners' },
]

test('the solver finds the known answer on hand-made boards', () => {
  for (const h of HAND) {
    const p = decodeBoard(h.text)
    // sanity: the stated numbers are what the lookouts really see in the stated answer
    const real = cluesFor(makeGrid(p.w, p.h), p.sol)
    for (let i = 0; i < p.clues.length; i++) if (p.clues[i]) assert.equal(p.clues[i], real[i], `${h.note}: clue ${i}`)
    const r = solve(p)
    assert.equal(r.complete, true, h.note)
    assert.equal(hedgesOf(r.st), Array.from(p.sol).join(''), h.note)
    const c = countSolutions(p)
    assert.equal(c.count, 1, h.note)
    assert.equal(hedgesOf(c.first), Array.from(p.sol).join(''), h.note)
  }
})

test('the uniqueness check rejects boards with several answers, and boards with none', () => {
  // one lookout that sees its whole row either way: the hedge could sit in several places
  const loose = decodeBoard('..../.3../..../....')
  assert.equal(countSolutions(loose, 2).count, 2)
  assert.equal(solve(loose).complete, false)
  // too few lookouts to pin anything down
  const two = decodeBoard('7.../..../..../...7')
  assert.ok(countSolutions(two, 5).count > 1)
  // impossible: a corner lookout on a 3x3 can see at most 5
  const none = decodeBoard('9../.../...')
  assert.equal(countSolutions(none).count, 0)
  assert.equal(solve(none).complete, false)
  // contradictory neighbours: both want to see only themselves, which needs touching hedges or a cut
  assert.equal(countSolutions(decodeBoard('11./.../...')).count, 0)
})

test('each named deduction fires where it should', () => {
  const g = makeGrid(4)
  // cap: a lookout that already sees its number fences itself in
  let clues = new Int8Array(16); clues[5] = 1
  let st = startState(g, clues)
  let s = findSteps(g, clues, st, 'cap')[0]
  assert.deepEqual([...s.cells].sort((a, b) => a - b), [1, 4, 6, 9]); assert.ok(s.vals.every((v) => v === H))
  // full: a lookout that can only just reach its number keeps everything open
  clues = new Int8Array(16); clues[0] = 7
  st = startState(g, clues)
  s = findSteps(g, clues, st, 'full')[0]
  assert.deepEqual([...s.cells].sort((a, b) => a - b), [1, 2, 3, 4, 8, 12]); assert.ok(s.vals.every((v) => v === O))
  // neighbour: tiles beside a hedge are open
  st = new Uint8Array(16); st[5] = H
  s = findSteps(g, new Int8Array(16), st, 'neighbour')[0]
  assert.deepEqual([...s.cells].sort((a, b) => a - b), [1, 4, 6, 9])
  // reach: corner lookout wanting 6 of a possible 7 must see at least 2 each way
  clues = new Int8Array(16); clues[0] = 6
  st = startState(g, clues)
  const reach = findSteps(g, clues, st, 'reach')
  assert.equal(reach.length, 2)
  assert.deepEqual(reach.map((x) => x.cells).flat().sort((a, b) => a - b), [1, 2, 4, 8])
  // over: opening the gap would join a run and show too much
  clues = new Int8Array(16); clues[0] = 2
  st = startState(g, clues); st[2] = O; st[3] = O
  s = findSteps(g, clues, st, 'over')[0]
  assert.deepEqual(s.cells, [1]); assert.deepEqual(s.vals, [H]); assert.equal(s.would, 4)
  // connect: a hedge that would seal off the corner must stay open
  st = new Uint8Array(16); st[1] = H
  s = findSteps(g, new Int8Array(16), st, 'connect')
  assert.ok(s.some((x) => x.cells[0] === 4 && x.vals[0] === O))
  // combo: a corner lookout wants 2, and tile 2 is known open. Looking 1 east is impossible (it would have to stop
  // on an open tile), so the only way is 0 east and 1 south: hedge at 1, open at 4, hedge at 8.
  clues = new Int8Array(16); clues[0] = 2
  st = startState(g, clues); st[2] = O
  s = findSteps(g, clues, st, 'combo')
  assert.equal(s.length, 1)
  const got = {}
  s[0].cells.forEach((c, k) => { got[c] = s[0].vals[k] })
  assert.deepEqual(got, { 1: H, 4: O, 8: H })
})

test('every deduction on generated boards agrees with the answer, at every tier', () => {
  for (const band of ['gentle', 'medium', 'hard', 'fiendish']) {
    for (let k = 0; k < 12; k++) {
      const p = generate({ size: 5 + (k % 4), band, seed: 500 + k * 31 })
      const g = makeGrid(p.w, p.h), st = startState(g, p.clues)
      for (let guard = 0; guard < 200; guard++) {
        const s = nextStep(g, p.clues, st)
        if (!s) break
        assert.ok(s.cells.length > 0)
        for (let j = 0; j < s.cells.length; j++) {
          assert.equal(st[s.cells[j]], U, 'steps only touch undecided tiles')
          assert.equal(s.vals[j] === H, p.sol[s.cells[j]] === H, `${band} ${s.tech} is wrong`)
          st[s.cells[j]] = s.vals[j]
        }
        assert.equal(typeof describe(s), 'string')
      }
      assert.ok(!st.includes(U), 'the ladder finishes the board')
    }
  }
})

test('hints: flag mistakes first, then give correct steps until the board is done', () => {
  for (let k = 0; k < 20; k++) {
    const p = generate({ size: 6 + (k % 3), band: ['gentle', 'medium', 'hard'][k % 3], seed: 9000 + k })
    const cells = new Uint8Array(p.w * p.h)
    // a wrong hedge is reported, not reasoned from
    const open = p.sol.findIndex((v, i) => v !== H && !p.clues[i])
    if (open >= 0) { cells[open] = H; const h = hintFor(p, cells); assert.equal(h.kind, 'mistake'); assert.deepEqual(h.wrong, [open]); cells[open] = 0 }
    const hedge = p.sol.indexOf(H)
    cells[hedge] = O
    assert.deepEqual(hintFor(p, cells).wrong, [hedge])
    cells[hedge] = 0
    for (let guard = 0; guard < 200; guard++) {
      const h = hintFor(p, cells)
      if (h.kind === 'done') break
      assert.equal(h.kind, 'step')
      assert.notEqual(h.step.tech, 'reveal', 'generated boards never need a give-away')
      assert.ok(h.text.length > 10)
      for (let j = 0; j < h.step.cells.length; j++) {
        const i = h.step.cells[j]
        assert.equal(cells[i], 0)
        assert.equal(h.step.vals[j] === H, p.sol[i] === H)
        cells[i] = h.step.vals[j]
      }
    }
    assert.equal(hintFor(p, cells).kind, 'done')
    for (let i = 0; i < cells.length; i++) assert.equal(cells[i] === H, p.sol[i] === H)
  }
})

test('hints still work from a half-filled board that only has hedges on it', () => {
  const p = generate({ size: 7, band: 'hard', seed: 77 })
  const cells = new Uint8Array(49)
  let placed = 0
  for (let i = 0; i < 49 && placed < 4; i++) if (p.sol[i] === H) { cells[i] = H; placed++ }
  const h = hintFor(p, cells)
  assert.equal(h.kind, 'step')
  for (let j = 0; j < h.step.cells.length; j++) assert.equal(h.step.vals[j] === H, p.sol[h.step.cells[j]] === H)
})

test('technique tables are consistent', () => {
  for (const t of TECHS) assert.ok(TIER[t] >= 1 && TIER[t] <= 4)
  assert.equal(tierMask(1), maskOf(['neighbour', 'cap', 'full']))
  assert.equal(ALL & bit('trial'), bit('trial'))
  assert.equal(tierMask(3) & bit('trial'), 0)
})
