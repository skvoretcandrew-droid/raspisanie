/* Основная логика приложения. Всё время берётся только с устройства. */

const LESSON_TIMES = {
  1: { start: "09:00", end: "10:35" },
  2: { start: "10:50", end: "12:25" },
  3: { start: "12:40", end: "14:15" },
  4: { start: "15:15", end: "16:50" },
};

const DEFAULT_PREFERENCES = {
  theme: "system",
  showRooms: true,
  dateFormat: "long",
};

const app = document.querySelector("#app");
const navItems = [...document.querySelectorAll(".nav-item")];
let activeView = "today";
let selectedDate = toDateKey(new Date());
let allWeekAnchor = startOfWeek(new Date());
let subjectQuery = "";
let deferredInstallPrompt = null;
let preferences = loadPreferences();

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(date, amount) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfWeek(date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function currentMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function withTiming(lessonItem, date) {
  const time = LESSON_TIMES[lessonItem.number];
  return { ...lessonItem, ...time, date: new Date(date) };
}

/** Возвращает массив занятий для конкретной локальной даты. */
function getScheduleForDate(date) {
  return SCHEDULE[toDateKey(date)] || [];
}

/** Возвращает текущую пару или null. */
function getCurrentLesson(date = new Date()) {
  const nowMinutes = currentMinutes(date);
  const item = getScheduleForDate(date).find((entry) => {
    const time = LESSON_TIMES[entry.number];
    return nowMinutes >= timeToMinutes(time.start) && nowMinutes < timeToMinutes(time.end);
  });
  return item ? withTiming(item, date) : null;
}

/** Возвращает ближайшую будущую пару вместе с её датой или null. */
function getNextLesson(date = new Date()) {
  const todayKey = toDateKey(date);
  const nowMinutes = currentMinutes(date);
  const keys = Object.keys(SCHEDULE).sort();

  for (const key of keys) {
    if (key < todayKey) continue;
    const lessonDate = fromDateKey(key);
    const lessons = SCHEDULE[key] || [];
    for (const entry of lessons) {
      const isLaterToday = key !== todayKey || timeToMinutes(LESSON_TIMES[entry.number].start) > nowMinutes;
      if (isLaterToday) return withTiming(entry, lessonDate);
    }
  }
  return null;
}

/** Возвращает понедельник–субботу недели, в которую входит дата. */
function getCurrentWeek(date = new Date()) {
  const monday = startOfWeek(date);
  return Array.from({ length: 6 }, (_, index) => {
    const day = addDays(monday, index);
    return { date: day, lessons: getScheduleForDate(day) };
  });
}

// Оставляем функции доступными для консоли и будущих локальных расширений.
Object.assign(window, { getScheduleForDate, getCurrentLesson, getNextLesson, getCurrentWeek });

function loadPreferences() {
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem("schedule-preferences") || "{}") };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function savePreferences(nextPreferences) {
  preferences = { ...preferences, ...nextPreferences };
  localStorage.setItem("schedule-preferences", JSON.stringify(preferences));
  applyTheme();
}

function applyTheme() {
  document.documentElement.dataset.theme = preferences.theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const dark = preferences.theme === "dark" ||
    (preferences.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  themeColor.setAttribute("content", dark ? "#0c1020" : "#4058e8");
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function formatDate(date, style = preferences.dateFormat) {
  const options = style === "short"
    ? { day: "numeric", month: "2-digit", year: "numeric" }
    : { weekday: "long", day: "numeric", month: "long" };
  const text = new Intl.DateTimeFormat("ru-RU", options).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatWeekRange(monday) {
  const saturday = addDays(monday, 5);
  const sameMonth = monday.getMonth() === saturday.getMonth();
  const monthInDate = (date) => new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).formatToParts(date).find((part) => part.type === "month").value;
  if (sameMonth) return `${monday.getDate()}–${saturday.getDate()} ${monthInDate(saturday)}`;
  return `${monday.getDate()} ${monthInDate(monday)} – ${saturday.getDate()} ${monthInDate(saturday)}`;
}

function lessonMeta(item) {
  const bits = [];
  if (preferences.showRooms && item.room) bits.push(escapeHTML(item.room));
  if (item.type) bits.push(escapeHTML(item.type));
  return bits.join(" · ");
}

function getTodayCardState(item, nextItem, now) {
  const time = LESSON_TIMES[item.number];
  const minutes = currentMinutes(now);
  if (minutes >= timeToMinutes(time.end)) return "is-past";
  if (minutes >= timeToMinutes(time.start) && minutes < timeToMinutes(time.end)) return "is-current";
  if (nextItem && item.number === nextItem.number) return "is-next";
  return "";
}

function renderLessonCards(lessons, options = {}) {
  const now = options.now || new Date();
  const isToday = options.date && toDateKey(options.date) === toDateKey(now);
  const nextToday = isToday ? getNextLesson(now) : null;
  const nextItem = nextToday && toDateKey(nextToday.date) === toDateKey(now) ? nextToday : null;

  if (!lessons.length) {
    return '<div class="empty-card"><span>Свободный день</span><p>Занятий в расписании нет.</p></div>';
  }

  return `<div class="lesson-list">${lessons.map((item) => {
    const time = LESSON_TIMES[item.number];
    const state = isToday ? getTodayCardState(item, nextItem, now) : "";
    return `
      <article class="lesson-card ${state}">
        <div class="lesson-number" aria-label="${item.number} пара">${item.number}</div>
        <div class="lesson-main">
          <div class="lesson-heading">
            <h3>${escapeHTML(item.subject)}</h3>
            ${state === "is-next" ? '<span class="next-badge">Следующая</span>' : ""}
          </div>
          <p class="lesson-time">${time.start}–${time.end}</p>
          ${lessonMeta(item) ? `<p class="lesson-meta">${lessonMeta(item)}</p>` : ""}
        </div>
      </article>`;
  }).join("")}</div>`;
}

function renderHero(now, lessons) {
  const current = getCurrentLesson(now);
  const next = getNextLesson(now);
  const todayKey = toDateKey(now);
  const insidePeriod = todayKey >= SCHEDULE_PERIOD.start && todayKey <= SCHEDULE_PERIOD.end;

  if (current) {
    const later = next && toDateKey(next.date) === todayKey ? next : null;
    return `
      <section class="hero-card">
        <p class="hero-kicker"><span class="live-dot"></span> Сейчас</p>
        <div class="hero-number">${current.number} пара</div>
        <h2>${escapeHTML(current.subject)}</h2>
        <p class="hero-type">${escapeHTML(current.type)}</p>
        <div class="hero-details">
          ${preferences.showRooms && current.room ? `<span>${escapeHTML(current.room)}</span>` : ""}
          <span>${current.start}–${current.end}</span>
        </div>
        ${later ? `<div class="hero-next">Дальше: ${later.number} пара · ${escapeHTML(later.subject)} в ${later.start}</div>` : ""}
      </section>`;
  }

  if (next && toDateKey(next.date) === todayKey) {
    const minutesUntil = Math.max(0, timeToMinutes(next.start) - currentMinutes(now));
    return `
      <section class="hero-card is-upcoming">
        <p class="hero-kicker">Следующая пара через ${minutesUntil} мин</p>
        <div class="hero-number">${next.number} пара</div>
        <h2>${escapeHTML(next.subject)}</h2>
        <p class="hero-type">${escapeHTML(next.type)}</p>
        <div class="hero-details">
          ${preferences.showRooms && next.room ? `<span>${escapeHTML(next.room)}</span>` : ""}
          <span>${next.start}–${next.end}</span>
        </div>
      </section>`;
  }

  const dayEnded = lessons.length && currentMinutes(now) >= timeToMinutes(LESSON_TIMES[lessons.at(-1).number].end);
  let title = "Сегодня пар нет";
  if (!insidePeriod) title = "Расписание на этот период отсутствует";
  else if (dayEnded) title = "Пары закончились";
  else if (now.getDay() === 0) title = "Сегодня занятий нет";

  return `
    <section class="hero-card is-empty">
      <p class="hero-kicker">${dayEnded ? "На сегодня всё" : "Свободный день"}</p>
      <h2>${title}</h2>
      ${next ? `<div class="next-day-callout"><span>Следующие занятия</span><strong>${formatDate(next.date)}</strong><small>${next.number} пара · ${escapeHTML(next.subject)} · ${next.start}</small></div>` : '<p class="muted">После 26 декабря занятий в исходном расписании нет.</p>'}
    </section>`;
}

function renderToday() {
  const now = new Date();
  const lessons = getScheduleForDate(now);
  app.innerHTML = `
    <section class="page-intro">
      <p class="page-date">${formatDate(now)}</p>
      <p class="page-subtitle">${lessons.length ? pluralLessons(lessons.length) : "Без занятий"}</p>
    </section>
    ${renderHero(now, lessons)}
    <section class="section-block">
      <div class="section-title-row"><h2>Сегодня</h2><span>${lessons.length || "—"}</span></div>
      ${renderLessonCards(lessons, { date: now, now })}
    </section>`;
}

function pluralLessons(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "пара" :
    mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? "пары" : "пар";
  return `${count} ${word}`;
}

function renderWeek() {
  const now = new Date();
  const week = getCurrentWeek(now);
  const currentWeekKeys = week.map((item) => toDateKey(item.date));
  if (!currentWeekKeys.includes(selectedDate)) selectedDate = toDateKey(now.getDay() === 0 ? week[0].date : now);
  const selected = fromDateKey(selectedDate);
  const lessons = getScheduleForDate(selected);

  app.innerHTML = `
    <section class="page-intro compact">
      <p class="eyebrow">Текущая неделя</p>
      <h1>${formatWeekRange(week[0].date)}</h1>
    </section>
    <div class="day-strip" role="tablist" aria-label="Дни недели">
      ${week.map(({ date }) => {
        const key = toDateKey(date);
        const isSelected = key === selectedDate;
        const isToday = key === toDateKey(now);
        return `<button type="button" role="tab" aria-selected="${isSelected}" class="day-chip ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}" data-date="${key}">
          <span>${new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", "")}</span>
          <strong>${date.getDate()}</strong>
        </button>`;
      }).join("")}
    </div>
    <section class="section-block">
      <div class="section-title-row"><h2>${formatDate(selected)}</h2><span>${lessons.length || "—"}</span></div>
      ${renderLessonCards(lessons, { date: selected, now })}
    </section>`;

  app.querySelectorAll("[data-date]").forEach((button) => button.addEventListener("click", () => {
    selectedDate = button.dataset.date;
    renderWeek();
  }));
}

function renderAllSchedule() {
  const week = getCurrentWeek(allWeekAnchor);
  const hasAnyKnownDay = week.some(({ date }) => {
    const key = toDateKey(date);
    return key >= SCHEDULE_PERIOD.start && key <= SCHEDULE_PERIOD.end;
  });

  app.innerHTML = `
    <section class="page-intro compact">
      <p class="eyebrow">Всё расписание</p>
      <h1>${formatWeekRange(week[0].date)}</h1>
    </section>
    <div id="week-browser">
      <div class="week-controls">
        <button type="button" class="text-button" data-week="previous">← Предыдущая неделя</button>
        <button type="button" class="text-button" data-week="next">Следующая неделя →</button>
      </div>
      <div class="week-stack">
        ${hasAnyKnownDay ? week.map(({ date, lessons }) => `
          <section class="day-section">
            <div class="day-section-title">
              <h2>${formatDate(date)}</h2>
              <span>${lessons.length ? pluralLessons(lessons.length) : "Нет пар"}</span>
            </div>
            ${renderLessonCards(lessons, { date })}
          </section>`).join("") : `
          <div class="empty-card large"><span>Нет данных</span><p>Расписание на этот период отсутствует.</p></div>`}
      </div>
    </div>
    `;

  app.querySelector('[data-week="previous"]').addEventListener("click", () => {
    allWeekAnchor = addDays(allWeekAnchor, -7);
    renderAllSchedule();
  });
  app.querySelector('[data-week="next"]').addEventListener("click", () => {
    allWeekAnchor = addDays(allWeekAnchor, 7);
    renderAllSchedule();
  });
}

function normalizeSubject(value) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim();
}

function subjectMatches(subject, query) {
  const queryWords = normalizeSubject(query).split(" ").filter(Boolean);
  const subjectWords = normalizeSubject(subject).split(" ").filter(Boolean);
  return queryWords.length > 0 && queryWords.every((queryWord) =>
    subjectWords.some((subjectWord) => subjectWord.startsWith(queryWord))
  );
}

function getSubjectNames() {
  return [...new Set(Object.values(SCHEDULE).flat().map((item) => item.subject))]
    .sort((first, second) => first.localeCompare(second, "ru"));
}

function getSubjectSearchResults(query) {
  return Object.entries(SCHEDULE).flatMap(([date, lessons]) =>
    lessons
      .filter((item) => subjectMatches(item.subject, query))
      .map((item) => ({ ...item, date: fromDateKey(date) }))
  );
}

function getSearchLessonStatus(item, now = new Date()) {
  const time = LESSON_TIMES[item.number];
  const start = new Date(item.date);
  const end = new Date(item.date);
  const [startHours, startMinutes] = time.start.split(":").map(Number);
  const [endHours, endMinutes] = time.end.split(":").map(Number);
  start.setHours(startHours, startMinutes, 0, 0);
  end.setHours(endHours, endMinutes, 0, 0);

  if (now >= end) return { className: "is-completed", label: "Проведено" };
  if (now >= start) return { className: "is-live", label: "Сейчас" };
  return { className: "is-upcoming", label: "Предстоит" };
}

function renderSearch() {
  const subjects = getSubjectNames();
  app.innerHTML = `
    <section class="page-intro compact">
      <p class="eyebrow">Поиск</p>
      <h1>Дисциплины</h1>
      <p class="page-subtitle">${subjects.length} предметов в расписании</p>
    </section>
    <section class="subject-search-card search-view-card">
      <label for="subject-search">Название дисциплины</label>
      <div class="subject-search-field">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>
        <input id="subject-search" type="search" value="${escapeHTML(subjectQuery)}" placeholder="Например, мат анализ" autocomplete="off" />
      </div>
    </section>
    <div id="subject-search-results"></div>`;

  const searchInput = app.querySelector("#subject-search");
  searchInput.addEventListener("input", (event) => {
    subjectQuery = event.target.value;
    renderSubjectSearchResults();
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      subjectQuery = "";
      searchInput.value = "";
      renderSubjectSearchResults();
    }
  });
  renderSubjectSearchResults();
}

function renderSubjectSearchResults() {
  const container = app.querySelector("#subject-search-results");
  const query = subjectQuery.trim();

  if (!query) {
    const subjects = getSubjectNames();
    container.innerHTML = `
      <div class="search-results-heading">
        <h2>Все дисциплины</h2>
        <span>${subjects.length}</span>
      </div>
      <div class="subject-list">
        ${subjects.map((subject) => `
          <button class="subject-list-item" type="button" data-subject="${escapeHTML(subject)}">
            <span>${escapeHTML(subject)}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
          </button>`).join("")}
      </div>`;
    container.querySelectorAll("[data-subject]").forEach((button) => {
      button.addEventListener("click", () => {
        subjectQuery = button.dataset.subject;
        const input = app.querySelector("#subject-search");
        input.value = subjectQuery;
        renderSubjectSearchResults();
        scrollTo({ top: 0, behavior: "smooth" });
      });
    });
    return;
  }

  const results = getSubjectSearchResults(query);
  if (!results.length) {
    container.innerHTML = '<div class="empty-card search-empty"><span>Предмет не найден</span><p>Попробуйте ввести часть названия, например «физика» или «дискр мат».</p></div>';
    return;
  }

  container.innerHTML = `
    <button class="search-back-button" id="search-back" type="button" aria-label="Вернуться ко всем дисциплинам">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
      Все дисциплины
    </button>
    <div class="search-results-heading">
      <h2>${escapeHTML(query)}</h2>
      <span>${pluralLessons(results.length)}</span>
    </div>
    <div class="subject-results">
      ${results.map((item) => {
        const time = LESSON_TIMES[item.number];
        const important = item.type === "КР" || item.type === "зачёт";
        const status = getSearchLessonStatus(item);
        return `
          <article class="subject-result-card ${important ? "is-important" : ""} ${status.className}">
            <div class="result-date">
              <strong>${item.date.getDate()}</strong>
              <span>${new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(item.date).replace(".", "")}</span>
            </div>
            <div class="result-main">
              <div class="result-topline">
                <p class="result-weekday">${new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(item.date)}</p>
                <span class="lesson-status">${status.label}</span>
              </div>
              <h3>${escapeHTML(item.subject)}</h3>
              <p>${item.number} пара · ${time.start}–${time.end}</p>
              <div class="result-tags">
                <span class="type-tag">${escapeHTML(item.type)}</span>
                ${preferences.showRooms && item.room ? `<span>${escapeHTML(item.room)}</span>` : ""}
              </div>
            </div>
          </article>`;
      }).join("")}
    </div>`;

  container.querySelector("#search-back").addEventListener("click", () => {
    subjectQuery = "";
    const input = app.querySelector("#subject-search");
    input.value = "";
    renderSubjectSearchResults();
    scrollTo({ top: 0, behavior: "smooth" });
  });
}

function renderSettings() {
  app.innerHTML = `
    <section class="page-intro compact">
      <p class="eyebrow">Приложение</p>
      <h1>Настройки</h1>
    </section>
    <section class="settings-card">
      <label class="setting-row">
        <span><strong>Тема</strong><small>Системная меняется вместе с устройством</small></span>
        <select id="theme-setting">
          <option value="system" ${preferences.theme === "system" ? "selected" : ""}>Как в системе</option>
          <option value="light" ${preferences.theme === "light" ? "selected" : ""}>Светлая</option>
          <option value="dark" ${preferences.theme === "dark" ? "selected" : ""}>Тёмная</option>
        </select>
      </label>
      <label class="setting-row">
        <span><strong>Показывать аудитории</strong><small>Полные номера корпусов и аудиторий</small></span>
        <input id="rooms-setting" type="checkbox" ${preferences.showRooms ? "checked" : ""} />
      </label>
      <label class="setting-row">
        <span><strong>Формат даты</strong><small>В заголовках расписания</small></span>
        <select id="date-setting">
          <option value="long" ${preferences.dateFormat === "long" ? "selected" : ""}>16 сентября</option>
          <option value="short" ${preferences.dateFormat === "short" ? "selected" : ""}>16.09.2026</option>
        </select>
      </label>
    </section>
    <section class="settings-card install-card">
      <div class="install-icon">↗</div>
      <div><h2>На главный экран</h2><p>После установки расписание открывается как отдельное приложение и работает офлайн.</p></div>
      <button class="primary-button" id="install-button" type="button" ${deferredInstallPrompt ? "" : "disabled"}>Установить</button>
      <p class="ios-note">На iPhone: откройте меню «Поделиться» в Safari → «На экран „Домой“».</p>
    </section>
    <section class="settings-card about-card">
      <p><strong>Период:</strong> 1 сентября — 26 декабря 2026</p>
      <p><strong>Пользователь:</strong> ${escapeHTML(window.currentMember?.username || "")}</p>
      <p><strong>Время:</strong> определяется устройством</p>
    </section>
    <button class="danger-button" id="logout-button" type="button">Выйти из аккаунта</button>`;

  app.querySelector("#theme-setting").addEventListener("change", (event) => {
    savePreferences({ theme: event.target.value });
  });
  app.querySelector("#rooms-setting").addEventListener("change", (event) => {
    savePreferences({ showRooms: event.target.checked });
  });
  app.querySelector("#date-setting").addEventListener("change", (event) => {
    savePreferences({ dateFormat: event.target.value });
  });
  app.querySelector("#install-button").addEventListener("click", installApp);
  app.querySelector("#logout-button").addEventListener("click", window.logoutScheduleApp);
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  renderSettings();
}

function render() {
  applyTheme();
  if (activeView === "today") renderToday();
  else if (activeView === "week") renderWeek();
  else if (activeView === "all") renderAllSchedule();
  else if (activeView === "search") renderSearch();
  else if (activeView === "settings") renderSettings();
  else window.renderAdminPanel();
}

navItems.forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.view === "search" && activeView === "search" && subjectQuery) {
    subjectQuery = "";
  }
  activeView = button.dataset.view;
  navItems.forEach((item) => item.classList.toggle("is-active", item === button));
  render();
  app.focus({ preventScroll: true });
  scrollTo({ top: 0, behavior: "smooth" });
}));

addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (activeView === "settings") renderSettings();
});

matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (preferences.theme === "system") applyTheme();
});

if ("serviceWorker" in navigator) {
  addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("service-worker.js");
      await navigator.serviceWorker.ready;
    } catch {
      // На file:// и небезопасном HTTP Service Worker недоступен.
    }
  });
}

/* Опциональные WebMCP-инструменты: обычные браузеры просто игнорируют этот блок. */
function registerWebMCPTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;

  context.registerTool({
    name: "read_schedule_for_date",
    title: "Расписание на дату",
    description: "Возвращает локальное расписание занятий на дату в формате ГГГГ-ММ-ДД.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
      required: ["date"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute({ date }) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Неверный формат даты");
      return { date, lessons: getScheduleForDate(fromDateKey(date)) };
    },
  });

  context.registerTool({
    name: "set_schedule_preferences",
    title: "Настройки расписания",
    description: "Меняет тему, показ аудиторий или формат даты в локальных настройках приложения.",
    inputSchema: {
      type: "object",
      properties: {
        theme: { type: "string", enum: ["system", "light", "dark"] },
        showRooms: { type: "boolean" },
        dateFormat: { type: "string", enum: ["long", "short"] },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      const allowed = {};
      if (input.theme !== undefined) allowed.theme = input.theme;
      if (input.showRooms !== undefined) allowed.showRooms = input.showRooms;
      if (input.dateFormat !== undefined) allowed.dateFormat = input.dateFormat;
      savePreferences(allowed);
      render();
      return { saved: true, preferences };
    },
  });
}

applyTheme();
registerWebMCPTools();
render();

// Обновляем статус пары без перезагрузки экрана.
setInterval(() => {
  if (activeView === "today") renderToday();
}, 30_000);
