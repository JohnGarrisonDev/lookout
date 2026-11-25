// Lookout entry point: app state, screen flow, input, frame loop, saving. Rules live in src/logic (pure, tested).
import { makeStore, wireChrome } from '../kit/kit.js'
import { dailyTalk, tellUs } from '../kit/talk.js'
import { H } from './logic/rules.js'
import { generate, BANDS, BAND_IDS, MIN_SIZE, MAX_SIZE } from './logic/generate.js'
import { hintFor } from './logic/solver.js'
import { createSession, setCell, beginStroke, endStroke, undo, redo, clearAll, cycle, canEdit, mistakes, starsFor, snapshot, EMPTY, HEDGE, DOT } from './logic/session.js'
import { CHAPTERS, LEVEL_COUNT, PER_CHAPTER, journeyLevel, levelLabel, isUnlocked } from './logic/levels.js'
import { DAILY, ARCHIVE_DAYS, dateKey, shiftDay, dayParts, dailyPuzzle, streakInfo, formatTime, shareText } from './logic/daily.js'
import { defaults, sanitize, recordJourney, recordDaily, pruneDailyProgress, totalStars, solvedCount } from './logic/save.js'
import { createRenderer, layoutBoard, hitTile, tileCentre, makeAnim } from './render.js'
import { createConfetti } from './fx.js'
import { createUI } from './ui.js'
import { snd } from './audio.js'

const stage = document.getElementById('stage'), canvas = document.getElementById('game'), uiRoot = document.getElementById('ui')
const store = makeStore('lookout', defaults())
{ const clean = sanitize(store.data); for (const k of Object.keys(store.data)) delete store.data[k]; Object.assign(store.data, clean) }
const save = store.data
const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
const R = createRenderer(canvas), confetti = createConfetti()
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const prettyDate = (key) => { const d = dayParts(key); return `${WEEK[d.weekday]} ${d.day} ${MONTHS[d.month]}` }
const TALK_BOARD = { s: 'small', m: 'medium', l: 'large' } // daily id -> board id in the studio API
const BAND_NOTES = {
  gentle: 'Counting and fencing in. A calm stroll.',
  medium: 'Long reaches, and keeping the field in one piece.',
  hard: 'Weigh every way a lookout could see its number.',
  fiendish: 'Needs what-if thinking: suppose a tile is a hedge and follow it to a dead end.',
}

const app = {
  mode: null, meta: null, session: null, anim: null, view: null,
  cursor: 0, cursorOn: false, focus: -1, hover: -1, pointer: null, drag: null, hint: null,
  celebrateAt: Infinity, cardAt: Infinity, celebrated: false, cardShown: false, result: null,
  chapter: 0, day: dateKey(), portrait: false, timeText: '', engaged: false, toldCheck: false,
}
const demo = { session: null, anim: null, view: null, nextAt: 0, doneAt: 0 }

// ------------------------------------------------------------------ screens

const actions = {
  title() { snd.back(); leaveBoard(); showTitle() },
  daily() { snd.click(); leaveBoard(); app.day = dateKey(); showDaily() },
  'daily-list'() { snd.back(); const d = app.meta && app.meta.date; leaveBoard(); app.day = d || dateKey(); showDaily() },
  day({ k }) { snd.click(); app.day = k || dateKey(); showDaily(true) },
  'daily-play'({ id }) { snd.click(); startDaily(app.session && app.mode === 'daily' ? app.meta.date : app.day, id) },
  journey() {
    snd.click()
    if (!solvedCount(save) && !save.progress.journey) return startJourney(0)
    app.chapter = Math.floor((save.progress.journey ? save.progress.journey.level : firstOpenLevel()) / PER_CHAPTER)
    showLevels()
  },
  levels() { snd.back(); if (app.mode === 'journey' && app.meta) app.chapter = Math.floor(app.meta.index / PER_CHAPTER); leaveBoard(); showLevels() },
  chapter({ d }) { snd.click(); app.chapter = Math.max(0, Math.min(CHAPTERS.length - 1, app.chapter + Number(d))); showLevels(true) },
  'chapter-go'({ c }) { snd.click(); app.chapter = Number(c); showLevels(true) },
  level({ i }) { snd.click(); startJourney(Number(i)) },
  free() { snd.click(); leaveBoard(); showFree() },
  size({ d }) { save.free.size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, save.free.size + Number(d))); snd.click(); store.save(); showFree(true) },
  band({ d }) { const k = Math.max(0, Math.min(BAND_IDS.length - 1, BAND_IDS.indexOf(save.free.band) + Number(d))); save.free.band = BAND_IDS[k]; snd.click(); store.save(); showFree(true) },
  'free-start'() { snd.click(); startFree({ size: save.free.size, band: save.free.band, seed: (Math.random() * 4294967296) >>> 0 }) },
  'free-resume'() { snd.click(); const p = save.progress.free; if (p) startFree(p.def, p.board) },
  menu() { if (app.session && !app.session.solved) { snd.click(); openPause() } },
  resume() { snd.click(); ui.closeModal() },
  restart() {
    const s = app.session
    if (!s || s.solved) return
    if (!s.cells.some((c) => c)) { ui.closeModal(); return }
    snd.click()
    ui.openConfirm({ title: 'Clear the field?', text: 'Every hedge and dot comes off. The clock keeps running, and Undo brings them back.', yes: 'Clear it', act: 'restart-yes' })
  },
  'restart-yes'() { ui.closeModal(); if (clearAll(app.session)) { snd.undo(); afterChange(null) } },
  undo() { doUndo() },
  redo() { doRedo() },
  hint() { doHint() },
  check() { doCheck() },
  mode() { save.settings.dotFirst = !save.settings.dotFirst; store.save(); snd.click(); syncTools(); ui.toast(save.settings.dotFirst ? 'Taps now place a dot first' : 'Taps now plant a hedge first', 1500) },
  timer() { toggleSetting('timer'); ui.setTimerVisible(save.settings.timer); relayout() },
  lines() { toggleSetting('lines') },
  next() {
    snd.click()
    const i = app.meta.index + 1
    if (i >= LEVEL_COUNT) { app.chapter = CHAPTERS.length - 1; leaveBoard(); showLevels(); ui.toast('That was the last one. Every lookout in the valley is happy!', 3400); return }
    startJourney(i)
  },
  replay() { snd.click(); save.progress.journey = null; startJourney(app.meta.index) },
  async copy(_, el) {
    const key = app.session && app.mode === 'daily' ? app.meta.date : app.day, rec = save.daily.history[key]
    if (!rec) return
    const ok = await copyText(shareText(key, rec))
    snd.copy()
    if (el) { el.textContent = ok ? 'Copied!' : 'Copy failed'; setTimeout(() => { if (el.isConnected) el.textContent = 'Copy result' }, 1600) }
  },
}
const ui = createUI(uiRoot, actions)

function toggleSetting(k) {
  save.settings[k] = !save.settings[k]; store.save(); snd.click()
  uiRoot.querySelector(`.modal [data-act="${k}"]`)?.setAttribute('aria-checked', String(save.settings[k]))
}
const firstOpenLevel = () => { for (let i = 0; i < LEVEL_COUNT; i++) if (!(save.journey.stars[i] | 0)) return i; return LEVEL_COUNT - 1 }
const dayPips = (key) => DAILY.map((d) => !!(save.daily.history[key] && save.daily.history[key][d.id]))
const hasMarks = (board) => !!board && (board.time > 0.5 || /[12]/.test(board.cells))

function showTitle(focus = true) {
  save.last = null; store.save()
  ui.closeModal(); ui.show('title'); relayout()
  const today = dateKey(), st = streakInfo(save.daily.history, today), done = dayPips(today).filter(Boolean).length
  const solved = solvedCount(save), streak = st.current ? ` · ${st.current}-day streak` : ''
  ui.setTitle({
    dailyPips: dayPips(today),
    daily: done === 3 ? `All three solved${streak}` : done ? `${done} of 3 solved today${streak}` : `Three new fields today${streak}`,
    journey: !solved ? `${LEVEL_COUNT} levels that teach the tricks` : solved >= LEVEL_COUNT ? `All ${LEVEL_COUNT} solved · ★ ${totalStars(save)} of ${LEVEL_COUNT * 3}` : `${solved} of ${LEVEL_COUNT} solved · ★ ${totalStars(save)}`,
    free: save.free.solved ? `${save.free.solved} ${save.free.solved === 1 ? 'field' : 'fields'} solved` : 'Any size, any difficulty',
  })
  if (focus) ui.focusFirst()
}

function showDaily(keepFocus = false) {
  save.last = null
  const today = dateKey(), oldest = shiftDay(today, -(ARCHIVE_DAYS - 1))
  if (app.day > today || app.day < oldest) app.day = today
  pruneDailyProgress(save, oldest); store.save()
  const key = app.day, rec = save.daily.history[key] || {}, st = streakInfo(save.daily.history, today)
  let next = true
  const cards = DAILY.map((d) => {
    const r = rec[d.id], prog = save.progress.daily[`${key}:${d.id}`]
    const state = r ? 'done' : hasMarks(prog) ? 'going' : 'new'
    const card = { id: d.id, letter: d.letter, label: d.label, meta: `${d.size}×${d.size} · ${BANDS[d.band].label}`, state, next: !r && next, status: r ? `${formatTime(r.t)}${r.h ? ` · 💡${r.h}` : ''}` : state === 'going' ? `Going · ${formatTime(prog.time)}` : 'Play' }
    if (!r) next = false
    return card
  })
  const days = []
  for (let k = ARCHIVE_DAYS - 1; k >= 0; k--) { const dk = shiftDay(today, -k), p = dayParts(dk); days.push({ key: dk, letter: WEEK[p.weekday][0], day: p.day, pips: dayPips(dk), sel: dk === key, today: dk === today }) }
  ui.closeModal()
  ui.setDaily({
    date: prettyDate(key), sub: key === today ? 'Today. Solve Small to keep your streak.' : 'From the archive. No streak credit.',
    streak: `Streak ${st.current} · best ${Math.max(st.best, save.daily.bestStreak)}`, cards, days, canCopy: Object.keys(rec).length > 0, isToday: key === today,
  })
  ui.show('daily'); relayout()
  if (!keepFocus) ui.focusFirst()
}

function showLevels(keepFocus = false) {
  save.last = null
  ui.closeModal()
  ui.setLevels({ chapter: app.chapter, starList: Array.from({ length: LEVEL_COUNT }, (_, i) => save.journey.stars[i] | 0), total: totalStars(save), resume: save.progress.journey ? save.progress.journey.level : -1 })
  ui.show('levels'); relayout()
  if (!keepFocus) ui.focusFirst()
}

function showFree(keepFocus = false) {
  save.last = null
  const fr = save.free, p = save.progress.free, k = BAND_IDS.indexOf(fr.band)
  ui.closeModal()
  ui.setFree({
    size: fr.size, bandLabel: BANDS[fr.band].label, solved: fr.solved, note: BAND_NOTES[fr.band],
    canSmaller: fr.size > MIN_SIZE, canBigger: fr.size < MAX_SIZE, canEasier: k > 0, canHarder: k < BAND_IDS.length - 1,
    resume: p ? `${p.def.size}×${p.def.size} ${BANDS[p.def.band].label}` : '',
  })
  ui.show('free'); relayout()
  if (!keepFocus) ui.focusFirst()
}

function startJourney(i) {
  if (!isUnlocked(save.journey.stars, i)) return
  const p = save.progress.journey, lvl = journeyLevel(i)
  startBoard('journey', lvl, { index: i }, p && p.level === i ? p.board : null)
}

function startDaily(date, id) {
  const d = DAILY.find((x) => x.id === id)
  if (!d) return
  const puzzle = dailyPuzzle(date, id), rec = save.daily.history[date] && save.daily.history[date][id]
  let board = save.progress.daily[`${date}:${id}`] || null
  if (rec) board = { cells: Array.from(puzzle.sol, (v) => (v === H ? '1' : '0')).join(''), time: rec.t, hints: rec.h, checks: rec.c } // solved earlier: show the finished field
  startBoard('daily', puzzle, { date, id, label: d.label }, board)
}

function startFree(def, board = null) { startBoard('free', generate(def), { def: { size: def.size, band: def.band, seed: def.seed >>> 0 } }, board) }

function startBoard(mode, puzzle, meta, board = null) {
  ui.closeModal(); confetti.clear()
  const now = performance.now()
  app.mode = mode; app.meta = meta
  app.session = createSession(puzzle, board)
  app.anim = makeAnim(puzzle.w * puzzle.h, now)
  app.cursor = 0; app.focus = -1; app.hover = -1; app.drag = null; app.hint = null
  app.celebrateAt = app.cardAt = Infinity; app.celebrated = app.cardShown = false; app.result = null; app.timeText = ''
  save.last = mode === 'daily' ? { mode, date: meta.date, id: meta.id } : { mode }
  const size = `${puzzle.w}×${puzzle.h}`, band = BANDS[puzzle.band] ? BANDS[puzzle.band].label : ''
  ui.setPlay({
    mode: mode === 'journey' ? `Journey ${levelLabel(meta.index)}` : mode === 'daily' ? `Daily · ${prettyDate(meta.date)}` : 'Free play',
    name: mode === 'journey' ? CHAPTERS[puzzle.chapter].name : mode === 'daily' ? `${meta.label} field` : `${size} field`,
    tip: puzzle.tip || '', chips: [{ text: size }, { text: band, cls: puzzle.band }],
  })
  ui.setTimerVisible(save.settings.timer)
  ui.show('play')
  syncHud(); syncTools(); relayout()
  if (app.session.solved) { // a finished daily, opened again
    const s = app.session
    app.result = { mode, time: s.time, hints: s.hints, checks: s.checks, again: true }
    app.celebrated = app.cardShown = true; app.anim.solvedAt = now - 5000
    showSolved(false)
  }
  persist()
}

/** Called when leaving the play screen for a menu. */
function leaveBoard() {
  if (app.session) { endDrag(); persist() }
  app.session = null; app.anim = null; app.view = null; app.hint = null
  confetti.clear(); ui.closeModal()
}

function openPause() {
  const items = [{ act: 'resume', label: 'Keep playing', primary: true }, { act: 'restart', label: 'Clear the field' }]
  if (app.mode === 'journey') items.push({ act: 'levels', label: 'Level select' })
  if (app.mode === 'daily') items.push({ act: 'daily-list', label: 'Daily fields' })
  if (app.mode === 'free') items.push({ act: 'free', label: 'Change size' })
  items.push({ act: 'title', label: 'Title screen' })
  ui.openPause({ title: 'Paused', timer: save.settings.timer, lines: save.settings.lines, items })
}

// ------------------------------------------------------------------ playing

function statusText() {
  const s = app.session, info = s.info
  if (s.solved) return ''
  if (info.touching) return 'Hedges can never touch side by side.'
  if (info.cutCount) return 'Part of the field is cut off. All open tiles must join up.'
  const f = app.hint ? -1 : focusLookout()
  if (f >= 0) return `This lookout sees ${info.sees[f]} and wants ${s.p.clues[f]}.`
  if (info.worried) return info.worried === 1 ? 'One lookout can no longer get its number.' : `${info.worried} lookouts can no longer get their number.`
  return ''
}
function syncHud() {
  const s = app.session
  if (!s) return
  ui.setHud({ happy: s.info.happy, lookouts: s.info.lookouts, hints: s.hints, status: statusText() })
  syncTime()
}
function syncTime() { const t = formatTime(app.session.time); if (t !== app.timeText) { app.timeText = t; ui.setTime(t) } }
const syncTools = () => { const s = app.session; ui.setTools({ dotFirst: save.settings.dotFirst, canUndo: !!s && s.undo.length > 0 && !s.solved, canRedo: !!s && s.redo.length > 0 && !s.solved, locked: !s || s.solved }) }
const focusLookout = () => { const s = app.session; if (!s) return -1; const k = app.hover >= 0 && s.p.clues[app.hover] > 0 && save.settings.lines ? app.hover : app.focus; return k >= 0 && s.p.clues[k] > 0 ? k : -1 }

/** Everything that follows a change to the board. `before` is the info from before the change (for sounds), or null. */
function afterChange(before) {
  const s = app.session, info = s.info, now = performance.now()
  if (app.hint || app.hintTip) { app.hint = null; app.hintTip = false; app.anim.hint = null; ui.setTip(s.p.tip || '') }
  app.anim.flags = null
  if (before) {
    let newBad = false, newWorry = false, newHappy = false
    for (let i = 0; i < s.g.n; i++) {
      if (info.bad[i] && !before.bad[i]) { app.anim.badAt[i] = now; newBad = true }
      if (info.mood[i] !== before.mood[i]) { app.anim.moodAt[i] = now; if (info.mood[i] === 1) newHappy = true; else if (info.mood[i] === 2) newWorry = true }
    }
    if (!s.solved) { if (newBad) snd.bad(); else if (newHappy) snd.happy(info.happy); else if (newWorry) snd.worry() }
  }
  syncHud(); syncTools()
  if (s.solved && !app.result) onSolved()
  if (!app.drag) persist()
}

/** Change one tile, with its pop and its sound. Returns true if it changed. */
function place(i, to) {
  const s = app.session, before = s.info
  if (!setCell(s, i, to)) return false
  app.anim.placedAt[i] = performance.now()
  if (to === HEDGE) snd.hedge(); else if (to === DOT) snd.dot(); else snd.clear()
  afterChange(before)
  return true
}

function doUndo() { replayStroke(undo, () => snd.undo()) }
function doRedo() { replayStroke(redo, () => snd.redo()) }
function replayStroke(fn, sound) {
  const s = app.session
  if (!s || s.solved || ui.modalOpen) return
  endDrag()
  const before = s.info, changed = fn(s)
  if (!changed) return
  const now = performance.now()
  for (const i of changed) app.anim.placedAt[i] = now
  sound(); afterChange(before)
}

function doHint() {
  const s = app.session
  if (!s || s.solved || ui.modalOpen) return
  endDrag()
  if (app.hint) { // second press: do the step that is on screen
    const st = app.hint
    beginStroke(s)
    const before = s.info, now = performance.now()
    for (let k = 0; k < st.cells.length; k++) if (setCell(s, st.cells[k], st.vals[k] === H ? HEDGE : DOT)) app.anim.placedAt[st.cells[k]] = now
    endStroke(s)
    if (st.vals.includes(H)) snd.hedge(); else snd.dot()
    afterChange(before)
    return
  }
  const h = hintFor(s.p, s.cells)
  if (h.kind === 'done') return
  if (h.kind === 'mistake') {
    const k = h.wrong.length
    snd.check(false)
    ui.setTip(`${k === 1 ? 'One of your marks does' : `${k} of your marks do`} not fit, so there is no safe next step yet. Check shows which.`, 'hint')
    app.hintTip = true
    relayout()
    return
  }
  s.hints++
  app.hint = h.step; app.anim.hint = { step: h.step, at: performance.now() }
  if (h.step.clue >= 0) app.focus = h.step.clue
  snd.hint()
  ui.setTip(h.text, 'hint')
  if (!app.toldHint) { app.toldHint = true; ui.toast('Press Hint again and it does the step for you.', 3200) }
  syncHud(); relayout(); persist()
}

function doCheck() {
  const s = app.session
  if (!s || s.solved || ui.modalOpen) return
  endDrag()
  const wrong = mistakes(s)
  s.checks++
  snd.check(!wrong.length)
  app.anim.flags = wrong.length ? { cells: wrong, at: performance.now() } : null
  const cost = app.mode === 'journey' && !app.toldCheck ? ' (Checking caps this level at 1 star.)' : ''
  app.toldCheck = true
  ui.toast((wrong.length ? `${wrong.length === 1 ? 'One mark does' : `${wrong.length} marks do`} not fit. Crossed out.` : 'No mistakes so far.') + cost, 3000)
  persist()
}

function onSolved() {
  const s = app.session, meta = app.meta, today = dateKey()
  endDrag()
  const res = { mode: app.mode, time: s.time, hints: s.hints, checks: s.checks, stars: starsFor(s.hints, s.checks) }
  if (app.mode === 'journey') { const r = recordJourney(save, meta.index, res.stars, s.time); res.newBest = r.newBest; res.prev = r.prev }
  else if (app.mode === 'daily') {
    recordDaily(save, meta.date, meta.id, res, today)
    save.daily.bestStreak = Math.max(save.daily.bestStreak, streakInfo(save.daily.history, today).best)
  } else save.free.solved++
  app.result = res
  app.focus = -1; app.cursorOn = false
  app.celebrateAt = performance.now() + 140
  app.cardAt = app.celebrateAt + (motion.matches ? 600 : 1900)
  ui.setTip('')
  persist()
}

function persist() {
  const s = app.session
  if (!s) { store.save(); return }
  const board = snapshot(s)
  if (app.mode === 'journey') save.progress.journey = s.solved ? null : { level: app.meta.index, board }
  else if (app.mode === 'daily') { const k = `${app.meta.date}:${app.meta.id}`; if (s.solved) delete save.progress.daily[k]; else save.progress.daily[k] = board }
  else save.progress.free = s.solved ? null : { def: app.meta.def, board }
  store.save()
}

function showSolved(animate) {
  const r = app.result, meta = app.meta, p = app.session.p
  app.cardShown = true
  const lines = [['Time', formatTime(r.time)], ['Hints', String(r.hints)]]
  const notes = [], buttons = []
  let daily = null, sub = '', heading = '', stars = 0
  if (r.mode === 'journey') {
    stars = r.stars
    sub = `Journey ${levelLabel(meta.index)} · ${CHAPTERS[p.chapter].name}`
    heading = stars === 3 ? 'Sharp eyes!' : stars === 2 ? 'All happy!' : 'Field sorted!'
    if (r.newBest) notes.push(`New best time! (was ${formatTime(r.prev)})`)
    if (r.checks) notes.push('You checked for mistakes, so this one gets 1 star. No help at all earns 3.')
    else if (r.hints) notes.push('You used a hint, so this one gets 2 stars. No help at all earns 3.')
    buttons.push({ act: 'next', label: meta.index + 1 >= LEVEL_COUNT ? 'Finish' : 'Next level', primary: true }, { act: 'replay', label: 'Replay' }, { act: 'levels', label: 'Levels' })
  } else if (r.mode === 'daily') {
    const today = dateKey(), st = streakInfo(save.daily.history, today), rec = save.daily.history[meta.date] || {}
    sub = `Daily · ${prettyDate(meta.date)} · ${meta.label}`
    heading = r.again ? `${meta.label} is done` : r.hints || r.checks ? 'Every lookout happy!' : 'Clean sweep!'
    daily = { streak: st.current, best: Math.max(st.best, save.daily.bestStreak), pips: DAILY.map((d) => !!rec[d.id]), label: meta.date === today ? 'today' : 'that day' }
    const nextUp = DAILY.find((d) => !rec[d.id])
    if (meta.date !== today) notes.push('An archive field: fun, but no streak credit.')
    else if (!nextUp) notes.push('All three done. New fields grow at midnight.')
    if (nextUp) buttons.push({ act: 'daily-play', id: nextUp.id, label: `Play ${nextUp.label}`, primary: true })
    buttons.push({ act: 'copy', label: 'Copy result', primary: !nextUp }, { act: 'daily-list', label: 'Daily fields' })
  } else {
    sub = `Free play · ${p.w}×${p.h} ${BANDS[p.band].label}`
    heading = r.hints || r.checks ? 'Every lookout happy!' : 'Clean sweep!'
    buttons.push({ act: 'free-start', label: 'New field', primary: true }, { act: 'free', label: 'Change size' }, { act: 'title', label: 'Title' })
  }
  // Anonymous "you beat N%" and difficulty vote: today's daily fields only (never archive days, the Journey or free play).
  const rec = r.mode === 'daily' && save.daily.history[meta.date] && save.daily.history[meta.date][meta.id]
  const talk = !!rec && !rec.late && meta.date === dateKey()
  const slot = ui.openSolved({ heading, sub, stars, animate: animate && !motion.matches, lines, notes, daily, buttons, talk })
  if (talk && slot) dailyTalk(slot, { game: 'lookout', key: meta.date, board: TALK_BOARD[meta.id], score: rec.t, label: `${meta.label} field`, compact: true })
  if (animate) for (let k = 0; k < stars; k++) setTimeout(() => snd.star(k), 380 + k * 260)
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through to the old way */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0;user-select:text;-webkit-user-select:text'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove()
    return ok
  } catch { return false }
}

// ------------------------------------------------------------------ pointer: tap to cycle, hold or right-click for a dot, drag to paint

const LONG_MS = 430
const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
const playing = () => ui.screen === 'play' && !ui.modalOpen && !!app.session && !app.session.solved && !!app.view

function endDrag() {
  const d = app.drag
  if (!d) return
  clearTimeout(d.timer); app.drag = null
  if (app.session) { endStroke(app.session); syncTools(); persist() }
}

canvas.addEventListener('pointerdown', (e) => {
  const { x, y } = pos(e)
  app.pointer = { x, y }
  if (!playing() || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2)) return
  if (app.drag) return // a second finger does nothing
  const s = app.session, i = hitTile(app.view, x, y)
  if (i < 0) return
  e.preventDefault()
  app.cursor = i; app.cursorOn = false
  if (s.p.clues[i] > 0) { app.focus = app.focus === i ? -1 : i; snd.peek(); syncHud(); return }
  const alt = e.button === 2 || e.shiftKey, from = s.cells[i]
  const to = alt ? (from === DOT ? EMPTY : DOT) : cycle(from, save.settings.dotFirst)
  beginStroke(s)
  const d = app.drag = { id: e.pointerId, from, to, last: i, x, y, moved: false, timer: 0 }
  try { canvas.setPointerCapture(e.pointerId) } catch { /* synthetic events have no live pointer */ }
  place(i, to)
  if (!alt && app.drag === d) {
    d.timer = setTimeout(() => { // long press: straight to a dot
      if (app.drag !== d || d.moved) return
      const dot = from === DOT ? EMPTY : DOT
      if (dot === d.to) return
      d.to = dot
      if (navigator.userActivation?.hasBeenActive) { try { navigator.vibrate?.(12) } catch { /* not allowed */ } }
      place(i, dot)
    }, LONG_MS)
  }
})
canvas.addEventListener('pointermove', (e) => {
  const { x, y } = pos(e), d = app.drag
  if (e.pointerType === 'mouse') { app.pointer = { x, y }; const hv = playing() ? hitTile(app.view, x, y) : -1; if (hv !== app.hover) { app.hover = hv; if (app.session) syncHud() } }
  if (!d || d.id !== e.pointerId || !playing()) return
  // walk the line from the last point so a fast swipe does not skip tiles
  const steps = Math.max(1, Math.ceil(Math.hypot(x - d.x, y - d.y) / (app.view.tile * 0.4)))
  for (let k = 1; k <= steps && app.drag === d; k++) {
    const j = hitTile(app.view, d.x + ((x - d.x) * k) / steps, d.y + ((y - d.y) * k) / steps)
    if (j < 0 || j === d.last) continue
    d.last = j; d.moved = true; clearTimeout(d.timer)
    if (canEdit(app.session, j) && app.session.cells[j] === d.from) place(j, d.to)
  }
  d.x = x; d.y = y
})
const lift = (e) => { if (app.drag && app.drag.id === e.pointerId) endDrag() }
canvas.addEventListener('pointerup', lift)
canvas.addEventListener('pointercancel', lift)
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { app.pointer = null; if (app.hover !== -1) { app.hover = -1; if (app.session) syncHud() } } })
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

document.addEventListener('pointerdown', (e) => { app.engaged = stage.contains(e.target) }, true)
document.addEventListener('focusin', (e) => { if (stage.contains(e.target)) app.engaged = true })

// ------------------------------------------------------------------ keyboard

function keyPlace(to) {
  const s = app.session
  if (!app.cursorOn) { app.cursorOn = true; return }
  if (s.p.clues[app.cursor] > 0) { app.focus = app.focus === app.cursor ? -1 : app.cursor; snd.peek(); syncHud(); return }
  place(app.cursor, to(s.cells[app.cursor]))
}

window.addEventListener('keydown', (e) => {
  if (!app.engaged) return
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  const onControl = e.target instanceof Element && !!e.target.closest('button, a, input, textarea, select')
  if (e.ctrlKey || e.metaKey || e.altKey) {
    if ((e.ctrlKey || e.metaKey) && ui.screen === 'play' && (k === 'z' || k === 'y')) { e.preventDefault(); if (k === 'y' || e.shiftKey) doRedo(); else doUndo() }
    return
  }
  if (k === 'Escape') {
    if (ui.modalOpen) { if (!app.session || !app.session.solved) { snd.back(); ui.closeModal() } }
    else if (ui.screen === 'play') actions.menu()
    else if (ui.screen !== 'title') actions.title()
    return
  }
  if (ui.screen !== 'play' || ui.modalOpen) { // menus: arrows walk the buttons
    const step = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 0
    if (!step) return
    const scope = ui.modalOpen ? uiRoot.querySelector('.modal') : uiRoot.querySelector(`[data-screen="${ui.screen}"]`)
    const list = [...scope.querySelectorAll('button:not([disabled]):not([hidden])')].filter((b) => b.offsetParent)
    if (!list.length) return
    e.preventDefault()
    list[(list.indexOf(document.activeElement) + step + list.length) % list.length].focus()
    return
  }
  const s = app.session
  if (!s || s.solved) return
  const dirs = { ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0] }
  if (dirs[k]) {
    e.preventDefault()
    if (app.cursorOn) {
      const w = s.p.w, x = Math.max(0, Math.min(w - 1, (app.cursor % w) + dirs[k][0])), y = Math.max(0, Math.min(s.p.h - 1, Math.floor(app.cursor / w) + dirs[k][1]))
      app.cursor = y * w + x
    }
    app.cursorOn = true
    syncHud()
    return
  }
  if (k === ' ' || k === 'Enter') {
    if (onControl) return // let the focused button do its thing
    e.preventDefault()
    if (!e.repeat) keyPlace((cur) => (e.shiftKey ? (cur === DOT ? EMPTY : DOT) : cycle(cur, save.settings.dotFirst)))
    return
  }
  if (e.repeat && k !== 'z' && k !== 'y') return
  if (k === 'x') keyPlace((cur) => (cur === HEDGE ? EMPTY : HEDGE))
  else if (k === 'd') keyPlace((cur) => (cur === DOT ? EMPTY : DOT))
  else if (k === 'z' && e.shiftKey) doRedo()
  else if (k === 'z' || k === 'u') doUndo()
  else if (k === 'y') doRedo()
  else if (k === 'h') doHint()
  else if (k === 'c') doCheck()
  else if (k === 'm') actions.mode()
})

// ------------------------------------------------------------------ layout + loop

function relayout() {
  const { w, h } = R.resize()
  app.portrait = w < h * 0.95
  stage.classList.toggle('portrait', app.portrait)
  const fs = app.portrait ? Math.min(w / 24, h / 38) : Math.min(w / 62, h / 38)
  uiRoot.style.fontSize = `${Math.max(12, Math.min(18, fs)).toFixed(2)}px`
  if (ui.screen === 'play' && app.session) app.view = layoutBoard(app.session.p, ui.slot('play', stage))
  if (ui.screen === 'title') { if (!demo.session) newDemo(); demo.view = layoutBoard(demo.session.p, ui.slot('title', stage), 64) }
}

function newDemo() {
  const now = performance.now()
  demo.session = createSession(generate({ size: 5, band: 'gentle', seed: (Math.random() * 4294967296) >>> 0 }))
  demo.anim = makeAnim(25, now)
  demo.view = layoutBoard(demo.session.p, ui.slot('title', stage), 64)
  demo.nextAt = now + 1100; demo.doneAt = 0
}

function updateDemo(now) {
  const s = demo.session
  if (!s) return
  if (s.solved) {
    if (!demo.doneAt) { demo.doneAt = now; demo.anim.solvedAt = now + 300; demo.anim.hint = null }
    else if (now - demo.doneAt > 4200) newDemo()
    return
  }
  if (now < demo.nextAt) return
  demo.nextAt = now + 650
  const h = hintFor(s.p, s.cells)
  if (h.kind !== 'step') return
  for (let k = 0; k < h.step.cells.length; k++) if (setCell(s, h.step.cells[k], h.step.vals[k] === H ? HEDGE : DOT)) demo.anim.placedAt[h.step.cells[k]] = now
  for (let i = 0; i < 25; i++) if (s.info.mood[i] === 1 && demo.anim.moodAt[i] < 0) demo.anim.moodAt[i] = now
}

let last = performance.now(), raf = 0, frames = 0
function frame() { raf = requestAnimationFrame(frame); update(performance.now()) }
function update(now) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (++frames % 45 === 0) { const r = canvas.getBoundingClientRect(); if (Math.round(r.width) !== R.size.w || Math.round(r.height) !== R.size.h) relayout() }
  R.background()
  const reduced = motion.matches
  if (ui.screen === 'title') {
    updateDemo(now)
    if (demo.session && demo.view) R.board(demo.view, demo.session, demo.anim, now, { cursor: -1, focus: -1, look: app.pointer, reduced })
    return
  }
  const s = app.session
  if (ui.screen !== 'play' || !s || !app.view) return
  if (!s.solved && !ui.modalOpen) { s.time += dt; syncTime() }
  if (app.anim.flags && now - app.anim.flags.at > 5000) app.anim.flags = null
  if (!app.celebrated && now >= app.celebrateAt) {
    app.celebrated = true; app.anim.solvedAt = now; snd.solve()
    if (!reduced) {
      let shown = 0
      for (let i = 0; i < s.g.n && shown < 10; i++) if (s.p.clues[i] > 0) { const c = tileCentre(app.view, i); confetti.burst(c.x, c.y, 14, 0.9); shown++ }
      confetti.burst(app.view.x + app.view.bw / 2, app.view.y + app.view.bh / 2, 40, 1.3)
    }
  }
  if (!app.cardShown && now >= app.cardAt) showSolved(true)
  R.board(app.view, s, app.anim, now, { cursor: app.cursorOn && !s.solved ? app.cursor : -1, focus: focusLookout(), look: app.pointer, reduced })
  if (confetti.update(dt)) R.confetti(confetti.parts)
}

document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(raf)
  if (document.hidden) { if (app.session) { endDrag(); persist() } } else { last = performance.now(); raf = requestAnimationFrame(frame) }
})
window.addEventListener('pagehide', () => { if (app.session) persist() })
setInterval(() => { if (app.session && !app.session.solved && !document.hidden && !app.drag) persist() }, 5000)
{ const ro = new ResizeObserver(relayout); ro.observe(stage); for (const el of uiRoot.querySelectorAll('[data-slot]')) ro.observe(el) }
document.addEventListener('fullscreenchange', relayout)
document.fonts?.ready.then(relayout)

// ------------------------------------------------------------------ boot

wireChrome({ stage })
tellUs(document.getElementById('tell-us'), { game: 'lookout', issueUrl: 'https://github.com/JohnGarrisonDev/lookout/issues/new?template=feedback.yml' })
{
  const today = dateKey(), p = save.progress, l = save.last
  if (l && l.mode === 'journey' && p.journey) startJourney(p.journey.level)
  else if (l && l.mode === 'daily' && l.date >= shiftDay(today, -(ARCHIVE_DAYS - 1)) && l.date <= today && p.daily[`${l.date}:${l.id}`]) startDaily(l.date, l.id)
  else if (l && l.mode === 'free' && p.free) startFree(p.free.def, p.free.board)
  // No auto-focus on a fresh page load: arrow keys should scroll the page until the player touches the game.
  if (ui.screen !== 'play') showTitle(false)
  else app.engaged = true // dropped straight back into a field: keys work at once
}
raf = requestAnimationFrame(frame)

// Debug hook for automated play-testing: only with ?debug in the URL.
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = {
    app, save, store, ui, actions, place, demo,
    /** Run one frame by hand (background tabs throttle requestAnimationFrame). */
    tick() { update(performance.now()) },
    /** Plant the answer's hedges through the real code path, leaving `leave` of them out. */
    solve(leave = 0) {
      const s = app.session
      if (!s) return 0
      const todo = []
      for (let i = 0; i < s.g.n; i++) if (s.p.sol[i] === H ? s.cells[i] !== HEDGE : s.cells[i] === HEDGE) todo.push(i)
      for (const i of todo.slice(0, Math.max(0, todo.length - leave))) place(i, s.p.sol[i] === H ? HEDGE : EMPTY)
      return todo.length
    },
    /** Client coordinates of the centre of tile i, for synthetic pointer events. */
    tilePoint(i) { const c = tileCentre(app.view, i), r = canvas.getBoundingClientRect(); return { x: r.left + c.x, y: r.top + c.y } },
    state() {
      const s = app.session
      return s ? { screen: ui.screen, mode: app.mode, meta: app.meta, cells: Array.from(s.cells).join(''), solved: s.solved, time: s.time, hints: s.hints, checks: s.checks, happy: s.info.happy, lookouts: s.info.lookouts, size: s.p.w, tile: app.view && app.view.tile, modal: ui.modalOpen, cursor: app.cursorOn ? app.cursor : -1 } : { screen: ui.screen }
    },
  }
}
