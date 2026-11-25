// DOM overlays inside the stage: title, daily picker, level select, free-play setup, HUD, toolbar, modals, toasts.
// Pure view code: it renders what main.js tells it and reports clicks through `actions[name](dataset, element)`.
import { CHAPTERS, PER_CHAPTER, isUnlocked, levelLabel, RECIPES } from './logic/levels.js'

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
export const ICON = {
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  hint: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'),
  check: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/><path d="m8.5 11 2 2 3.5-4"/>'),
  hedge: svg('<rect x="4" y="5" width="16" height="15" rx="5" fill="currentColor" fill-opacity=".25"/><path d="M8 11a2.5 2.5 0 0 1 4-1M13 15a2 2 0 0 1 3-.6"/>'),
  dot: svg('<rect x="4" y="5" width="16" height="15" rx="4"/><circle cx="12" cy="12.5" r="2" fill="currentColor"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  minus: svg('<path d="M6 12h12"/>'),
  plus: svg('<path d="M6 12h12M12 6v12"/>'),
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const stars = (n, cls = '') => `<span class="stars ${cls}" aria-label="${n} of 3 stars">${[0, 1, 2].map((k) => `<i class="${k < n ? 'on' : ''}">★</i>`).join('')}</span>`
/** Three little pips, one per daily board: filled when solved, with a tick so it is not colour alone. */
export const pips = (list) => `<span class="pips" aria-label="${list.filter(Boolean).length} of ${list.length} solved">${list.map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('')}</span>`

export function createUI(root, actions) {
  root.innerHTML = `
  <section class="screen title" data-screen="title">
    <div class="title-head">
      <span class="eyebrow">An Oddvale deduction puzzle</span>
      <h2 class="wordmark">Look<em>out</em></h2>
      <p class="howto">Plant hedges until every lookout sees exactly its number.</p>
    </div>
    <div class="slot" data-slot="title"></div>
    <nav class="title-menu">
      <button class="bigbtn orange" data-act="daily"><b>Daily <span data-f="t-pips"></span></b><span data-f="t-daily"></span></button>
      <button class="bigbtn yellow" data-act="journey"><b>Journey</b><span data-f="t-journey"></span></button>
      <button class="bigbtn mint" data-act="free"><b>Free play</b><span data-f="t-free"></span></button>
    </nav>
  </section>

  <section class="screen daily" data-screen="daily" hidden>
    <header class="bar">
      <button class="iconbtn" data-act="title" aria-label="Back to title">${ICON.back}</button>
      <h2>Daily</h2>
      <span class="total" data-f="d-streak"></span>
    </header>
    <div class="daily-body">
      <div class="daily-main">
        <div class="day-head"><strong data-f="d-date"></strong><span class="blurb" data-f="d-sub"></span></div>
        <div class="daily-cards" data-f="d-cards"></div>
        <div class="row"><button class="btn small" data-act="copy" data-f="d-copy">Copy result</button><button class="btn small" data-act="day" data-k="" data-f="d-today" hidden>Back to today</button></div>
      </div>
      <div class="archive">
        <span class="eyebrow">Last 14 days</span>
        <div class="day-grid" data-f="d-days"></div>
        <p class="note">Past days are for fun. Only today's Small board feeds the streak.</p>
      </div>
    </div>
  </section>

  <section class="screen levels" data-screen="levels" hidden>
    <header class="bar">
      <button class="iconbtn" data-act="title" aria-label="Back to title">${ICON.back}</button>
      <h2>Journey</h2>
      <span class="total" data-f="l-total"></span>
    </header>
    <div class="chapter">
      <button class="iconbtn" data-act="chapter" data-d="-1" aria-label="Previous chapter">${ICON.back}</button>
      <div class="chapter-name"><span class="eyebrow" data-f="l-chno"></span><strong data-f="l-chname"></strong><span class="blurb" data-f="l-blurb"></span></div>
      <button class="iconbtn" data-act="chapter" data-d="1" aria-label="Next chapter">${ICON.next}</button>
    </div>
    <div class="level-grid" data-f="l-grid"></div>
    <div class="dots" data-f="l-dots"></div>
  </section>

  <section class="screen free" data-screen="free" hidden>
    <header class="bar">
      <button class="iconbtn" data-act="title" aria-label="Back to title">${ICON.back}</button>
      <h2>Free play</h2>
      <span class="total" data-f="f-total"></span>
    </header>
    <div class="free-body">
      <div class="stepper"><span class="lbl">Size</span><button class="iconbtn" data-act="size" data-d="-1" aria-label="Smaller">${ICON.minus}</button><b data-f="f-size">6×6</b><button class="iconbtn" data-act="size" data-d="1" aria-label="Bigger">${ICON.plus}</button></div>
      <div class="stepper"><span class="lbl">Level</span><button class="iconbtn" data-act="band" data-d="-1" aria-label="Easier">${ICON.minus}</button><b class="word" data-f="f-band">Medium</b><button class="iconbtn" data-act="band" data-d="1" aria-label="Harder">${ICON.plus}</button></div>
      <p class="note" data-f="f-note"></p>
      <div class="row">
        <button class="btn primary" data-act="free-start">New field</button>
        <button class="btn" data-act="free-resume" data-f="f-resume" hidden>Continue</button>
      </div>
    </div>
  </section>

  <section class="play" data-screen="play" hidden>
    <div class="hud">
      <div class="hud-top">
        <button class="iconbtn" data-act="menu" aria-label="Menu" title="Menu (Esc)">${ICON.menu}</button>
        <div class="lv"><div class="lv-top"><span class="eyebrow" data-f="p-mode"></span><span class="chips" data-f="p-chips"></span></div><strong data-f="p-name"></strong></div>
      </div>
      <div class="stats">
        <div class="stat"><b data-f="p-happy">0/0</b><span>happy</span></div>
        <div class="stat"><b data-f="p-hints">0</b><span>hints</span></div>
        <div class="stat time" data-f="p-timebox"><b data-f="p-time">0:00</b><span>time</span></div>
      </div>
      <p class="status" data-f="p-status" hidden></p>
      <p class="tip" data-f="p-tip" hidden></p>
    </div>
    <div class="slot" data-slot="play"></div>
    <div class="tools">
      <button class="tool" data-act="undo" title="Undo (Z)">${ICON.undo}<span>Undo</span></button>
      <button class="tool" data-act="redo" title="Redo (Y)">${ICON.redo}<span>Redo</span></button>
      <button class="tool" data-act="mode" aria-pressed="false" title="What a tap places first: hedge or dot (M)"><span class="ico" data-f="p-modeico">${ICON.hedge}</span><span data-f="p-modelbl">Hedge</span></button>
      <button class="tool" data-act="hint" title="Hint: explains the next step (H)">${ICON.hint}<span>Hint</span></button>
      <button class="tool" data-act="check" title="Check: shows marks that do not fit (C)">${ICON.check}<span>Check</span></button>
    </div>
  </section>

  <div class="modal" data-f="modal" hidden><div class="sheet" role="dialog" aria-modal="true" data-f="sheet"></div></div>
  <div class="toast" data-f="toast" role="status" aria-live="polite" hidden></div>`

  const f = (name) => root.querySelector(`[data-f="${name}"]`)
  const screens = [...root.querySelectorAll('[data-screen]')]
  let current = 'title', toastTimer = 0

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]')
    if (!el || el.disabled || !root.contains(el)) return
    // a mouse click leaves focus on the button; give it back so Space keeps working on the board
    if (e.detail > 0 && current === 'play' && !el.closest('.modal')) el.blur()
    actions[el.dataset.act]?.(el.dataset, el)
  })

  const ui = {
    get screen() { return current },
    show(name) { current = name; for (const s of screens) s.hidden = s.dataset.screen !== name },
    focusFirst() {
      const scope = !f('modal').hidden ? f('sheet') : screens.find((s) => !s.hidden)
      const el = scope?.querySelector('.btn.primary:not([hidden]), .bigbtn, .dcard.next, .dcard, .lvl.next, .lvl:not([disabled])')
      el?.focus({ preventScroll: true })
    },
    /** Rect of a board slot relative to the stage, in CSS px. */
    slot(name, stage) {
      const el = root.querySelector(`[data-slot="${name}"]`), a = el.getBoundingClientRect(), b = stage.getBoundingClientRect()
      return { x: a.left - b.left - stage.clientLeft, y: a.top - b.top - stage.clientTop, w: a.width, h: a.height }
    },

    setTitle({ journey, daily, free, dailyPips }) {
      f('t-journey').textContent = journey; f('t-daily').textContent = daily; f('t-free').textContent = free
      f('t-pips').innerHTML = pips(dailyPips)
    },

    /** d: { date, sub, streak, cards: [{ id, letter, label, meta, status, state: 'done' | 'going' | 'new', next }], days: [{ key, letter, day, pips, sel, today }], canCopy, isToday } */
    setDaily(d) {
      f('d-streak').textContent = d.streak
      f('d-date').textContent = d.date; f('d-sub').textContent = d.sub
      f('d-cards').innerHTML = d.cards.map((c) => `
        <button class="dcard ${c.state} ${c.next ? 'next' : ''}" data-act="daily-play" data-id="${c.id}" aria-label="${esc(c.label)}, ${esc(c.meta)}, ${esc(c.status)}">
          <b>${c.letter}</b><span class="dname">${esc(c.label)}</span><small>${esc(c.meta)}</small><em>${esc(c.status)}</em>
        </button>`).join('')
      f('d-days').innerHTML = d.days.map((x) => `
        <button class="dayb ${x.sel ? 'sel' : ''} ${x.today ? 'today' : ''}" data-act="day" data-k="${x.key}" aria-label="${x.key}${x.today ? ', today' : ''}" aria-pressed="${x.sel}">
          <span>${x.letter}</span><b>${x.day}</b>${pips(x.pips)}
        </button>`).join('')
      f('d-copy').disabled = !d.canCopy; f('d-copy').textContent = 'Copy result'
      f('d-today').hidden = d.isToday
    },

    setLevels({ chapter, starList, total, resume }) {
      const ch = CHAPTERS[chapter]
      f('l-total').innerHTML = `<i class="star">★</i> ${total} / ${CHAPTERS.length * PER_CHAPTER * 3}`
      f('l-chno').textContent = `Chapter ${chapter + 1} of ${CHAPTERS.length}`
      f('l-chname').textContent = ch.name
      f('l-blurb').textContent = ch.blurb
      const firstOpen = starList.findIndex((s, i) => !s && isUnlocked(starList, i))
      let html = ''
      for (let n = 0; n < PER_CHAPTER; n++) {
        const i = chapter * PER_CHAPTER + n, open = isUnlocked(starList, i), size = RECIPES[i].size, st = starList[i] | 0
        const cls = ['lvl', st ? 'done' : '', i === firstOpen ? 'next' : '', open ? '' : 'locked'].join(' ')
        html += `<button class="${cls}" data-act="level" data-i="${i}" ${open ? '' : 'disabled'} aria-label="Level ${levelLabel(i)}, ${size} by ${size}${open ? `, ${st} stars` : ', locked'}">`
          + (open ? `<b>${n + 1}</b>${stars(st)}<small>${size}×${size}${i === resume ? ' · …' : ''}</small>` : `${ICON.lock}<small>${size}×${size}</small>`) + '</button>'
      }
      f('l-grid').innerHTML = html
      f('l-dots').innerHTML = CHAPTERS.map((_, c) => `<button class="${c === chapter ? 'on' : ''}" data-act="chapter-go" data-c="${c}" aria-label="Chapter ${c + 1}"></button>`).join('')
      const [prev, next] = root.querySelectorAll('.chapter > .iconbtn')
      prev.disabled = chapter === 0; next.disabled = chapter === CHAPTERS.length - 1
    },

    setFree({ size, bandLabel, solved, canSmaller, canBigger, canEasier, canHarder, resume, note }) {
      f('f-size').textContent = `${size}×${size}`; f('f-band').textContent = bandLabel
      f('f-total').textContent = solved ? `${solved} solved` : ''
      const q = (act, d) => root.querySelector(`.free [data-act="${act}"][data-d="${d}"]`)
      q('size', -1).disabled = !canSmaller; q('size', 1).disabled = !canBigger; q('band', -1).disabled = !canEasier; q('band', 1).disabled = !canHarder
      f('f-note').textContent = note || ''
      const r = f('f-resume'); r.hidden = !resume; if (resume) r.textContent = `Continue ${resume}`
    },

    setPlay({ mode, name, tip, chips }) {
      f('p-mode').textContent = mode; f('p-name').textContent = name
      f('p-chips').innerHTML = (chips || []).map((c) => `<span class="tag ${c.cls || ''}">${esc(c.text)}</span>`).join('')
      ui.setTip(tip)
    },
    setTip(tip, kind = '') { const t = f('p-tip'); t.hidden = !tip; t.textContent = tip || ''; t.className = `tip ${kind}` },
    setHud({ happy, lookouts, hints, status }) {
      f('p-happy').textContent = `${happy}/${lookouts}`; f('p-hints').textContent = hints
      const s = f('p-status'); s.hidden = !status; s.textContent = status || ''
    },
    setTime(text) { f('p-time').textContent = text },
    setTimerVisible(on) { f('p-timebox').hidden = !on },
    setTools({ dotFirst, canUndo, canRedo, locked }) {
      const q = (a) => root.querySelector(`.tools [data-act="${a}"]`)
      q('mode').setAttribute('aria-pressed', String(!!dotFirst))
      f('p-modeico').innerHTML = dotFirst ? ICON.dot : ICON.hedge; f('p-modelbl').textContent = dotFirst ? 'Dot' : 'Hedge'
      q('undo').disabled = !canUndo; q('redo').disabled = !canRedo
      q('hint').disabled = !!locked; q('check').disabled = !!locked; q('mode').disabled = !!locked
    },

    get modalOpen() { return !f('modal').hidden },
    closeModal() { f('modal').hidden = true; f('sheet').innerHTML = ''; f('modal').className = 'modal' },
    openModal(html, cls = '') { f('sheet').innerHTML = html; f('modal').className = `modal ${cls}`; f('modal').hidden = false; ui.focusFirst() },

    openPause({ title, timer, lines, items }) {
      ui.openModal(`
        <h3>${esc(title)}</h3>
        <div class="col">${items.map((b) => `<button class="btn ${b.primary ? 'primary' : ''}" data-act="${b.act}">${esc(b.label)}</button>`).join('')}</div>
        <button class="switch" data-act="timer" role="switch" aria-checked="${timer}"><i></i><span><b>Show timer</b><small>Hide it for a calmer game.</small></span></button>
        <button class="switch" data-act="lines" role="switch" aria-checked="${lines}"><i></i><span><b>Sight lines</b><small>Show what a lookout sees when you point at it.</small></span></button>
        <p class="keys"><kbd>Space</kbd> cycle · <kbd>X</kbd> hedge · <kbd>D</kbd> dot · <kbd>Z</kbd> undo · <kbd>Y</kbd> redo · <kbd>H</kbd> hint</p>`, 'pause')
    },
    openConfirm({ title, text, yes, act }) {
      ui.openModal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row"><button class="btn primary" data-act="${act}">${esc(yes)}</button><button class="btn" data-act="resume">Keep going</button></div>`, 'confirm')
    },
    /** d: { heading, sub, stars (0 = none shown), animate, lines: [[label, value]], notes, daily: { streak, best, pips, letters }, buttons: [{ act, label, primary, id }] } */
    openSolved(d) {
      const daily = d.daily ? `
        <div class="streak"><div><b>${d.daily.streak}</b><span>day streak</span></div><div><b>${d.daily.best}</b><span>best</span></div><div><b class="pipbox">${pips(d.daily.pips)}</b><span>${esc(d.daily.label)}</span></div></div>` : ''
      ui.openModal(`
        <span class="eyebrow">${esc(d.sub)}</span>
        <h3>${esc(d.heading)}</h3>
        ${d.stars ? stars(d.stars, d.animate ? 'big pop' : 'big') : ''}
        <dl class="result">${d.lines.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${d.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}
        ${daily}
        <div class="row">${d.buttons.map((b) => `<button class="btn ${b.primary ? 'primary' : 'small'}" data-act="${b.act}" ${b.id ? `data-id="${b.id}"` : ''}>${esc(b.label)}</button>`).join('')}</div>
        ${d.talk ? '<div class="talk-slot" hidden></div>' : ''}`, 'solved')
      return f('sheet').querySelector('.talk-slot')
    },

    toast(text, ms = 2400) {
      const t = f('toast'); t.textContent = text; t.hidden = false
      t.classList.remove('in'); void t.offsetWidth; t.classList.add('in')
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true }, ms)
    },
  }
  return ui
}
