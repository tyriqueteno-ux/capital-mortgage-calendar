/* Capital Mortgage Calendar — page logic.
   Talks only to this site's /api routes; Google tokens never reach the browser. */
(() => {
"use strict";
const CFG = JSON.parse(document.getElementById("cm-config").textContent);
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || CFG.timeZone;
const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store = {
  get(k, d){ try{ const v = localStorage.getItem("cmc:"+CFG.user.email+":"+k); return v==null? d : JSON.parse(v);}catch{ return d; } },
  set(k, v){ try{ localStorage.setItem("cmc:"+CFG.user.email+":"+k, JSON.stringify(v)); }catch{} }
};

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = d => addDays(startOfDay(d), -d.getDay());
const sameDay = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const fTime = d => d.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}).replace(":00","").replace(" ","").toLowerCase();
const fLong = d => d.toLocaleDateString([], {weekday:"long", month:"long", day:"numeric"});
const fMonth = d => d.toLocaleDateString([], {month:"long", year:"numeric"});
const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/* ---------- business hours (the server enforces these too) ---------- */
const HOURS = CFG.hours, HOURS_TEXT = CFG.hoursText;
const isWorkDay = d => HOURS.days.includes(d.getDay());
const closedNames = [0,1,2,3,4,5,6].filter(d => !HOURS.days.includes(d)).map(d => ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d]);
const DAY_OFF = `${closedNames.join(" and ")} ${closedNames.length>1?"are days":"is a day"} off.`;
function withinHours(s, e, allDay){
  if (allDay){ for (let d = new Date(s); d < e; d = addDays(d,1)) if (!isWorkDay(d)) return DAY_OFF + " Pick a work day."; return null; }
  if (!isWorkDay(s)) return DAY_OFF + " Pick a work day.";
  if (!sameDay(s, new Date(e.getTime()-1))) return "Appointments have to start and end on the same work day.";
  const open = new Date(s); open.setHours(HOURS.open,0,0,0);
  const close = new Date(s); close.setHours(HOURS.close,0,0,0);
  if (s < open || e > close) return `That’s outside business hours (${HOURS_TEXT}).`;
  return null;
}
function nextOpenSlot(from){
  let d = new Date(from); d.setMinutes(0,0,0); d.setHours(d.getHours()+1);
  for (let i=0;i<14;i++){
    if (isWorkDay(d)){
      if (d.getHours() < HOURS.open) d.setHours(HOURS.open,0);
      if (d.getHours() <= HOURS.close - 1) return d;
    }
    d = addDays(startOfDay(d),1); d.setHours(Math.max(HOURS.open, 9),0);
  }
  return d;
}
const isOpenNow = () => { const n = new Date(); return isWorkDay(n) && n.getHours() >= HOURS.open && n.getHours() < HOURS.close; };
const openLabel = h => h === 12 ? "12 PM" : h > 12 ? `${h-12} PM` : `${h} AM`;

/* ---------- state ---------- */
const S = {
  view: store.get("view", window.innerWidth < 640 ? "agenda" : "week"),
  cursor: startOfDay(new Date()),
  gStatus: "connecting", gError: null,
  calendars: [], hidden: new Set(store.get("hidden", [])), hiddenSet: store.get("hidden", null) !== null, colors: store.get("colors", {}),
  workCal: null, bookingUrl: null,
  events: [], loading: false, loadedAt: null, gen: 0,
  tasks: [], tasksReady: false, tasksError: null,
};

/* ---------- API ---------- */
class ApiError extends Error { constructor(status, body){ super(body?.message || "Something went wrong. Try again."); this.status = status; this.code = body?.error; } }
async function api(path, { method = "GET", body } = {}){
  let res;
  try {
    res = await fetch(path, { method, headers: body ? {"Content-Type":"application/json"} : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  } catch { throw new ApiError(0, {error:"offline", message:"You appear to be offline. Check your connection and try again."}); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok){
    const err = new ApiError(res.status, data);
    if (res.status === 401) showReauth(err.message);
    throw err;
  }
  return data;
}
// Keeps the Google sign-in fresh (the session endpoint refreshes tokens).
const keepAlive = () => fetch("/api/auth/session", {credentials:"same-origin"}).catch(()=>{});
setInterval(keepAlive, 20*60*1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden){ keepAlive(); if (S.gStatus === "ok") loadEvents(); } });

/* ---------- toast & modal ---------- */
let toastT;
function toast(msg){ const r = $("#toastRoot"); r.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`; clearTimeout(toastT); toastT = setTimeout(()=> r.innerHTML="", 2800); }
function openModal(html, onMount){
  const root = $("#modalRoot");
  root.innerHTML = `<div class="scrim"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const scrim = root.firstElementChild;
  scrim.addEventListener("mousedown", e => { if (e.target === scrim) closeModal(); });
  root.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModal));
  onMount && onMount(root.querySelector(".modal"));
  const f = root.querySelector("input,select,textarea,button:not([data-close])"); f && f.focus();
}
function closeModal(){ $("#modalRoot").innerHTML = ""; }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

function showReauth(message){
  S.gStatus = "reauth"; S.gError = {message};
  renderBanner(); renderCals(); renderSync();
}

/* ---------- ranges ---------- */
function range(){
  const c = S.cursor;
  if (S.view === "month"){ const first = new Date(c.getFullYear(), c.getMonth(), 1); const s = startOfWeek(first); return {start:s, end:addDays(s,42)}; }
  if (S.view === "week"){ const s = startOfWeek(c); return {start:s, end:addDays(s,7)}; }
  if (S.view === "day") return {start:c, end:addDays(c,1)};
  return {start:c, end:addDays(c,14)};
}
function rangeLabel(){
  const {start,end} = range(), last = addDays(end,-1);
  if (S.view === "month") return fMonth(S.cursor);
  if (S.view === "day") return S.cursor.toLocaleDateString([], {weekday:"short", month:"short", day:"numeric", year:"numeric"});
  const sm = start.toLocaleDateString([], {month:"short", day:"numeric"});
  const em = last.toLocaleDateString([], start.getMonth()===last.getMonth() ? {day:"numeric"} : {month:"short", day:"numeric"});
  return `${sm} – ${em}, ${last.getFullYear()}`;
}

/* ---------- calendars ---------- */
function calColor(id){
  if (S.colors[id] == null){
    const used = Object.values(S.colors); let i = 0; while (used.includes(i) && i < 6) i++;
    S.colors[id] = i < 6 ? i : Object.keys(S.colors).length % 6; store.set("colors", S.colors);
  }
  return `var(--c${S.colors[id]})`;
}
const calById = id => S.calendars.find(c => c.id === id);
const writableCals = () => S.calendars.filter(c => !c.readOnly && !c.holiday);

async function loadCalendars(){
  const r = await api("/api/calendars");
  S.calendars = r.calendars; S.workCal = r.workId; S.bookingUrl = r.bookingUrl;
  S.colors[S.workCal] = 0; store.set("colors", S.colors);
  S.calendars.forEach(c => calColor(c.id));
  if (!S.hiddenSet){
    S.hidden = new Set(S.calendars.map(c => c.id).filter(id => id !== S.workCal));
    S.hiddenSet = true; store.set("hidden", [...S.hidden]);
  }
  if (r.createdWork) toast("Created a Work calendar in your Google account");
}

/* ---------- events ---------- */
function toEvent(e){
  const allDay = e.allDay;
  const start = allDay ? parseYmd(e.start) : new Date(e.start);
  const end = allDay ? parseYmd(e.end) : new Date(e.end);
  return {...e, start, end, calId: e.calendarId};
}
async function loadEvents(){
  if (S.gStatus !== "ok") return;
  const gen = ++S.gen; S.loading = true; renderSync();
  const {start, end} = range();
  const cals = S.calendars.filter(c => !S.hidden.has(c.id));
  if (!cals.length){ S.events = []; S.loading = false; S.loadedAt = new Date(); renderAll(); return; }
  const q = new URLSearchParams({start:start.toISOString(), end:end.toISOString()});
  cals.forEach(c => q.append("cal", c.id));
  try {
    const r = await api("/api/events?" + q);
    if (gen !== S.gen) return;
    S.events = r.events.map(toEvent).sort((a,b) => a.start - b.start || (b.allDay - a.allDay));
    S.gError = r.failed?.length ? {message:`Couldn’t load ${r.failed.map(id => calById(id)?.name || id).join(", ")}. Press Refresh to try again.`} : null;
    S.loadedAt = new Date();
  } catch(e){
    if (gen !== S.gen) return;
    if (e.status !== 401) S.gError = {message:e.message};
  }
  S.loading = false; renderAll();
}
function eventsOn(day){ const s = startOfDay(day), e = addDays(s,1); return S.events.filter(ev => ev.start < e && ev.end > s); }
function remindersOn(day){ const k = ymd(day); return S.tasks.filter(t => t.due === k); }

/* ---------- reminders (Google Tasks) ---------- */
async function loadTasks(){
  try { const r = await api("/api/tasks"); S.tasks = r.tasks; S.tasksError = null; }
  catch(e){ if (e.status !== 401) S.tasksError = e.message; }
  S.tasksReady = true; renderAll();
}
async function addReminder(e){
  e.preventDefault();
  const title = $("#remTitle").value.trim(); if (!title) return;
  const due = $("#remDate").value || null;
  const btn = $("#remAdd"); btn.disabled = true;
  try { const r = await api("/api/tasks", {method:"POST", body:{title, due}}); S.tasks.push(r.task); $("#remTitle").value = ""; toast("Reminder added"); renderAll(); }
  catch(err){ toast(err.message); }
  finally { btn.disabled = false; }
}
async function toggleReminder(t){
  const was = t.done; t.done = !was; renderAll();
  try { await api(`/api/tasks/${encodeURIComponent(t.id)}`, {method:"PATCH", body:{done:!was}}); t.completedAt = t.done ? new Date().toISOString() : null; }
  catch(err){ t.done = was; renderAll(); toast(err.message); }
}
async function deleteReminder(t){
  try { await api(`/api/tasks/${encodeURIComponent(t.id)}`, {method:"DELETE"}); S.tasks = S.tasks.filter(x => x !== t); renderAll(); toast("Reminder deleted"); }
  catch(err){ toast(err.message); }
}
async function reminderToGoogle(t){
  const s = parseYmd(t.due); s.setHours(Math.max(HOURS.open, 9), 0);
  const e = new Date(s.getTime() + 15*60e3);
  const bad = withinHours(s, e, false); if (bad){ toast(bad); return; }
  try {
    await api("/api/events", {method:"POST", body:{calendarId:S.workCal, title:"🔔 " + t.title, allDay:false, start:s.toISOString(), end:e.toISOString(), reminder:"0", description:"Reminder from " + CFG.company + " Calendar", free:true}});
    toast("Added to your Work calendar at " + fTime(s) + " — your phone will alert you"); loadEvents();
  } catch(err){ toast(err.message); }
}

/* ---------- rendering ---------- */
function chip(ev){
  const t = ev.allDay ? "" : `<span class="t">${fTime(ev.start)}</span>`;
  return `<button class="chip${ev.allDay?" allday":""}" style="--ev:${calColor(ev.calId)}" data-ev="${esc(ev.calId)}|${esc(ev.id)}"><span class="d"></span>${t}<span class="n">${esc(ev.title)}</span></button>`;
}
const remChip = t => `<button class="chip rem${t.done?" done":""}" data-rem="${esc(t.id)}"><span class="d"></span><span class="n">${esc(t.title)}</span></button>`;

function renderMonth(){
  const {start} = range(), today = new Date(), m = S.cursor.getMonth();
  let h = `<div class="month"><div class="dow">${dayNames.map(d=>`<div>${d}</div>`).join("")}</div><div class="mgrid">`;
  for (let i=0;i<42;i++){
    const d = addDays(start,i), items = [...eventsOn(d).map(chip), ...remindersOn(d).map(remChip)];
    const max = 3, extra = items.length - max;
    h += `<div class="cell${d.getMonth()!==m?" out":""}${sameDay(d,today)?" today":""}${isWorkDay(d)?"":" closed"}" data-day="${ymd(d)}" role="button" tabindex="0" aria-label="${esc(fLong(d))}">
      <span class="dnum">${d.getDate()}</span>${items.slice(0, extra>0?max-1:max).join("")}${extra>0?`<button class="more" data-goday="${ymd(d)}">+${extra+1} more</button>`:""}</div>`;
  }
  return h + `</div></div>`;
}
function layoutDay(evs){
  const items = evs.map(e => ({e, s:e.start, en:e.end})).sort((a,b)=>a.s-b.s || b.en-a.en);
  const cols = []; let cluster = [], clusterEnd = 0; const out = [];
  const flush = () => { const n = cols.length; cluster.forEach(it => out.push({...it, n})); cols.length = 0; cluster = []; };
  for (const it of items){
    if (cluster.length && it.s >= clusterEnd){ flush(); clusterEnd = 0; }
    let c = cols.findIndex(end => end <= it.s); if (c === -1){ c = cols.length; cols.push(0); }
    cols[c] = it.en; it.col = c; cluster.push(it); clusterEnd = Math.max(clusterEnd, +it.en);
  }
  flush(); return out;
}
const hourPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hour")) || 46;
function renderTimeGrid(days){
  const today = new Date(), n = days.length, gtc = `52px repeat(${n}, minmax(0,1fr))`, H = hourPx();
  let h = `<div class="tg"><div class="tg-head" style="grid-template-columns:${gtc}"><div></div>`;
  days.forEach(d => h += `<div class="h${sameDay(d,today)?" today":""}"><div class="w">${dayNames[d.getDay()]}</div><button class="btn ghost n" data-goday="${ymd(d)}" style="padding:0">${d.getDate()}</button></div>`);
  h += `</div><div class="tg-all" style="grid-template-columns:${gtc}"><div class="lab">all-day</div>`;
  days.forEach(d => h += `<div class="c">${eventsOn(d).filter(e=>e.allDay).map(chip).join("")}${remindersOn(d).map(remChip).join("")}</div>`);
  h += `</div><div class="tg-scroll" id="tgScroll"><div class="tg-body" style="grid-template-columns:${gtc}"><div class="tg-hours">`;
  for (let i=0;i<24;i++) h += `<div>${i===0?"":fTime(new Date(2000,0,1,i))}</div>`;
  h += `</div>`;
  days.forEach(d => {
    const s0 = startOfDay(d), s1 = addDays(s0,1);
    const evs = eventsOn(d).filter(e=>!e.allDay).map(e => ({...e, start: e.start < s0 ? s0 : e.start, end: e.end > s1 ? s1 : e.end, _o:e}));
    h += `<div class="tg-col${sameDay(d,today)?" today":""}" data-slot="${ymd(d)}" style="height:${24*H}px">`;
    h += isWorkDay(d) ? `<div class="offhrs" style="top:0;height:${HOURS.open*H}px"></div><div class="offhrs" style="top:${HOURS.close*H}px;bottom:0"></div>` : `<div class="offhrs" style="top:0;bottom:0"></div>`;
    layoutDay(evs).forEach(it => {
      const top = (it.s - s0)/36e5*H, ht = Math.max((it.en - it.s)/36e5*H - 2, 20), w = 100/it.n;
      h += `<button class="blk" style="--ev:${calColor(it.e.calId)};top:${top}px;height:${ht}px;left:calc(${it.col*w}% + 2px);width:calc(${w}% - 4px)" data-ev="${esc(it.e.calId)}|${esc(it.e.id)}"><span class="n">${esc(it.e.title)}</span><span class="t">${fTime(it.e._o.start)}–${fTime(it.e._o.end)}</span></button>`;
    });
    if (sameDay(d,today)) h += `<div class="now" style="top:${(new Date() - s0)/36e5*H}px"></div>`;
    h += `</div>`;
  });
  return h + `</div></div></div>`;
}
function renderAgenda(){
  const {start} = range(), today = new Date();
  let h = `<div class="agenda">`;
  for (let i=0;i<14;i++){
    const d = addDays(start,i), evs = eventsOn(d), rs = remindersOn(d);
    if (!evs.length && !rs.length && !sameDay(d,today)) continue;
    h += `<div class="aday${sameDay(d,today)?" today":""}"><div class="when"><div class="big">${d.getDate()}</div><div class="sm">${sameDay(d,today)?"Today":d.toLocaleDateString([], {weekday:"short", month:"short"})}</div></div><div class="alist">`;
    if (!evs.length && !rs.length) h += `<div class="empty">Nothing scheduled.</div>`;
    evs.forEach(e => h += `<button class="arow" style="--ev:${calColor(e.calId)}" data-ev="${esc(e.calId)}|${esc(e.id)}"><span class="t">${e.allDay?"All day":fTime(e.start)}</span><span class="n">${esc(e.title)}${e.location?`<span class="loc">${esc(e.location)}</span>`:""}</span></button>`);
    rs.forEach(t => h += `<button class="arow" style="--ev:var(--accent)" data-rem="${esc(t.id)}"><span class="t">Reminder</span><span class="n" style="${t.done?"text-decoration:line-through;color:var(--muted)":""}">${esc(t.title)}</span></button>`);
    h += `</div></div>`;
  }
  return h + `</div>`;
}
function renderView(){
  const v = $("#view");
  $("#rangeLabel").textContent = rangeLabel();
  document.querySelectorAll("#viewSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === S.view));
  if (S.view === "month") v.innerHTML = renderMonth();
  else if (S.view === "week"){ const s = startOfWeek(S.cursor); v.innerHTML = renderTimeGrid([0,1,2,3,4,5,6].map(i=>addDays(s,i))); }
  else if (S.view === "day") v.innerHTML = renderTimeGrid([S.cursor]);
  else v.innerHTML = renderAgenda();
  const sc = $("#tgScroll"); if (sc) sc.scrollTop = Math.max(0, (HOURS.open - 0.5) * hourPx());
}
function renderBanner(){
  const b = $("#banner");
  if (S.gStatus === "reauth"){
    b.innerHTML = `<div class="banner bad"><span class="dot"></span><div class="grow"><b>Reconnect Google</b><p>${esc(S.gError?.message || "Your Google connection expired.")}</p></div><button class="btn" id="reauthBtn">Sign in again</button></div>`;
    $("#reauthBtn").addEventListener("click", () => location.href = "/api/auth/signout"); return;
  }
  if (S.gStatus === "error" || S.gError){
    b.innerHTML = `<div class="banner${S.gStatus==="error"?" bad":""}"><span class="dot"></span><div class="grow"><b>${S.gStatus==="error"?"Couldn’t reach Google Calendar":"Some calendars didn’t load"}</b><p>${esc(S.gError?.message||"")}</p></div><button class="btn" id="retryG">Try again</button></div>`;
    $("#retryG").addEventListener("click", boot); return;
  }
  b.innerHTML = "";
}
function renderSync(){
  const s = $("#sync");
  if (S.gStatus === "connecting"){ s.innerHTML = `<span class="spin"></span> Connecting to Google Calendar…`; return; }
  if (S.gStatus !== "ok"){ s.innerHTML = ""; return; }
  s.innerHTML = S.loading ? `<span class="spin"></span> Updating…` : (S.loadedAt ? `Synced with Google at ${fTime(S.loadedAt)} · times shown in ${esc(TZ.replace(/_/g," "))}` : "");
}
function renderCals(){
  const el = $("#cals");
  if (S.gStatus === "connecting"){ el.innerHTML = `<p class="empty"><span class="spin"></span> Connecting…</p>`; return; }
  if (S.gStatus !== "ok"){ el.innerHTML = `<p class="empty">Not connected.</p>`; return; }
  el.innerHTML = S.calendars.map(c => `<label class="cal" style="--ev:${calColor(c.id)}"><input type="checkbox" data-cal="${esc(c.id)}" ${S.hidden.has(c.id)?"":"checked"}><span>${esc(c.name)}</span>${c.readOnly||c.holiday?`<small>view only</small>`:""}</label>`).join("");
}
function renderToday(){
  const now = new Date(), today = startOfDay(now);
  const evs = eventsOn(today).filter(e => e.allDay || e.end > now).slice(0,4);
  const due = S.tasks.filter(t => !t.done && t.due && t.due <= ymd(today));
  const {start, end} = range();
  let h = `<div class="label">Today</div><div class="big">${now.toLocaleDateString([], {weekday:"long"})}</div><div class="sub">${now.toLocaleDateString([], {month:"long", day:"numeric", year:"numeric"})}</div>
    <span class="status${isOpenNow()?" open":""}">${isOpenNow() ? "Open for appointments" : isWorkDay(now) && now.getHours() < HOURS.open ? "Opens at " + openLabel(HOURS.open) : "Closed"}</span>
    <div class="hours">${esc(HOURS_TEXT)}</div><div class="nextup">`;
  if (S.gStatus === "ok" && (today < start || today >= end)) h += `<button class="btn" data-goday="${ymd(today)}">Show today’s schedule</button>`;
  else if (evs.length) evs.forEach(e => h += `<button class="arow" style="--ev:${calColor(e.calId)}" data-ev="${esc(e.calId)}|${esc(e.id)}"><span class="t">${e.allDay?"All day":fTime(e.start)}</span><span class="n">${esc(e.title)}</span></button>`);
  else if (S.gStatus === "ok" && !S.loading) h += `<div class="empty">Nothing else on the calendar today.</div>`;
  if (due.length) h += `<div class="empty" style="color:var(--accent-ink)">${due.length} reminder${due.length>1?"s":""} due today or overdue</div>`;
  $("#todayCard").innerHTML = h + `</div>`;
}
function renderReminders(){
  const el = $("#remList");
  if (S.tasksError){ el.innerHTML = `<p class="empty">${esc(S.tasksError)}</p>`; return; }
  if (!S.tasksReady){ el.innerHTML = `<p class="empty">Loading reminders…</p>`; return; }
  const todayK = ymd(new Date());
  const open = S.tasks.filter(t => !t.done), done = S.tasks.filter(t => t.done).sort((a,b) => String(b.completedAt||"").localeCompare(String(a.completedAt||"")));
  const byDue = (a,b) => (a.due||"9999").localeCompare(b.due||"9999") || a.title.localeCompare(b.title);
  const groups = [["overdue","Overdue", open.filter(t => t.due && t.due < todayK)], ["today","Today", open.filter(t => t.due === todayK)], ["up","Coming up", open.filter(t => t.due && t.due > todayK)], ["none","Anytime", open.filter(t => !t.due)]];
  if (!S.tasks.length){ el.innerHTML = `<p class="empty">No reminders yet. Add one above.</p>`; return; }
  const item = t => {
    const when = t.due ? (t.due === todayK ? "Today" : parseYmd(t.due).toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"})) : "";
    return `<div class="rem-item${t.done?" done":""}"><input type="checkbox" ${t.done?"checked":""} data-rtoggle="${esc(t.id)}" aria-label="Mark done">
      <div style="min-width:0"><div class="tt">${esc(t.title)}</div><div class="meta">${when?`<span>${esc(when)}</span>`:""}</div></div>
      <div class="acts">${t.due && !t.done && S.gStatus==="ok" ?`<button class="mini" data-rgoogle="${esc(t.id)}" title="Put on your Work calendar so your phone alerts you">Alert me</button>`:""}<button class="mini" data-rdel="${esc(t.id)}" aria-label="Delete">✕</button></div></div>`;
  };
  let h = "";
  groups.forEach(([k,label,list]) => { if (list.length) h += `<div class="rgroup ${k}"><div class="label"><span>${label}</span><span>${list.length}</span></div>${list.sort(byDue).map(item).join("")}</div>`; });
  if (!open.length) h += `<p class="empty">All caught up.</p>`;
  if (done.length) h += `<details class="done-list"><summary>Completed (${done.length})</summary>${done.slice(0,30).map(item).join("")}</details>`;
  el.innerHTML = h;
}
function renderBooking(){
  const el = $("#bookBody");
  if (S.gStatus !== "ok"){ el.innerHTML = `<p class="empty">Connect Google Calendar to set this up.</p>`; return; }
  if (S.bookingUrl){
    el.innerHTML = `<p class="note" style="margin:0 0 8px">Send clients this link. They can only pick open times ${esc(HOURS_TEXT)}.</p>
      <div class="linkbox" id="bookLink">${esc(S.bookingUrl)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="btn primary" id="bookCopy">Copy link</button><a class="btn" href="${esc(S.bookingUrl)}" target="_blank" rel="noopener">Preview</a><button class="btn ghost" id="bookEdit">Change</button></div>`;
    $("#bookCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(S.bookingUrl); toast("Booking link copied"); }
      catch { const r = document.createRange(); r.selectNodeContents($("#bookLink")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Link selected — copy it with Ctrl/⌘ C"); }
    });
    $("#bookEdit").addEventListener("click", showBookingSetup);
  } else {
    el.innerHTML = `<p class="note" style="margin:0 0 8px">Give clients a Google booking page so they can schedule themselves, only ${esc(HOURS_TEXT)}.</p><button class="btn primary" id="bookSetup">Set up booking page</button>`;
    $("#bookSetup").addEventListener("click", showBookingSetup);
  }
}
function renderAll(){ renderView(); renderCals(); renderToday(); renderReminders(); renderBooking(); renderBanner(); renderSync(); }

/* ---------- event detail & editor ---------- */
const findEvent = key => { const i = key.indexOf("|"); const cal = key.slice(0,i), id = key.slice(i+1); return S.events.find(e => e.calId === cal && e.id === id); };
const findTask = id => S.tasks.find(t => t.id === id);
const remLabel = r => r === "default" ? "Calendar default" : r === "none" ? "None" : (+r >= 1440 ? `${+r/1440} day before` : +r >= 60 ? `${+r/60} hr before` : +r === 0 ? "At start" : `${r} min before`);

function showEvent(ev){
  const cal = calById(ev.calId), ro = !cal || cal.readOnly || cal.holiday;
  const when = ev.allDay ? (sameDay(ev.start, addDays(ev.end,-1)) ? fLong(ev.start) : `${fLong(ev.start)} – ${fLong(addDays(ev.end,-1))}`) : `${fLong(ev.start)} · ${fTime(ev.start)} – ${fTime(ev.end)}`;
  const notes = ev.description ? ev.description.replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g," ") : "";
  openModal(`<header><span style="width:12px;height:12px;border-radius:50%;background:${calColor(ev.calId)}"></span><h3>${esc(ev.title)}</h3><button class="btn ghost" data-close aria-label="Close">✕</button></header>
    <div class="body detail"><dl><dt>When</dt><dd>${esc(when)}</dd>${ev.location?`<dt>Where</dt><dd>${esc(ev.location)}</dd>`:""}<dt>Calendar</dt><dd>${esc(cal?.name || "")}</dd><dt>Alert</dt><dd>${esc(remLabel(ev.reminders))}</dd>${notes?`<dt>Notes</dt><dd>${esc(notes)}</dd>`:""}</dl>
    ${ev.recurring?`<p class="note">This is a repeating event. Edits here change only this occurrence.</p>`:""}</div>
    <div class="foot">${ev.link?`<a class="btn ghost" href="${esc(ev.link)}" target="_blank" rel="noopener">Open in Google</a>`:""}<span class="sp"></span>${ro?`<span class="note">View only</span>`:`<button class="btn" id="edit">Edit</button>`}</div>`,
    m => { const b = m.querySelector("#edit"); b && b.addEventListener("click", () => editEvent(ev)); });
}
function editEvent(ev, preset){
  const isNew = !ev, cals = writableCals();
  if (!cals.length){ toast("No calendar you can add appointments to."); return; }
  let s, e, allDay = false;
  if (ev){ s = ev.start; e = ev.end; allDay = ev.allDay; if (allDay) e = addDays(e,-1); }
  else {
    const base = preset?.day ? parseYmd(preset.day) : new Date(S.cursor), now = new Date();
    if (preset?.hour != null){ s = new Date(base); s.setHours(preset.hour, 0); }
    else if (preset?.day && !sameDay(base, now)){ s = new Date(base); s.setHours(Math.max(HOURS.open, 9), 0); }
    else s = nextOpenSlot(sameDay(base, now) || base < now ? now : base);
    e = new Date(s.getTime() + 3600e3);
    const close = new Date(s); close.setHours(HOURS.close, 0, 0, 0);
    if (e > close) e = close;
  }
  const t = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const rc = ev ? String(ev.reminders) : "30";
  const calSel = ev ? ev.calId : S.workCal;
  const opts = [["default","Calendar default"],["none","No alert"],["0","At start"],["10","10 min before"],["30","30 min before"],["60","1 hour before"],["1440","1 day before"]];
  openModal(`<header><h3>${isNew?"New appointment":"Edit appointment"}</h3><button class="btn ghost" data-close aria-label="Close">✕</button></header>
  <form id="evForm" autocomplete="off"><div class="body">
    <div class="f"><label for="evTitle">Title</label><input class="field" id="evTitle" required maxlength="300" value="${esc(ev?.title && ev.title!=="(No title)"?ev.title:"")}" placeholder="Pre-approval call — Ramirez"></div>
    <div class="frow"><div class="f"><label for="evDate">Date</label><input class="field" type="date" id="evDate" required value="${ymd(s)}"></div>
      <div class="f" id="endDateWrap"><label for="evEndDate">Ends</label><input class="field" type="date" id="evEndDate" value="${ymd(e)}"></div></div>
    <label class="check"><input type="checkbox" id="evAll" ${allDay?"checked":""}> All day</label>
    <div class="frow" id="timeRow"><div class="f"><label for="evStart">Starts</label><input class="field" type="time" id="evStart" step="900" value="${t(s)}"></div><div class="f"><label for="evEnd">Ends</label><input class="field" type="time" id="evEnd" step="900" value="${t(e)}"></div></div>
    <p class="note" style="margin:-4px 0 0">Business hours: ${esc(HOURS_TEXT)}</p>
    <div class="frow"><div class="f"><label for="evCal">Calendar</label><select class="field" id="evCal" ${isNew?"":"disabled"}>${cals.map(c=>`<option value="${esc(c.id)}" ${c.id===calSel?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div>
      <div class="f"><label for="evRem">Alert</label><select class="field" id="evRem">${opts.map(([v,l])=>`<option value="${v}" ${v===rc?"selected":""}>${l}</option>`).join("")}${!opts.some(o=>o[0]===rc)?`<option value="${esc(rc)}" selected>${esc(remLabel(rc))}</option>`:""}</select></div></div>
    <div class="f"><label for="evLoc">Location or call link</label><input class="field" id="evLoc" maxlength="300" value="${esc(ev?.location||"")}"></div>
    <div class="f"><label for="evDesc">Notes</label><textarea class="field" id="evDesc" rows="3">${esc((ev?.description||"").replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g,""))}</textarea></div>
    ${ev?.recurring?`<p class="note">Repeating event: this changes only this occurrence.</p>`:""}
    <p class="err" id="evErr" hidden></p>
  </div>
  <div class="foot">${isNew?"":`<button type="button" class="btn danger" id="evDel">Delete</button>`}<span class="sp"></span><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary" id="evSave">${isNew?"Add to Google":"Save"}</button></div></form>`,
  m => {
    const sync = () => { const a = m.querySelector("#evAll").checked; m.querySelector("#timeRow").hidden = a; m.querySelector("#endDateWrap").hidden = !a; };
    m.querySelector("#evAll").addEventListener("change", sync); sync();
    m.querySelector("#evForm").addEventListener("submit", x => { x.preventDefault(); saveEvent(m, ev); });
    const del = m.querySelector("#evDel");
    del && del.addEventListener("click", () => {
      if (del.dataset.arm){ removeEvent(m, ev); return; }
      del.dataset.arm = 1; del.textContent = "Click again to delete"; setTimeout(()=>{ if (del.isConnected){ del.dataset.arm=""; del.textContent="Delete"; } }, 4000);
    });
  });
}
async function saveEvent(m, ev){
  const err = m.querySelector("#evErr"), btn = m.querySelector("#evSave");
  const title = m.querySelector("#evTitle").value.trim(), date = m.querySelector("#evDate").value, all = m.querySelector("#evAll").checked;
  const fail = msg => { err.hidden = false; err.textContent = msg; };
  if (!title) return fail("Give the appointment a title.");
  if (!date) return fail("Pick a date.");
  let s, e;
  if (all){ s = parseYmd(date); const ed = m.querySelector("#evEndDate").value || date; e = addDays(parseYmd(ed < date ? date : ed), 1); }
  else {
    s = parseYmd(date); const [h1,m1] = (m.querySelector("#evStart").value||"0:0").split(":").map(Number); s.setHours(h1,m1);
    e = parseYmd(date); const [h2,m2] = (m.querySelector("#evEnd").value||"0:0").split(":").map(Number); e.setHours(h2,m2);
    if (e <= s) return fail("The end time has to be after the start time.");
  }
  const outside = withinHours(s, e, all); if (outside) return fail(outside);
  const body = { title, allDay:all, start: all ? ymd(s) : s.toISOString(), end: all ? ymd(e) : e.toISOString(),
    location: m.querySelector("#evLoc").value.trim(), description: m.querySelector("#evDesc").value, reminder: m.querySelector("#evRem").value };
  btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Saving`; err.hidden = true;
  try {
    if (ev) await api(`/api/events/${encodeURIComponent(ev.id)}?cal=${encodeURIComponent(ev.calId)}`, {method:"PATCH", body});
    else await api("/api/events", {method:"POST", body:{...body, calendarId:m.querySelector("#evCal").value}});
    closeModal(); toast(ev ? "Appointment updated" : "Added to Google Calendar");
    S.cursor = startOfDay(s); loadEvents();
  } catch(x){
    fail(x.status === 0 || x.status >= 500 ? "Google didn’t confirm the save. Press Refresh to check before trying again." : x.message);
    btn.disabled = false; btn.textContent = ev ? "Save" : "Add to Google";
  }
}
async function removeEvent(m, ev){
  const del = m.querySelector("#evDel"); del.disabled = true; del.innerHTML = `<span class="spin"></span> Deleting`;
  try { await api(`/api/events/${encodeURIComponent(ev.id)}?cal=${encodeURIComponent(ev.calId)}`, {method:"DELETE"}); closeModal(); toast("Appointment deleted"); loadEvents(); }
  catch(x){ const err = m.querySelector("#evErr"); err.hidden = false; err.textContent = x.message; del.disabled = false; del.textContent = "Delete"; }
}
function showReminder(t){
  openModal(`<header><h3>${esc(t.title)}</h3><button class="btn ghost" data-close aria-label="Close">✕</button></header>
  <div class="body detail"><dl><dt>Due</dt><dd>${t.due ? esc(fLong(parseYmd(t.due))) : "Anytime"}</dd><dt>Status</dt><dd>${t.done?"Done":"Open"}</dd></dl></div>
  <div class="foot"><button class="btn danger" id="rmDel">Delete</button><span class="sp"></span><button class="btn primary" id="rmToggle">${t.done?"Mark not done":"Mark done"}</button></div>`,
  m => { m.querySelector("#rmToggle").addEventListener("click", () => { toggleReminder(t); closeModal(); });
         m.querySelector("#rmDel").addEventListener("click", () => { deleteReminder(t); closeModal(); }); });
}

/* ---------- booking & Apple guides ---------- */
function showBookingSetup(){
  const days = HOURS_TEXT;
  openModal(`<header><h3>Set up client booking</h3><button class="btn ghost" data-close aria-label="Close">✕</button></header>
  <form id="bookForm"><div class="body">
    <p class="note" style="margin:0">Google Calendar’s Appointment Schedule makes a booking page that only offers your open times. Do this on a computer, once.</p>
    <ol class="steps">
      <li>Open <a href="https://calendar.google.com" target="_blank" rel="noopener">Google Calendar</a>, click <b>Create</b>, then <b>Appointment schedule</b>.</li>
      <li>Name it (for example “Mortgage consultation”) and pick a length, like 30 minutes.</li>
      <li>Under <b>General availability</b>, choose <b>Repeats weekly</b> and set <b>${esc(days)}</b>. Mark every other day <b>Unavailable</b>.</li>
      <li>If Google asks which calendar bookings go to, pick <b>Work</b>.</li>
      <li>Under <b>Calendars checked for availability</b>, keep your main calendar and Work checked so clients can’t book over anything already scheduled.</li>
      <li>Click <b>Save</b>, then <b>Share</b> → <b>Copy link</b>, and paste it below.</li>
    </ol>
    <div class="f"><label for="bookUrl">Booking page link</label><input class="field" id="bookUrl" inputmode="url" placeholder="https://calendar.app.google/…" value="${esc(S.bookingUrl||"")}"></div>
    <p class="err" id="bookErr" hidden></p>
  </div>
  <div class="foot">${S.bookingUrl?`<button type="button" class="btn danger" id="bookClear">Remove link</button>`:""}<span class="sp"></span><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary" id="bookSave">Save link</button></div></form>`,
  m => {
    const save = async url => {
      const err = m.querySelector("#bookErr");
      try { const r = await api("/api/settings", {method:"PUT", body:{bookingUrl:url}}); S.bookingUrl = r.bookingUrl; closeModal(); renderBooking(); toast(url ? "Booking link saved" : "Booking link removed"); }
      catch(x){ err.hidden = false; err.textContent = x.message; }
    };
    m.querySelector("#bookForm").addEventListener("submit", x => { x.preventDefault(); save(m.querySelector("#bookUrl").value.trim() || null); });
    const c = m.querySelector("#bookClear"); c && c.addEventListener("click", () => save(null));
  });
}
function showApple(){
  openModal(`<header><h3>Bring in Apple Calendar</h3><button class="btn ghost" data-close aria-label="Close">✕</button></header>
  <div class="body">
    <p class="note" style="margin:0">Apple doesn’t let websites read iCloud calendars directly, so this site reaches them through your Google account. Do this once per Apple calendar.</p>
    <div class="label">Apple calendar → this site</div>
    <ol class="steps">
      <li>On your iPhone, open <b>Calendar</b>, tap <b>Calendars</b>, then the <b>ⓘ</b> next to the calendar you want.</li>
      <li>Turn on <b>Public Calendar</b>, tap <b>Share Link…</b>, and copy it. Anyone with that link can see that calendar, so keep it private.</li>
      <li>On a computer, open <a href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noopener">Google Calendar → Add calendar from URL</a>.</li>
      <li>Paste the link. If it starts with <span style="font-family:var(--mono)">webcal://</span>, change that to <span style="font-family:var(--mono)">https://</span>. Click <b>Add calendar</b>.</li>
      <li>Come back here and press <b>Refresh</b>. Turn it on under Calendars. It’s view-only.</li>
    </ol>
    <p class="note" style="margin:0">Google refreshes subscribed calendars on its own schedule, usually every few hours.</p>
    <div class="label">This site → your iPhone</div>
    <ol class="steps">
      <li>On your iPhone, go to <b>Settings → Apps → Calendar → Calendar Accounts → Add Account → Google</b> and sign in with the same Google account.</li>
      <li>Your Work calendar, and everything you add here, then shows in Apple Calendar with its alerts.</li>
    </ol>
  </div>
  <div class="foot"><span class="sp"></span><button class="btn primary" data-close>Got it</button></div>`);
}

/* ---------- interactions ---------- */
function setView(v){ S.view = v; store.set("view", v); renderView(); loadEvents(); }
function shift(dir){
  const c = S.cursor;
  if (S.view === "month") S.cursor = new Date(c.getFullYear(), c.getMonth()+dir, 1);
  else if (S.view === "week") S.cursor = addDays(c, 7*dir);
  else if (S.view === "agenda") S.cursor = addDays(c, 14*dir);
  else S.cursor = addDays(c, dir);
  renderView(); loadEvents();
}
$("#prev").addEventListener("click", () => shift(-1));
$("#next").addEventListener("click", () => shift(1));
$("#todayBtn").addEventListener("click", () => { S.cursor = startOfDay(new Date()); renderView(); loadEvents(); });
$("#viewSeg").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); b && setView(b.dataset.v); });
$("#newEvent").addEventListener("click", () => { if (S.gStatus !== "ok"){ toast("Connect Google Calendar to add appointments."); return; } editEvent(null); });
$("#refresh").addEventListener("click", () => boot());
$("#appleBtn").addEventListener("click", showApple);
$("#remForm").addEventListener("submit", addReminder);
$("#cals").addEventListener("change", e => {
  const id = e.target.dataset.cal; if (!id) return;
  e.target.checked ? S.hidden.delete(id) : S.hidden.add(id); store.set("hidden", [...S.hidden]); loadEvents();
});
document.addEventListener("click", e => {
  const evb = e.target.closest("[data-ev]"); if (evb){ e.stopPropagation(); const ev = findEvent(evb.dataset.ev); ev && showEvent(ev); return; }
  const rb = e.target.closest("[data-rem]"); if (rb){ e.stopPropagation(); const t = findTask(rb.dataset.rem); t && showReminder(t); return; }
  const go = e.target.closest("[data-goday]"); if (go){ e.stopPropagation(); S.cursor = parseYmd(go.dataset.goday); setView("day"); return; }
  const tg = e.target.closest("[data-rtoggle]"); if (tg){ const t = findTask(tg.dataset.rtoggle); t && toggleReminder(t); return; }
  const d = e.target.closest("[data-rdel]"); if (d){ const t = findTask(d.dataset.rdel); t && deleteReminder(t); return; }
  const g = e.target.closest("[data-rgoogle]"); if (g){ const t = findTask(g.dataset.rgoogle); if (t){ g.disabled = true; reminderToGoogle(t); } return; }
  const cell = e.target.closest(".cell[data-day]");
  if (cell){ if (S.gStatus !== "ok") return; if (!isWorkDay(parseYmd(cell.dataset.day))){ toast(DAY_OFF); return; } editEvent(null, {day:cell.dataset.day}); return; }
  const col = e.target.closest(".tg-col[data-slot]");
  if (col && e.target === col && S.gStatus === "ok"){
    const hr = Math.min(23, Math.floor((e.clientY - col.getBoundingClientRect().top) / hourPx()));
    if (!isWorkDay(parseYmd(col.dataset.slot))){ toast(DAY_OFF); return; }
    if (hr < HOURS.open || hr >= HOURS.close){ toast(`Outside business hours (${HOURS_TEXT}).`); return; }
    editEvent(null, {day:col.dataset.slot, hour:hr});
  }
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".cell[data-day]")){ e.preventDefault(); if (S.gStatus==="ok" && isWorkDay(parseYmd(e.target.dataset.day))) editEvent(null, {day:e.target.dataset.day}); }
});
setInterval(() => { if (S.view === "week" || S.view === "day") renderView(); renderToday(); }, 60000);

/* ---------- boot ---------- */
async function boot(){
  S.gStatus = "connecting"; S.gError = null; renderAll();
  try { await loadCalendars(); S.gStatus = "ok"; renderAll(); loadTasks(); await loadEvents(); }
  catch(e){ if (e.status !== 401){ S.gStatus = "error"; S.gError = {message:e.message}; } S.tasksReady = true; renderAll(); }
}
$("#tz").textContent = TZ.replace(/_/g," ");
$("#whoami").innerHTML = `Signed in as <b>${esc(CFG.user.name)}</b> · <a href="/api/auth/signout" style="color:inherit">Sign out</a>`;
if (CFG.needsReauth) showReauth("Your Google connection expired. Sign in again to keep your calendar in sync.");
else boot();
})();
