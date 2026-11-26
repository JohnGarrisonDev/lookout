// Canvas drawing: the field, hedges, dots, lookouts, sight lines, hint rings, confetti. Flat Oddvale print style.
// Reads a session (logic) and an `anim` object (when things last changed); never changes game state.
import { C, FONT, fitCanvas } from '../kit/kit.js'
import { H, O } from './logic/rules.js'

const GROUND = '#d9f0c4', GROUND_2 = '#eaf3b4', TUFT = '#9fd6a0', TILE = '#fffaf0', TILE_LINE = '#e0d3b8'
const BUSH = '#23875c', BUSH_HI = '#48c48f', BUSH_DARK = '#17654a'
const BODY = { 0: C.yellow, 1: C.mint, 2: C.pink }

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const backOut = (t) => { t = clamp01(t); const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2 }

/** Animation state that sits on top of a session. */
export function makeAnim(n, now = 0) {
  return { placedAt: new Float64Array(n).fill(-1e9), badAt: new Float64Array(n).fill(-1e9), moodAt: new Float64Array(n).fill(-1e9), solvedAt: 0, hint: null, flags: null, born: now }
}

/** Fit a w x h board into a rectangle { x, y, w, h } (CSS pixels). */
export function layoutBoard(p, rect, maxTile = 100) {
  const pad = 5
  const tile = Math.max(8, Math.min(maxTile, Math.floor(Math.min((rect.w - pad * 2) / p.w, (rect.h - pad * 2) / p.h))))
  const bw = tile * p.w, bh = tile * p.h
  return { tile, w: p.w, h: p.h, bw, bh, x: Math.round(rect.x + (rect.w - bw) / 2), y: Math.round(rect.y + (rect.h - bh) / 2) }
}
/** The tile under (x, y), or -1. With `inset` (a fraction of a tile), points within that rim of a tile's edge miss. */
export function hitTile(v, x, y, inset = 0) {
  if (!v) return -1
  const fx = (x - v.x) / v.tile, fy = (y - v.y) / v.tile
  const cx = Math.floor(fx), cy = Math.floor(fy)
  if (cx < 0 || cy < 0 || cx >= v.w || cy >= v.h) return -1
  if (inset > 0) { const ux = fx - cx, uy = fy - cy; if (ux < inset || ux > 1 - inset || uy < inset || uy > 1 - inset) return -1 }
  return cy * v.w + cx
}
/**
 * Hit test for a finger that is painting from tile `last`: a point that has only just crossed into a neighbouring
 * row or column (less than `inset` of a tile past the line) still counts as the last row or column, so a wobbly
 * finger running along a row does not spill into the row next to it.
 */
export function hitTileSticky(v, x, y, last, inset = 0.2) {
  if (!v) return -1
  const fx = (x - v.x) / v.tile, fy = (y - v.y) / v.tile
  let cx = Math.floor(fx), cy = Math.floor(fy)
  if (last >= 0) {
    const lx = last % v.w, ly = Math.floor(last / v.w)
    if (cx === lx + 1 && fx < cx + inset) cx = lx; else if (cx === lx - 1 && fx > lx - inset) cx = lx
    if (cy === ly + 1 && fy < cy + inset) cy = ly; else if (cy === ly - 1 && fy > ly - inset) cy = ly
  }
  return cx < 0 || cy < 0 || cx >= v.w || cy >= v.h ? -1 : cy * v.w + cx
}
/** Like hitTile, but a point up to `slack` tiles outside the board snaps to the nearest edge tile. */
export function hitTileNear(v, x, y, slack = 0.4) {
  if (!v) return -1
  const fx = (x - v.x) / v.tile, fy = (y - v.y) / v.tile
  if (fx < -slack || fy < -slack || fx >= v.w + slack || fy >= v.h + slack) return -1
  const cx = Math.max(0, Math.min(v.w - 1, Math.floor(fx))), cy = Math.max(0, Math.min(v.h - 1, Math.floor(fy)))
  return cy * v.w + cx
}
export const tileCentre = (v, i) => ({ x: v.x + ((i % v.w) + 0.5) * v.tile, y: v.y + (Math.floor(i / v.w) + 0.5) * v.tile })

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}

export function createRenderer(canvas) {
  const g = canvas.getContext('2d')
  const size = { w: 1, h: 1, dpr: 1 }
  let tufts = []

  function resize() {
    Object.assign(size, fitCanvas(canvas))
    // scenery: a fixed scatter, so it does not jump around between frames
    tufts = []
    let a = 12345
    const rnd = () => { a = (Math.imul(a, 1103515245) + 12345) & 0x7fffffff; return a / 0x7fffffff }
    const count = Math.round((size.w * size.h) / 9000)
    for (let k = 0; k < count; k++) tufts.push({ x: rnd() * size.w, y: rnd() * size.h, s: 5 + rnd() * 5, kind: rnd() < 0.25 ? 1 : 0 })
    return size
  }

  function background() {
    g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    g.fillStyle = GROUND; g.fillRect(0, 0, size.w, size.h)
    g.fillStyle = GROUND_2
    g.beginPath(); g.ellipse(size.w * 0.18, size.h * 0.2, size.w * 0.3, size.h * 0.22, -0.3, 0, 7); g.fill()
    g.beginPath(); g.ellipse(size.w * 0.85, size.h * 0.85, size.w * 0.34, size.h * 0.25, -0.2, 0, 7); g.fill()
    g.lineCap = 'round'; g.lineWidth = 2
    for (const t of tufts) {
      if (t.kind) { g.fillStyle = '#fff6c9'; g.beginPath(); g.arc(t.x, t.y, t.s * 0.32, 0, 7); g.fill(); continue }
      g.strokeStyle = TUFT
      g.beginPath(); g.moveTo(t.x - t.s * 0.5, t.y - t.s * 0.6); g.lineTo(t.x, t.y); g.lineTo(t.x + t.s * 0.5, t.y - t.s * 0.7); g.stroke()
    }
  }

  function flower(x, y, r, s, color = C.pink) {
    if (s <= 0) return
    g.fillStyle = color; g.strokeStyle = C.ink; g.lineWidth = Math.max(1, r * 0.28)
    g.beginPath(); g.arc(x, y, r * s, 0, 7); g.fill(); g.stroke()
    g.fillStyle = C.yellow; g.beginPath(); g.arc(x, y, r * s * 0.38, 0, 7); g.fill()
  }

  function hedge(cx, cy, t, age, opts) {
    const s = opts.reduced ? 1 : backOut(age / 190)
    const half = t * 0.4 * s, lw = Math.max(1.5, t * 0.05)
    let ox = 0
    if (opts.shake > 0) ox = Math.sin(opts.shake * 46) * t * 0.06
    g.save(); g.translate(cx + ox, cy)
    g.fillStyle = C.ink; rr(g, -half + lw, -half + lw * 1.4, half * 2, half * 2, half * 0.62); g.fill()
    g.fillStyle = BUSH; g.strokeStyle = C.ink; g.lineWidth = lw
    rr(g, -half, -half, half * 2, half * 2, half * 0.62); g.fill(); g.stroke()
    // leafy scallops
    g.lineWidth = Math.max(1.2, t * 0.045); g.lineCap = 'round'
    g.strokeStyle = BUSH_HI
    g.beginPath(); g.arc(-half * 0.3, -half * 0.25, half * 0.3, Math.PI * 1.05, Math.PI * 1.8); g.stroke()
    g.beginPath(); g.arc(half * 0.4, half * 0.05, half * 0.26, Math.PI * 1.1, Math.PI * 1.85); g.stroke()
    g.strokeStyle = BUSH_DARK
    g.beginPath(); g.arc(-half * 0.1, half * 0.5, half * 0.3, Math.PI * 0.1, Math.PI * 0.8); g.stroke()
    const fr = t * 0.085
    const f = (k) => (opts.reduced ? 1 : backOut((age - 110 - k * 90) / 240))
    flower(half * 0.42, -half * 0.42, fr, f(0))
    flower(-half * 0.45, half * 0.3, fr * 0.85, f(1))
    if (opts.bloom > 0) { // solved: every hedge bursts into flower
      const b = (k) => (opts.reduced ? 1 : backOut((opts.bloom - k * 110) / 260))
      flower(-half * 0.4, -half * 0.5, fr * 0.9, b(0), '#fffdf8')
      flower(half * 0.5, half * 0.42, fr, b(1), C.orange)
      flower(half * 0.02, -half * 0.02, fr * 1.1, b(2))
    }
    if (opts.bad) { // touching another hedge: an orange "!" tag, not just a colour
      const r = t * 0.17, bx = half * 0.72, by = -half * 0.72
      g.fillStyle = C.orange; g.strokeStyle = C.ink; g.lineWidth = Math.max(1.2, t * 0.04)
      g.beginPath(); g.arc(bx, by, r, 0, 7); g.fill(); g.stroke()
      g.fillStyle = C.ink; g.font = `800 ${Math.round(r * 1.6)}px ${FONT.body}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('!', bx, by + r * 0.08)
    }
    g.restore()
  }

  function lookout(cx, cy, t, o) {
    const mood = o.mood, half = t * 0.42, lw = Math.max(1.5, t * 0.05)
    g.save(); g.translate(cx, cy - o.hop)
    if (o.pop !== 1) g.scale(o.pop, o.pop)
    // body
    g.fillStyle = C.ink; rr(g, -half + lw, -half + lw * 1.4, half * 2, half * 2, half * 0.42); g.fill()
    g.fillStyle = BODY[mood]; g.strokeStyle = C.ink; g.lineWidth = lw
    rr(g, -half, -half, half * 2, half * 2, half * 0.42); g.fill(); g.stroke()
    // mismatched eyes: one big orange one that looks around, one small dot
    const ex = -half * 0.5, ey = -half * 0.46, er = half * (mood === 1 ? 0.37 : 0.31)
    if (o.blink) { g.strokeStyle = C.ink; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); g.moveTo(ex - er, ey); g.lineTo(ex + er, ey); g.stroke() }
    else {
      g.fillStyle = mood === 0 ? C.orange : '#fffdf8'; g.strokeStyle = C.ink; g.lineWidth = Math.max(1.2, t * 0.035)
      g.beginPath(); g.arc(ex, ey, er, 0, 7); g.fill(); g.stroke()
      g.fillStyle = C.ink; g.beginPath(); g.arc(ex + o.lx * er * 0.42, ey + o.ly * er * 0.42, er * 0.45, 0, 7); g.fill()
    }
    g.fillStyle = C.ink; g.beginPath(); g.arc(half * 0.08, -half * 0.52, half * 0.11, 0, 7); g.fill()
    if (mood === 2) { // worried brow
      g.strokeStyle = C.ink; g.lineWidth = lw; g.lineCap = 'round'
      g.beginPath(); g.moveTo(ex - er * 1.1, ey - er * 1.5); g.lineTo(ex + er * 0.9, ey - er * 1.05); g.stroke()
    }
    // the number it wants
    g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    g.font = `800 ${Math.round(t * 0.46)}px ${FONT.display}`
    g.fillText(String(o.n), 0, half * 0.82)
    // corner tag: what it sees right now, or a tick once that is exactly right
    const r = Math.max(8, t * 0.2), bx = half - r * 0.62, by = -half + r * 0.62
    g.fillStyle = mood === 1 ? '#fffdf8' : mood === 2 ? C.orange : '#fffdf8'; g.strokeStyle = C.ink; g.lineWidth = Math.max(1.2, t * 0.035)
    g.beginPath(); g.arc(bx, by, r, 0, 7); g.fill(); g.stroke()
    if (mood === 1) {
      g.strokeStyle = C.ink; g.lineWidth = Math.max(1.6, r * 0.3); g.lineCap = 'round'; g.lineJoin = 'round'
      g.beginPath(); g.moveTo(bx - r * 0.45, by + r * 0.02); g.lineTo(bx - r * 0.1, by + r * 0.4); g.lineTo(bx + r * 0.48, by - r * 0.38); g.stroke()
    } else {
      g.fillStyle = C.ink; g.textBaseline = 'middle'
      g.font = `700 ${Math.round(r * (o.sees > 9 ? 1.02 : 1.25))}px ${FONT.body}`
      g.fillText(String(o.sees), bx, by + r * 0.08)
    }
    g.restore()
  }

  /**
   * Draw a board. opts: { cursor, focus (lookout whose sight lines show), look: {x, y} | null, reduced, plain (no tags: title demo) }
   */
  function board(v, s, anim, now, opts = {}) {
    const { tile: t, w, h } = v, p = s.p, info = s.info, n = w * h, reduced = !!opts.reduced
    const lw = Math.max(2, Math.round(t * 0.05))
    g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    // plate
    const rad = t * 0.22
    g.fillStyle = C.ink; rr(g, v.x - 3 + 5, v.y - 3 + 6, v.bw + 6, v.bh + 6, rad); g.fill()
    g.fillStyle = TILE; g.strokeStyle = C.ink; g.lineWidth = 2.5
    rr(g, v.x - 3, v.y - 3, v.bw + 6, v.bh + 6, rad); g.fill(); g.stroke()
    g.save(); rr(g, v.x - 2, v.y - 2, v.bw + 4, v.bh + 4, rad - 1); g.clip()
    // cut-off patches: hatched, so it is not colour alone
    if (info.cutCount) {
      for (let i = 0; i < n; i++) {
        if (!info.cut[i]) continue
        const x = v.x + (i % w) * t, y = v.y + Math.floor(i / w) * t
        g.fillStyle = '#ffd9c9'; g.fillRect(x, y, t, t)
        g.save(); g.beginPath(); g.rect(x, y, t, t); g.clip()
        g.strokeStyle = 'rgba(255, 91, 46, 0.55)'; g.lineWidth = 2
        for (let k = -t; k < t; k += 7) { g.beginPath(); g.moveTo(x + k, y + t); g.lineTo(x + k + t, y); g.stroke() }
        g.restore()
      }
    }
    // grid lines
    g.strokeStyle = TILE_LINE; g.lineWidth = 1.5
    g.beginPath()
    for (let x = 1; x < w; x++) { g.moveTo(v.x + x * t, v.y); g.lineTo(v.x + x * t, v.y + v.bh) }
    for (let y = 1; y < h; y++) { g.moveTo(v.x, v.y + y * t); g.lineTo(v.x + v.bw, v.y + y * t) }
    g.stroke()
    // sight lines of the lookout in focus
    const f = opts.focus
    if (f >= 0 && p.clues[f] > 0) {
      const c = tileCentre(v, f)
      g.strokeStyle = info.mood[f] === 1 ? 'rgba(47, 214, 163, 0.5)' : 'rgba(255, 201, 60, 0.6)'; g.lineWidth = t * 0.36; g.lineCap = 'round'
      for (let d = 0; d < 4; d++) {
        const ray = s.g.rays[f * 4 + d]
        let k = 0
        while (k < ray.length && s.cells[ray[k]] !== H) k++
        if (!k) continue
        const e = tileCentre(v, ray[k - 1])
        g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(e.x, e.y); g.stroke()
      }
    }
    g.restore()

    const solvedFor = anim.solvedAt ? now - anim.solvedAt : -1
    for (let i = 0; i < n; i++) {
      const cx = v.x + ((i % w) + 0.5) * t, cy = v.y + (Math.floor(i / w) + 0.5) * t, age = now - anim.placedAt[i]
      const wave = ((i % w) + Math.floor(i / w)) * 70
      if (p.clues[i] > 0) {
        let hop = 0
        if (solvedFor >= 0 && !reduced) { const k = (solvedFor - wave) / 420; if (k > 0 && k < 3) hop = Math.abs(Math.sin(k * Math.PI)) * t * 0.2 * (1 - k / 3.4) }
        const mAge = now - anim.moodAt[i]
        const pop = reduced || mAge > 260 ? 1 : 1 + Math.sin(clamp01(mAge / 260) * Math.PI) * 0.12
        let lx = 0.5, ly = 0.4
        if (opts.look) { const dx = opts.look.x - cx, dy = opts.look.y - cy, len = Math.hypot(dx, dy) || 1; lx = dx / len; ly = dy / len }
        const blink = !reduced && ((now + i * 613) % 4700) < 110
        lookout(cx, cy, t, { n: p.clues[i], sees: info.sees[i], mood: solvedFor >= 0 ? 1 : info.mood[i], hop, pop, lx, ly, blink })
      } else if (s.cells[i] === H) {
        hedge(cx, cy, t, age, { reduced, bad: info.bad[i], shake: !reduced && info.bad[i] && now - anim.badAt[i] < 420 ? (now - anim.badAt[i]) / 1000 : 0, bloom: solvedFor >= 0 ? Math.max(0.001, solvedFor - wave) : 0 })
      } else if (s.cells[i] === O) {
        const sc = reduced ? 1 : backOut(age / 160)
        g.fillStyle = C.ink; g.beginPath(); g.arc(cx, cy, Math.max(2.2, t * 0.085) * sc, 0, 7); g.fill()
      }
    }

    // hint: rings on the tiles it is about, a ghost of what goes there
    if (anim.hint) {
      const st = anim.hint.step, pulse = reduced ? 1 : 0.65 + 0.35 * Math.sin((now - anim.hint.at) / 170)
      const ring = (i, color, dash) => {
        const x = v.x + (i % w) * t, y = v.y + Math.floor(i / w) * t
        g.strokeStyle = color; g.lineWidth = lw + 1; g.setLineDash(dash ? [t * 0.16, t * 0.12] : [])
        rr(g, x + 2.5, y + 2.5, t - 5, t - 5, t * 0.2); g.stroke(); g.setLineDash([])
      }
      g.globalAlpha = 0.55 + 0.45 * pulse
      if (st.clue >= 0) ring(st.clue, C.blue, false)
      if (st.from >= 0) ring(st.from, C.blue, false)
      for (let k = 0; k < st.cells.length; k++) {
        const i = st.cells[k], c = tileCentre(v, i)
        ring(i, C.orange, true)
        if (st.vals[k] === H) { g.fillStyle = 'rgba(35, 135, 92, 0.45)'; rr(g, c.x - t * 0.2, c.y - t * 0.2, t * 0.4, t * 0.4, t * 0.12); g.fill() }
        else { g.fillStyle = 'rgba(23, 19, 31, 0.5)'; g.beginPath(); g.arc(c.x, c.y, t * 0.08, 0, 7); g.fill() }
      }
      g.globalAlpha = 1
    }
    // "show mistakes": an orange cross on each mark that does not fit
    if (anim.flags) {
      const age = now - anim.flags.at
      g.strokeStyle = C.orange; g.lineCap = 'round'
      for (const i of anim.flags.cells) {
        const c = tileCentre(v, i), r = t * 0.3 * (reduced ? 1 : backOut(age / 220))
        g.lineWidth = lw + 4; g.strokeStyle = C.ink
        g.beginPath(); g.moveTo(c.x - r, c.y - r); g.lineTo(c.x + r, c.y + r); g.moveTo(c.x + r, c.y - r); g.lineTo(c.x - r, c.y + r); g.stroke()
        g.lineWidth = lw + 1; g.strokeStyle = C.orange
        g.beginPath(); g.moveTo(c.x - r, c.y - r); g.lineTo(c.x + r, c.y + r); g.moveTo(c.x + r, c.y - r); g.lineTo(c.x - r, c.y + r); g.stroke()
      }
    }
    if (opts.cursor >= 0) {
      const i = opts.cursor, x = v.x + (i % w) * t, y = v.y + Math.floor(i / w) * t
      g.strokeStyle = '#fffdf8'; g.lineWidth = lw + 4; rr(g, x + 1, y + 1, t - 2, t - 2, t * 0.2); g.stroke()
      g.strokeStyle = C.blue; g.lineWidth = lw + 1; rr(g, x + 1, y + 1, t - 2, t - 2, t * 0.2); g.stroke()
    }
  }

  function confetti(parts) {
    for (const q of parts) {
      if (q.life <= 0) continue
      g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.globalAlpha = Math.min(1, q.life * 2)
      g.fillStyle = q.color; g.fillRect(-q.size / 2, -q.size / 3, q.size, q.size * 0.66)
      g.restore()
    }
    g.globalAlpha = 1
  }

  return { size, resize, background, board, confetti }
}
