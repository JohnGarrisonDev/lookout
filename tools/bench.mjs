// Dev tool: how fast is the generator, and what does it produce? node tools/bench.mjs [count]
import { generate, BAND_IDS } from '../src/logic/generate.js'
import { encodeBoard } from '../src/logic/rules.js'
import { countSolutions } from '../src/logic/solver.js'
const count = Number(process.argv[2]) || 30
for (const band of BAND_IDS) for (const size of [4, 5, 6, 7, 8, 9]) {
  let ms = 0, worst = 0, off = 0, clues = 0, score = 0, attempts = 0, multi = 0
  const techs = {}
  for (let k = 0; k < count; k++) {
    const t = performance.now()
    const p = generate({ size, band, seed: 1000 + k * 7919 })
    const d = performance.now() - t
    ms += d; worst = Math.max(worst, d)
    if (!p.inBand) off++
    attempts += p.attempt + 1
    clues += p.clues.reduce((a, v) => a + (v > 0), 0); score += p.grade.score
    for (const [t2, c] of Object.entries(p.grade.counts)) techs[t2] = (techs[t2] || 0) + c
    if (k < 3 && countSolutions(p).count !== 1) multi++
    if (k === 0 && size === 6) console.log('   ', encodeBoard(p))
  }
  console.log(`${band.padEnd(9)} ${size}x${size}  avg ${(ms / count).toFixed(1)}ms  worst ${worst.toFixed(0)}ms  attempts ${(attempts / count).toFixed(1)}  offBand ${off}  clues ${(clues / count).toFixed(1)}  score ${(score / count).toFixed(0)}  multi ${multi}`, JSON.stringify(techs))
}
