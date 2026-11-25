import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeBoard, H } from '../src/logic/rules.js'
import { createSession, setCell, beginStroke, endStroke, undo, redo, clearAll, cycle, canEdit, mistakes, starsFor, snapshot, EMPTY, HEDGE, DOT } from '../src/logic/session.js'

const puzzle = () => decodeBoard('4#../.6../..#./..47')

test('tap cycle orders', () => {
  assert.deepEqual([EMPTY, HEDGE, DOT].map((c) => cycle(c)), [HEDGE, DOT, EMPTY])
  assert.deepEqual([EMPTY, DOT, HEDGE].map((c) => cycle(c, true)), [DOT, HEDGE, EMPTY])
})

test('lookout tiles cannot be edited; solving locks the board', () => {
  const s = createSession(puzzle())
  assert.equal(canEdit(s, 0), false); assert.equal(setCell(s, 0, HEDGE), false)
  assert.equal(setCell(s, 1, HEDGE), true)
  assert.equal(s.solved, false)
  assert.equal(setCell(s, 10, HEDGE), true)
  assert.equal(s.solved, true)
  assert.equal(setCell(s, 2, HEDGE), false)
  assert.equal(undo(s), null)
})

test('dots are notes: they never block a solve', () => {
  const s = createSession(puzzle())
  setCell(s, 2, DOT); setCell(s, 1, HEDGE); setCell(s, 10, HEDGE)
  assert.equal(s.solved, true)
})

test('undo and redo work a stroke at a time', () => {
  const s = createSession(puzzle())
  beginStroke(s); setCell(s, 2, DOT); setCell(s, 3, DOT); setCell(s, 7, DOT); endStroke(s)
  setCell(s, 4, HEDGE)
  assert.equal(s.undo.length, 2)
  assert.deepEqual(undo(s), [4]); assert.equal(s.cells[4], EMPTY)
  assert.deepEqual(undo(s).sort((a, b) => a - b), [2, 3, 7]); assert.equal(s.cells[3], EMPTY)
  assert.equal(undo(s), null)
  assert.deepEqual(redo(s), [2, 3, 7]); assert.equal(s.cells[7], DOT)
  setCell(s, 8, HEDGE) // a new move drops the redo stack
  assert.equal(redo(s), null)
  assert.equal(clearAll(s), true)
  assert.ok(s.cells.every((c) => c === EMPTY))
  undo(s)
  assert.equal(s.cells[8], HEDGE); assert.equal(s.cells[2], DOT)
  assert.equal(clearAll(createSession(puzzle())), false)
})

test('mistakes are marks that disagree with the answer', () => {
  const s = createSession(puzzle())
  setCell(s, 1, DOT); setCell(s, 4, HEDGE); setCell(s, 10, HEDGE); setCell(s, 3, DOT)
  assert.deepEqual(mistakes(s), [1, 4])
})

test('stars: 3 clean, 2 with hints, 1 once mistakes were shown', () => {
  assert.equal(starsFor(0, 0), 3); assert.equal(starsFor(2, 0), 2); assert.equal(starsFor(0, 1), 1); assert.equal(starsFor(5, 3), 1)
})

test('snapshot and restore; junk snapshots are ignored', () => {
  const s = createSession(puzzle())
  setCell(s, 1, HEDGE); setCell(s, 2, DOT); s.time = 12.34; s.hints = 2; s.checks = 1
  const snap = JSON.parse(JSON.stringify(snapshot(s)))
  const t = createSession(puzzle(), snap)
  assert.equal(t.cells[1], HEDGE); assert.equal(t.cells[2], DOT); assert.equal(t.time, 12.3); assert.equal(t.hints, 2); assert.equal(t.checks, 1)
  assert.equal(t.solved, false)
  for (const junk of [null, 5, 'x', {}, { cells: '012' }, { cells: 'x'.repeat(16) }, { cells: '3'.repeat(16) }, { cells: 12 }]) {
    const u = createSession(puzzle(), junk)
    assert.ok(u.cells.every((c) => c === EMPTY)); assert.equal(u.time, 0)
  }
  // a hedge saved on a lookout tile is dropped; silly numbers are clamped
  const v = createSession(puzzle(), { cells: '1' + '0'.repeat(15), time: -4, hints: NaN, checks: 1e9 })
  assert.equal(v.cells[0], EMPTY); assert.equal(v.time, 0); assert.equal(v.hints, 0); assert.equal(v.checks, 999)
  // a snapshot of the finished board comes back solved
  const done = createSession(puzzle(), { cells: Array.from(puzzle().sol, (x) => (x === H ? '1' : '0')).join(''), time: 60, hints: 0, checks: 0 })
  assert.equal(done.solved, true)
})
