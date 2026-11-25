import test from 'node:test'
import assert from 'node:assert/strict'
import { makeGrid, connected, sightCount, cluesFor, analyse, isSolved, encodeBoard, decodeBoard, H, O } from '../src/logic/rules.js'

// 4x4, hedges at (1,0) and (2,2):
//  . # . .
//  . . . .
//  . . # .
//  . . . .
const BOARD = '.#../..../..#./....'

test('grid rays stop at the edges and neighbours are orthogonal', () => {
  const g = makeGrid(4)
  assert.deepEqual(g.rays[5 * 4 + 0], [1])
  assert.deepEqual(g.rays[5 * 4 + 1], [6, 7])
  assert.deepEqual(g.rays[5 * 4 + 2], [9, 13])
  assert.deepEqual(g.rays[5 * 4 + 3], [4])
  assert.deepEqual([...g.nb[0]].sort((a, b) => a - b), [1, 4])
  assert.deepEqual([...g.diag[5]].sort((a, b) => a - b), [0, 2, 8, 10])
})

test('sight counts include the lookout and stop at hedges', () => {
  const p = decodeBoard(BOARD), g = makeGrid(4)
  assert.equal(sightCount(g, p.sol, 0), 4) // itself + 3 down, hedge to the east
  assert.equal(sightCount(g, p.sol, 5), 6) // row of 4, plus one below (the tile above is a hedge)
  assert.equal(sightCount(g, p.sol, 15), 7)
  const clues = cluesFor(g, p.sol)
  assert.equal(clues[1], 0); assert.equal(clues[10], 0); assert.equal(clues[6], 5)
})

test('connectivity: a diagonal wall of hedges cuts a corner off', () => {
  const g = makeGrid(4)
  const st = new Uint8Array(16)
  st[1] = H
  assert.equal(connected(g, st), true)
  st[4] = H
  assert.equal(connected(g, st), false)
  assert.equal(connected(g, new Uint8Array(16), 5), true)
})

test('analyse flags touching hedges, cut-off patches and lookout moods', () => {
  const g = makeGrid(4), clues = new Int8Array(16)
  clues[5] = 6; clues[15] = 7
  const cells = new Uint8Array(16)
  let a = analyse(g, clues, cells)
  assert.equal(a.sees[5], 7); assert.equal(a.mood[5], 0); assert.equal(a.solved, false)
  cells[1] = H; cells[10] = H
  a = analyse(g, clues, cells)
  assert.equal(a.mood[5], 1); assert.equal(a.mood[15], 1); assert.equal(a.solved, true)
  assert.equal(isSolved(g, clues, cells), true)
  cells[2] = H // touches the hedge at 1
  a = analyse(g, clues, cells)
  assert.equal(a.bad[1], 1); assert.equal(a.bad[2], 1); assert.equal(a.touching, 2); assert.equal(a.solved, false)
  cells[2] = 0; cells[4] = H // cuts off the top-left corner, and over-blocks lookout 5
  a = analyse(g, clues, cells)
  assert.equal(a.cut[0], 1); assert.equal(a.cutCount, 1); assert.equal(a.mood[5], 2); assert.equal(a.solved, false)
  // dots that force a lookout to see too much make it worried as well
  const c2 = new Int8Array(16); c2[0] = 2
  const d = new Uint8Array(16); d[1] = O; d[2] = O
  assert.equal(analyse(g, c2, d).mood[0], 2)
})

test('board text round-trips', () => {
  const p = decodeBoard('3#./..2/#..')
  assert.equal(p.w, 3); assert.equal(p.h, 3)
  assert.equal(p.clues[0], 3); assert.equal(p.sol[1], H); assert.equal(p.clues[5], 2); assert.equal(p.sol[6], H)
  assert.equal(encodeBoard(p), '3#./..2/#..')
  assert.equal(decodeBoard('ab/c'), null)
  assert.equal(decodeBoard('a?'), null)
})
