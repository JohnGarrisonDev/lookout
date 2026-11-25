// Confetti: a small fixed pool of flat paper scraps.
import { C } from '../kit/kit.js'

const COLORS = [C.orange, C.yellow, C.mint, C.blue, C.pink, '#FFFDF8']
const MAX = 160

export function createConfetti() {
  const parts = Array.from({ length: MAX }, () => ({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, size: 8, color: COLORS[0], life: 0 }))
  let next = 0
  return {
    parts,
    burst(x, y, count, power = 1) {
      for (let k = 0; k < count; k++) {
        const p = parts[next]; next = (next + 1) % MAX
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = (120 + Math.random() * 260) * power
        p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp
        p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 14
        p.size = 6 + Math.random() * 7; p.color = COLORS[(Math.random() * COLORS.length) | 0]; p.life = 1.1 + Math.random() * 0.9
      }
    },
    update(dt) {
      let alive = 0
      for (let k = 0; k < MAX; k++) {
        const p = parts[k]
        if (p.life <= 0) continue
        p.life -= dt; p.vy += 620 * dt; p.vx *= 1 - 1.2 * dt
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt
        alive++
      }
      return alive
    },
    clear() { for (const p of parts) p.life = 0 },
  }
}
