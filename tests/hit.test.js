// Hit testing for taps and drags on the field (render.js exports pure helpers next to the drawing code).
import test from 'node:test'
import assert from 'node:assert/strict'
import { hitTile, hitTileNear, hitTileSticky, layoutBoard, tagGeom } from '../src/render.js'

const v = layoutBoard({ w: 9, h: 9 }, { x: 0, y: 0, w: 360, h: 360 }) // tile 38, board at x = y = 9

test('hitTile finds the tile under a point and misses outside the board', () => {
  assert.equal(v.tile, 38)
  assert.equal(hitTile(v, v.x + 1, v.y + 1), 0)
  assert.equal(hitTile(v, v.x + v.tile * 4.5, v.y + v.tile * 2.5), 2 * 9 + 4)
  assert.equal(hitTile(v, v.x - 1, v.y + 5), -1)
  assert.equal(hitTile(v, v.x + v.bw, v.y + 5), -1)
  assert.equal(hitTile(null, 10, 10), -1)
})

test('hitTile with an inset ignores the rim of a tile (finger wobble while painting)', () => {
  const t = v.tile
  assert.equal(hitTile(v, v.x + t * 1.05, v.y + t * 0.5, 0.18), -1) // just over the edge into tile 1
  assert.equal(hitTile(v, v.x + t * 1.3, v.y + t * 0.5, 0.18), 1) // well inside tile 1
  assert.equal(hitTile(v, v.x + t * 1.5, v.y + t * 0.95, 0.18), -1) // near the bottom rim
})

test('hitTileNear snaps taps just outside the frame to the edge tile, and no further', () => {
  const t = v.tile
  assert.equal(hitTileNear(v, v.x - t * 0.3, v.y + t * 0.5, 0.4), 0)
  assert.equal(hitTileNear(v, v.x + v.bw + t * 0.3, v.y + v.bh + t * 0.3, 0.4), 80)
  assert.equal(hitTileNear(v, v.x - t * 0.5, v.y + t * 0.5, 0.4), -1)
  assert.equal(hitTileNear(v, v.x + t * 3.5, v.y + t * 3.5, 0.4), hitTile(v, v.x + t * 3.5, v.y + t * 3.5))
})

test('hitTileSticky keeps a wobbling finger in its row and column until it is clearly over the line', () => {
  const t = v.tile, at = (fx, fy, last) => hitTileSticky(v, v.x + fx * t, v.y + fy * t, last, 0.22)
  assert.equal(at(1.5, 1.1, 0), 1) // painting row 0, finger dips just into row 1: stays in row 0
  assert.equal(at(1.5, 1.4, 0), 10) // clearly in row 1
  assert.equal(at(1.1, 0.5, 0), 0) // only just into column 1: still tile 0
  assert.equal(at(1.3, 0.5, 0), 1)
  assert.equal(at(0.95, 0.5, 1), 1) // coming back left, just over the line: still tile 1
  assert.equal(at(5.5, 5.5, 0), 5 * 9 + 5) // a jump far away is not held back
  assert.equal(at(-0.1, 0.5, 0), 0) // a hair off the board's edge: still the edge tile
  assert.equal(at(-0.5, 0.5, 0), -1) // clearly off the board
  assert.equal(at(2.5, 2.5, -1), 2 * 9 + 2) // no last tile: plain hit test
})

test('the "sees now" tag stays readable on a 9x9 phone field and inside its tile', () => {
  for (const t of [30, 34, 35, 38, 44, 55]) {
    const half = t * 0.42
    for (const sees of [3, 12]) {
      const g = tagGeom(t, half, sees)
      assert.ok(g.fs >= (sees > 9 ? 11 : 12), `font ${g.fs}px at tile ${t}`)
      // the tag may poke past the body but stays within a few px of its own tile
      assert.ok(g.bx + g.r <= t / 2 + 3.5 && -(g.by - g.r) <= t / 2 + 3.5, `tile ${t}`)
    }
  }
  const big = tagGeom(80, 80 * 0.42, 5) // big tiles keep the 1.0 look
  assert.equal(big.r, 16)
})
