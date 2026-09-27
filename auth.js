const SUPABASE_URL = "https://xwxlkljbsqecxgpzajas.supabase.co";
const SUPABASE_KEY = "sb_publishable_hQACjm0-FYyHt0SvfZNtkQ_xQFkamvN";
const SESSION_KEY = "schedule-auth-session";
const DATA_KEY = "schedule-auth-data";
var SCHEDULE_PERIOD = { start: "2026-09-01", end: "2026-12-26" };
var SCHEDULE = {};
window.currentMember = null;

const authHeaders = (token) => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

async function fetchWithTimeout(url, options = {}, timeout = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

function showLogin(message = "") {
  document.querySelector(".bottom-nav").hidden = true;
  document.querySelector("#app").innerHTML = `
    <section class="auth-wrap">
      <div class="auth-mark">Р</div>
      <p class="eyebrow">Закрытое расписание</p>
      <h1>Вход</h1>
      <p class="auth-copy">Введите логин и пароль, выданные администратором.</p>
      <form class="auth-card" id="login-form">
        <label>Логин<input name="username" autocomplete="username" autocapitalize="none" required minlength="3"></label>
        <label>Пароль<input name="password" type="password" autocomplete="current-password" required minlength="10"></label>
        ${message ? `<p class="form-error">${message}</p>` : ""}
        <button class="primary-button" type="submit">Войти</button>
      </form>
    </section>`;
  document.querySelector("#login-form").addEventListener("submit", login);
}

async function login(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  const data = new FormData(event.currentTarget);
  const username = String(data.get("username") || "").trim().toLowerCase();
  try {
    const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${username}@raspisanie.local`, password: String(data.get("password") || "") }),
    }, 15000);
    const session = await response.json();
    if (!response.ok) throw new Error("Неверный логин или пароль");
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    await startApp(session);
  } catch (error) { showLogin(error.message || "Не удалось войти"); }
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) return null;
  const next = await response.json();
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  return next;
}

async function loadProtectedData(session) {
  let token = session.access_token;
  let memberResponse = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/members?select=user_id,username,role,active&limit=1`, { headers: authHeaders(token) });
  if (memberResponse.status === 401) {
    session = await refreshSession(session);
    if (!session) throw new Error("Сеанс истёк. Войдите снова.");
    token = session.access_token;
    memberResponse = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/members?select=user_id,username,role,active&limit=1`, { headers: authHeaders(token) });
  }
  if (!memberResponse.ok) throw new Error("Доступ к расписанию закрыт");
  const members = await memberResponse.json();
  if (!members[0]?.active) throw new Error("Аккаунт отключён");
  const lessonsResponse = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/schedule_lessons?select=lesson_date,lesson_number,subject,room,lesson_type&order=lesson_date.asc,lesson_number.asc`, { headers: authHeaders(token) });
  if (!lessonsResponse.ok) throw new Error("Не удалось загрузить расписание");
  const lessons = await lessonsResponse.json();
  const schedule = {};
  for (const row of lessons) (schedule[row.lesson_date] ||= []).push({ number: row.lesson_number, subject: row.subject, room: row.room || "", type: row.lesson_type || "" });
  const payload = { member: members[0], schedule };
  localStorage.setItem(DATA_KEY, JSON.stringify(payload));
  return { ...payload, session };
}

async function startApp(session) {
  let payload;
  try { payload = await loadProtectedData(session); }
  catch (error) {
    const networkUnavailable = !navigator.onLine || error instanceof TypeError || error?.name === "AbortError" || /fetch|network|сети|abort|timeout/i.test(String(error?.message || ""));
    if (networkUnavailable) {
      try { payload = { ...JSON.parse(localStorage.getItem(DATA_KEY)), session }; } catch {}
    }
    if (!payload?.member || !payload?.schedule) { localStorage.removeItem(SESSION_KEY); showLogin(error.message); return; }
  }
  SCHEDULE = payload.schedule;
  window.currentMember = payload.member;
  window.currentSession = payload.session;
  const nav = document.querySelector(".bottom-nav");
  if (payload.member.role === "admin") {
    nav.insertAdjacentHTML("beforeend", `<button class="nav-item" data-view="admin" type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0M19 8v6m-3-3h6"/></svg><span>Админ</span></button>`);
  }
  nav.hidden = false;
  const script = document.createElement("script");
  script.src = "app.js?v=14";
  document.body.append(script);
}

window.logoutScheduleApp = async () => {
  const session = getSession();
  if (session?.access_token) fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: authHeaders(session.access_token) }).catch(() => {});
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(DATA_KEY);
  location.reload();
};

async function adminRequest(body) {
  let session = getSession();
  let response = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, { method: "POST", headers: authHeaders(session.access_token), body: JSON.stringify(body) });
  if (response.status === 401) {
    session = await refreshSession(session);
    if (!session) throw new Error("Войдите снова");
    window.currentSession = session;
    response = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, { method: "POST", headers: authHeaders(session.access_token), body: JSON.stringify(body) });
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Операция не выполнена");
  return result;
}

window.renderAdminPanel = async function renderAdminPanel(notice = "") {
  const app = document.querySelector("#app");
  app.innerHTML = `<section class="page-intro compact"><p class="eyebrow">Управление доступом</p><h1>Администратор</h1></section><div class="empty-card"><span>Загрузка…</span></div>`;
  try {
    const { users } = await adminRequest({ action: "list" });
    app.innerHTML = `
      <section class="page-intro compact"><p class="eyebrow">Управление доступом</p><h1>Администратор</h1><p class="page-subtitle">Пароли нельзя посмотреть, но их можно заменить.</p></section>
      ${notice ? `<p class="success-note">${notice}</p>` : ""}
      <form class="settings-card admin-form" id="create-user-form">
        <h2>Новый пользователь</h2>
        <label>Логин<input name="username" required minlength="3" maxlength="32" pattern="[a-z0-9._-]+" autocapitalize="none"></label>
        <label>Пароль<input name="password" type="text" required minlength="10" maxlength="72" autocomplete="off"></label>
        <button class="primary-button" type="submit">Создать</button>
      </form>
      <div class="admin-users">${users.map((user) => `
        <article class="admin-user ${user.active ? "" : "is-disabled"}">
          <div><strong>${user.username}</strong><small>${user.role === "admin" ? "Администратор" : user.active ? "Доступ открыт" : "Доступ закрыт"}</small></div>
          ${user.role === "admin" ? "" : `<div class="admin-actions"><button type="button" data-reset="${user.user_id}">Сменить пароль</button><button type="button" data-toggle="${user.user_id}" data-active="${user.active}">${user.active ? "Отключить" : "Включить"}</button><button class="danger-link" type="button" data-delete="${user.user_id}">Удалить</button></div>`}
        </article>`).join("")}</div>`;
    app.querySelector("#create-user-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      try { await adminRequest({ action: "create", username: data.get("username"), password: data.get("password") }); renderAdminPanel("Пользователь создан"); }
      catch (error) { alert(error.message); }
    });
    app.querySelectorAll("[data-reset]").forEach((button) => button.addEventListener("click", async () => {
      const password = prompt("Новый пароль (минимум 10 символов):"); if (!password) return;
      try { await adminRequest({ action: "reset_password", user_id: button.dataset.reset, password }); alert("Пароль изменён"); } catch (error) { alert(error.message); }
    }));
    app.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", async () => {
      try { await adminRequest({ action: "set_active", user_id: button.dataset.toggle, active: button.dataset.active !== "true" }); renderAdminPanel("Доступ изменён"); } catch (error) { alert(error.message); }
    }));
    app.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Удалить пользователя без возможности входа?")) return;
      try { await adminRequest({ action: "delete", user_id: button.dataset.delete }); renderAdminPanel("Пользователь удалён"); } catch (error) { alert(error.message); }
    }));
  } catch (error) { app.innerHTML = `<div class="empty-card"><span>Не удалось открыть панель</span><p>${error.message}</p></div>`; }
};

const session = getSession();
if (session) startApp(session); else showLogin();
