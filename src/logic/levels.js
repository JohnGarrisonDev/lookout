// The Journey: 40 fixed boards in 4 chapters, each chapter teaching one more kind of deduction. Pure, no DOM.
//
// The boards themselves are stored as text in journey-data.js, built once by tools/build-journey.mjs from the
// recipes below. Stored boards never change when the generator does, so stars stay tied to the same puzzles.
// A recipe: { size, band, allow?: [technique...], need?: [technique...], hedges?, tip? }
import { JOURNEY } from './journey-data.js'
import { decodeBoard } from './rules.js'
import { solve, ALL } from './solver.js'

const G = ['neighbour', 'cap', 'full']

export const CHAPTERS = [
  {
    name: 'First Watch', blurb: 'Count the view, fence it in, keep hedges apart.',
    levels: [
      { size: 4, band: 'gentle', hedges: 2, need: ['cap'], tip: 'Each lookout wants to see exactly its number of tiles, its own included, looking up, down, left and right. Tap a tile to plant a hedge and block the view.' },
      { size: 4, band: 'gentle', hedges: 3, need: ['cap'], tip: 'Hedges never touch side by side. Tap a hedge again to turn it into a dot: your note that the tile stays open.' },
      { size: 4, band: 'gentle', hedges: 4, need: ['full'], tip: 'A lookout that can only just reach its number needs every one of those tiles open. All open tiles must stay joined up.' },
      { size: 4, band: 'gentle', tip: 'Stuck? The Hint button explains the next step. Press it again and it does the step for you.' },
      { size: 5, band: 'gentle', tip: 'Drag across tiles to plant or mark several in one go.' },
      { size: 5, band: 'gentle', tip: 'Tap a lookout to see exactly which tiles it can see.' },
      { size: 5, band: 'gentle' },
      { size: 5, band: 'gentle' },
      { size: 6, band: 'gentle' },
      { size: 6, band: 'gentle' },
    ],
  },
  {
    name: 'Long Views', blurb: 'Lookouts that must stretch, and tiles that would show too much.',
    levels: [
      { size: 5, band: 'medium', allow: [...G, 'reach'], need: ['reach'], tip: 'New trick. If a lookout cannot reach its number without looking one way, the first tiles that way must be open.' },
      { size: 5, band: 'medium', allow: [...G, 'reach'], need: ['reach'] },
      { size: 5, band: 'medium', allow: [...G, 'over'], need: ['over'], tip: 'Sometimes opening one more tile would join a long run and show too much. That tile must be a hedge.' },
      { size: 5, band: 'medium', allow: [...G, 'reach', 'over'], need: ['over'] },
      { size: 6, band: 'medium', allow: [...G, 'reach', 'over'], need: ['reach'] },
      { size: 6, band: 'medium', allow: [...G, 'reach', 'over'], need: ['over'] },
      { size: 6, band: 'medium', allow: [...G, 'reach', 'over'], need: ['reach', 'over'] },
      { size: 7, band: 'medium', allow: [...G, 'reach', 'over'], need: ['reach'] },
      { size: 7, band: 'medium', allow: [...G, 'reach', 'over'], need: ['over'] },
      { size: 7, band: 'medium', allow: [...G, 'reach', 'over'], need: ['reach', 'over'] },
    ],
  },
  {
    name: 'One Big Field', blurb: 'The open tiles must stay in one piece. Use it.',
    levels: [
      { size: 5, band: 'medium', need: ['connect'], tip: 'All open tiles must stay joined. If a hedge would fence part of the field off, that tile has to be open.' },
      { size: 5, band: 'medium', need: ['connect'] },
      { size: 6, band: 'medium', need: ['connect'] },
      { size: 6, band: 'medium', need: ['connect', 'reach'] },
      { size: 6, band: 'medium', need: ['connect', 'over'] },
      { size: 7, band: 'medium', need: ['connect'] },
      { size: 7, band: 'medium', need: ['connect', 'reach'] },
      { size: 7, band: 'medium', need: ['connect', 'over'] },
      { size: 8, band: 'medium', need: ['connect'] },
      { size: 8, band: 'medium', need: ['connect', 'reach', 'over'] },
    ],
  },
  {
    name: 'Head Gardener', blurb: 'Weigh every way a lookout could see its number.',
    levels: [
      { size: 5, band: 'hard', need: ['combo'], tip: 'No single rule cracks this one. Pick a lookout and try every way it could see its number: some tiles come out the same each time.' },
      { size: 6, band: 'hard', need: ['combo'] },
      { size: 6, band: 'hard', need: ['combo', 'connect'] },
      { size: 7, band: 'hard', need: ['combo'] },
      { size: 7, band: 'hard', need: ['combo', 'over'] },
      { size: 7, band: 'hard', need: ['combo', 'connect'] },
      { size: 8, band: 'hard', need: ['combo'] },
      { size: 8, band: 'hard', need: ['combo', 'connect'] },
      { size: 9, band: 'hard', need: ['combo'] },
      { size: 9, band: 'hard', need: ['combo', 'connect'] },
    ],
  },
]
export const PER_CHAPTER = 10
export const RECIPES = CHAPTERS.flatMap((c) => c.levels)
export const LEVEL_COUNT = RECIPES.length

/** "2-7" for level index 16. */
export const levelLabel = (i) => `${Math.floor(i / PER_CHAPTER) + 1}-${(i % PER_CHAPTER) + 1}`

/** Level i as a puzzle: { index, chapter, w, h, clues, sol, grade, tip, band }. */
export function journeyLevel(i) {
  const p = decodeBoard(JOURNEY[i]), r = RECIPES[i]
  return { ...p, index: i, chapter: Math.floor(i / PER_CHAPTER), tip: r.tip || '', band: r.band, grade: solve(p, ALL) }
}

/** A level is open once the one before it is solved; two unsolved levels past that are open too, so nobody gets stuck. */
export function isUnlocked(stars, i) {
  let firstOpen = 0
  while (firstOpen < LEVEL_COUNT && (stars[firstOpen] | 0) > 0) firstOpen++
  return i <= firstOpen + 2
}
