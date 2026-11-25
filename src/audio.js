// Sound effects, all synthesised through the kit's sfx (shared Oddvale mute state). Rate-limited so drags do not machine-gun.
import { sfx } from '../kit/kit.js'

const note = (semi, base = 330) => base * 2 ** (semi / 12)
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
const lastAt = {}
const ok = (name, gap) => { const t = performance.now(); if (t - (lastAt[name] || 0) < gap) return false; lastAt[name] = t; return true }

export const snd = {
  hedge() { if (!ok('hedge', 45)) return; sfx.noise({ dur: 0.07, vol: 0.12, freq: 1400, slide: 300 }); sfx.tone({ freq: 190, slide: 120, dur: 0.09, type: 'triangle', vol: 0.14 }) },
  dot() { if (ok('dot', 45)) sfx.tone({ freq: 760, slide: 900, dur: 0.04, type: 'sine', vol: 0.1 }) },
  clear() { if (ok('clear', 45)) sfx.tone({ freq: 420, slide: 300, dur: 0.05, type: 'triangle', vol: 0.08 }) },
  /** A lookout just became happy. k: how many are happy now (climbs a scale). */
  happy(k) { if (!ok('happy', 60)) return; const s = SCALE[Math.min(SCALE.length - 1, k)]; sfx.tone({ freq: note(s), dur: 0.16, type: 'triangle', vol: 0.14 }); sfx.tone({ freq: note(s + 12), dur: 0.08, type: 'sine', vol: 0.05 }) },
  worry() { if (ok('worry', 160)) sfx.tone({ freq: 230, slide: 170, dur: 0.13, type: 'sine', vol: 0.09 }) },
  bad() { if (!ok('bad', 200)) return; sfx.tone({ freq: 150, slide: 110, dur: 0.12, type: 'square', vol: 0.07 }); sfx.noise({ dur: 0.05, vol: 0.05, freq: 500 }) },
  peek() { if (ok('peek', 60)) sfx.tone({ freq: 560, slide: 700, dur: 0.05, type: 'sine', vol: 0.08 }) },
  undo() { sfx.tone({ freq: 420, slide: 280, dur: 0.08, type: 'triangle', vol: 0.11 }) },
  redo() { sfx.tone({ freq: 300, slide: 440, dur: 0.08, type: 'triangle', vol: 0.11 }) },
  hint() { sfx.tune([[660, 0.07], [880, 0.07], [660, 0.09]], { type: 'sine', vol: 0.12 }) },
  check(clean) { sfx.tune(clean ? [[520, 0.07], [780, 0.1]] : [[300, 0.09], [240, 0.12]], { type: 'triangle', vol: 0.12 }) },
  click() { sfx.tone({ freq: 520, slide: 640, dur: 0.045, type: 'triangle', vol: 0.09 }) },
  back() { sfx.tone({ freq: 480, slide: 360, dur: 0.05, type: 'triangle', vol: 0.08 }) },
  solve() {
    sfx.tune([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.14], [0, 0.04], [880, 0.1], [1047, 0.1], [1319, 0.3]], { type: 'triangle', vol: 0.17 })
    sfx.tune([[262, 0.2], [330, 0.2], [392, 0.14], [523, 0.4]], { type: 'sine', vol: 0.1 })
    sfx.noise({ dur: 0.5, vol: 0.05, freq: 6000, slide: 1500 })
  },
  star(k) { const s = [7, 12, 16][k] ?? 16; sfx.tone({ freq: note(s, 440), dur: 0.22, type: 'triangle', vol: 0.16 }); sfx.tone({ freq: note(s + 12, 440), dur: 0.1, type: 'sine', vol: 0.06 }) },
  copy() { sfx.tune([[700, 0.05], [1050, 0.08]], { type: 'sine', vol: 0.11 }) },
}
