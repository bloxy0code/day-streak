(function () {
  'use strict';

  const STORAGE_KEY = 'dayStreakTracker.v1';
  const MIN_YEAR = 1900;
  const MAX_YEAR = 2100;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MOODS = [
    { id: 'amazing', emoji: '🤩', label: 'Amazing' },
    { id: 'good', emoji: '😊', label: 'Good' },
    { id: 'okay', emoji: '😐', label: 'Okay' },
    { id: 'bad', emoji: '😔', label: 'Bad' },
    { id: 'tough', emoji: '😫', label: 'Tough' }
  ];

  const el = {
    currentStreak: document.getElementById('current-streak'),
    longestStreak: document.getElementById('longest-streak'),
    fireMsg: document.getElementById('fire-msg'),
    weekStrip: document.getElementById('week-strip'),
    prevBtn: document.getElementById('prev-month'),
    nextBtn: document.getElementById('next-month'),
    todayBtn: document.getElementById('today-btn'),
    monthSelect: document.getElementById('month-select'),
    yearInput: document.getElementById('year-input'),
    grid: document.getElementById('calendar-grid'),
    progressTrack: document.getElementById('progress-track'),
    progressFill: document.getElementById('progress-fill'),
    progressPct: document.getElementById('progress-pct'),
    progressCount: document.getElementById('progress-count'),
    dialog: document.getElementById('mood-dialog'),
    moodDate: document.getElementById('mood-date'),
    moodOptions: document.getElementById('mood-options'),
    moodCancel: document.getElementById('mood-cancel'),
    toast: document.getElementById('toast')
  };

  // ---------- Date helpers (local calendar dates, no timezone drift) ----------
  const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const pad = (n) => String(n).padStart(2, '0');
  const makeKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const parseKey = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const keyFromDate = (dt) => makeKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const todayDate = () => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  };
  const todayKey = () => keyFromDate(todayDate());
  const addDays = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  // Monday = 0 ... Sunday = 6
  const mondayIndex = (dt) => (dt.getDay() + 6) % 7;
  const monthStartIndex = (y, m) => mondayIndex(new Date(y, m, 1));
  const moodById = (id) => MOODS.find((m) => m.id === id);

  function formatLong(key) {
    const dt = parseKey(key);
    return `${WEEKDAYS_LONG[mondayIndex(dt)]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
  }

  // ---------- State and storage ----------
  function loadState() {
    const empty = { days: {}, longest: 0 };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return empty;
      const parsed = JSON.parse(raw);
      const source = parsed && typeof parsed.days === 'object' && parsed.days !== null ? parsed.days : {};
      const days = {};
      Object.keys(source).forEach((key) => {
        const entry = source[key];
        const validKey = KEY_RE.test(key) && keyFromDate(parseKey(key)) === key;
        if (validKey && entry && moodById(entry.mood)) {
          days[key] = {
            mood: entry.mood,
            completedAt: typeof entry.completedAt === 'string' ? entry.completedAt : new Date().toISOString()
          };
        }
      });
      const longest = parsed && Number.isInteger(parsed.longest) && parsed.longest > 0 ? parsed.longest : 0;
      return { days, longest };
    } catch (err) {
      return empty;
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      showToast('Browser storage is unavailable, so progress may not be saved.');
    }
  }

  const isDone = (key) => Object.prototype.hasOwnProperty.call(state.days, key);

  // ---------- Streak calculations ----------
  function currentStreak() {
    const today = todayDate();
    let cursor = isDone(keyFromDate(today)) ? today : addDays(today, -1);
    let count = 0;
    while (isDone(keyFromDate(cursor))) {
      count += 1;
      cursor = addDays(cursor, -1);
    }
    return count;
  }

  function longestRun() {
    const keys = Object.keys(state.days).sort(); // YYYY-MM-DD sorts chronologically
    let best = 0;
    let run = 0;
    let prevKey = null;
    keys.forEach((key) => {
      const consecutive = prevKey !== null && keyFromDate(addDays(parseKey(prevKey), 1)) === key;
      run = consecutive ? run + 1 : 1;
      if (run > best) best = run;
      prevKey = key;
    });
    return best;
  }

  // ---------- Completion (one-way, locked) ----------
  function completeDate(key, moodId) {
    if (!KEY_RE.test(key) || key > todayKey()) return false; // future dates blocked
    if (isDone(key)) return false;                            // already locked
    if (!moodById(moodId)) return false;
    state.days[key] = { mood: moodId, completedAt: new Date().toISOString() };
    state.longest = Math.max(state.longest, longestRun());
    saveState();
    return true;
  }

  // ---------- View state ----------
  const now = todayDate();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();
  let pendingKey = null;
  let lastCompletedKey = null;

  function describeDay(key) {
    const parts = [formatLong(key)];
    if (key === todayKey()) parts.push('today');
    if (isDone(key)) parts.push(`completed, mood ${moodById(state.days[key].mood).label}, locked`);
    else if (key > todayKey()) parts.push('future date, unavailable');
    else parts.push('not completed');
    return parts.join(', ');
  }

  // ---------- Rendering ----------
  function renderHero() {
    const cur = currentStreak();
    const best = Math.max(state.longest, longestRun());
    if (best !== state.longest) {
      state.longest = best;
      saveState();
    }
    el.currentStreak.textContent = String(cur);
    el.longestStreak.textContent = String(best);
    el.fireMsg.textContent = cur >= 3 ? "You're on fire!" : cur > 0 ? 'Keep the flame alive!' : 'Start your streak today!';
  }

  function renderWeek() {
    const today = todayDate();
    const tKey = keyFromDate(today);
    const monday = addDays(today, -mondayIndex(today));
    const frag = document.createDocumentFragment();

    for (let i = 0; i < 7; i++) {
      const dt = addDays(monday, i);
      const key = keyFromDate(dt);
      const done = isDone(key);
      const future = key > tKey;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'week-day' + (done ? ' done' : '') + (key === tKey ? ' today' : '') + (future ? ' future' : '');
      btn.dataset.key = key;
      btn.setAttribute('aria-disabled', String(done || future));
      btn.setAttribute('aria-label', describeDay(key));

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = WEEKDAYS_SHORT[i];

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.setAttribute('aria-hidden', 'true');

      btn.append(label, dot);
      frag.appendChild(btn);
    }
    el.weekStrip.replaceChildren(frag);
  }

  function renderCalendar() {
    const total = daysInMonth(viewYear, viewMonth);
    const offset = monthStartIndex(viewYear, viewMonth);
    const tKey = todayKey();
    const frag = document.createDocumentFragment();

    for (let i = 0; i < offset; i++) {
      const spacer = document.createElement('span');
      spacer.className = 'day-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      frag.appendChild(spacer);
    }

    for (let d = 1; d <= total; d++) {
      const key = makeKey(viewYear, viewMonth, d);
      const done = isDone(key);
      const future = key > tKey;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.key = key;
      btn.className = 'day ' + (done ? 'completed' : future ? 'future' : 'open') +
        (key === tKey ? ' today' : '') +
        (key === lastCompletedKey ? ' just-completed' : '');
      btn.setAttribute('aria-disabled', String(done || future));
      btn.setAttribute('aria-label', `${d} ${MONTHS[viewMonth]} ${viewYear}: ${describeDay(key)}`);

      const num = document.createElement('span');
      num.className = 'day-num';
      num.textContent = String(d);
      btn.appendChild(num);

      if (done) {
        const mood = moodById(state.days[key].mood);
        const emoji = document.createElement('span');
        emoji.className = 'day-mood';
        emoji.setAttribute('aria-hidden', 'true');
        emoji.textContent = mood.emoji;
        btn.appendChild(emoji);
      }
      frag.appendChild(btn);
    }

    el.grid.replaceChildren(frag);
    lastCompletedKey = null;
  }

  function renderProgress() {
    const total = daysInMonth(viewYear, viewMonth);
    let done = 0;
    for (let d = 1; d <= total; d++) {
      if (isDone(makeKey(viewYear, viewMonth, d))) done++;
    }
    const pct = total ? (done / total) * 100 : 0;
    el.progressFill.style.width = pct.toFixed(2) + '%';
    el.progressPct.textContent = Math.round(pct) + '%';
    el.progressTrack.setAttribute('aria-valuenow', String(Math.round(pct)));
    el.progressCount.textContent = `${done} / ${total} days completed in ${MONTHS[viewMonth]} ${viewYear}`;
  }

  function renderAll() {
    renderHero();
    renderWeek();
    renderCalendar();
    renderProgress();
  }

  // ---------- Interaction ----------
  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => el.toast.classList.remove('show'), 2400);
  }

  function openMoodDialog(key) {
    pendingKey = key;
    el.moodDate.textContent = formatLong(key);
    el.dialog.showModal();
  }

  function activateDay(key) {
    if (key > todayKey()) {
      showToast('Future dates cannot be completed yet.');
      return;
    }
    if (isDone(key)) {
      showToast('This day is already completed and locked.');
      return;
    }
    openMoodDialog(key);
  }

  function setView(year, month) {
    viewYear = year;
    viewMonth = month;
    el.monthSelect.value = String(month);
    el.yearInput.value = String(year);
    renderAll();
  }

  function navigate(delta) {
    const dt = new Date(viewYear, viewMonth + delta, 1);
    const y = dt.getFullYear();
    if (y < MIN_YEAR || y > MAX_YEAR) return;
    setView(y, dt.getMonth());
  }

  // ---------- Event listeners ----------
  el.grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button.day');
    if (btn) activateDay(btn.dataset.key);
  });

  el.weekStrip.addEventListener('click', (e) => {
    const btn = e.target.closest('button.week-day');
    if (btn) activateDay(btn.dataset.key);
  });

  el.moodOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mood]');
    if (!btn || !pendingKey) return;
    const key = pendingKey;
    const moodId = btn.dataset.mood;
    pendingKey = null;
    el.dialog.close();

    if (completeDate(key, moodId)) {
      lastCompletedKey = key;
      renderAll();
      showToast(`Saved as ${moodById(moodId).label} on ${formatLong(key)}. Locked in!`);
    }
  });

  el.dialog.addEventListener('close', () => { pendingKey = null; });
  el.moodCancel.addEventListener('click', () => el.dialog.close());
  el.dialog.addEventListener('click', (e) => {
    if (e.target === el.dialog) el.dialog.close(); // click on backdrop
  });

  el.prevBtn.addEventListener('click', () => navigate(-1));
  el.nextBtn.addEventListener('click', () => navigate(1));
  el.todayBtn.addEventListener('click', () => {
    const t = todayDate();
    setView(t.getFullYear(), t.getMonth());
  });
  el.monthSelect.addEventListener('change', () => setView(viewYear, Number(el.monthSelect.value)));
  el.yearInput.addEventListener('change', () => {
    const y = Number(el.yearInput.value);
    if (Number.isInteger(y) && y >= MIN_YEAR && y <= MAX_YEAR) {
      setView(y, viewMonth);
    } else {
      el.yearInput.value = String(viewYear);
    }
  });

  // Refresh "today" highlights if the app stays open past midnight
  let lastTodayKey = todayKey();
  setInterval(() => {
    const k = todayKey();
    if (k !== lastTodayKey) {
      lastTodayKey = k;
      renderAll();
    }
  }, 60000);

  // ---------- Init ----------
  MONTHS.forEach((name, i) => el.monthSelect.add(new Option(name, String(i))));
  el.yearInput.min = String(MIN_YEAR);
  el.yearInput.max = String(MAX_YEAR);
  setView(viewYear, viewMonth);
})();
