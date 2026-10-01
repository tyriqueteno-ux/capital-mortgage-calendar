// Thin wrappers around the Google Calendar and Tasks REST APIs.
import team from "../config/team";

// The *_BASE overrides exist only for local testing against a mock.
const CAL = process.env.GCAL_BASE || "https://www.googleapis.com/calendar/v3";
const TASKS = process.env.GTASKS_BASE || "https://tasks.googleapis.com/tasks/v1";

export class GoogleError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Google returned ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function g(accessToken, url, { method = "GET", body, query } = {}) {
  const u = new URL(url);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  const res = await fetch(u, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new GoogleError(res.status, data);
  return data;
}

export function errorResponse(e) {
  if (e instanceof GoogleError) {
    const status = e.status === 401 ? 401 : e.status === 403 ? 403 : e.status === 404 ? 404 : e.status >= 500 ? 502 : 400;
    const message =
      e.status === 401 ? "Your Google connection expired. Sign out and sign back in." :
      e.status === 403 ? "Google didn’t allow that. You may need to sign out and sign back in to grant calendar access." :
      e.status === 404 ? "That item no longer exists in Google Calendar." :
      e.status >= 500 ? "Google Calendar didn’t answer. Try again in a moment." :
      e.message;
    return Response.json({ error: e.status === 401 ? "reauth" : "google", message }, { status });
  }
  console.error(e);
  return Response.json({ error: "server", message: "Something went wrong on our side. Try again." }, { status: 500 });
}

/* ---------- calendars ---------- */
export async function listCalendars(token) {
  const out = [];
  let pageToken;
  do {
    const r = await g(token, `${CAL}/users/me/calendarList`, { query: { maxResults: 250, pageToken } });
    out.push(...(r.items || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

const WORK_MARK = "capital-mortgage-work";

// Finds the person's Work calendar, creating it the first time they sign in.
export async function ensureWorkCalendar(token, calendars) {
  const name = team.workCalendarName.toLowerCase();
  let work = calendars.find(c => (c.description || "").includes(WORK_MARK))
    || calendars.find(c => (c.summaryOverride || c.summary || "").trim().toLowerCase() === name && c.accessRole === "owner");
  if (work) return { work, created: false };
  const created = await g(token, `${CAL}/calendars`, {
    method: "POST",
    body: { summary: team.workCalendarName, timeZone: team.timeZone, description: `${team.companyName} appointments.\n[${WORK_MARK}]` },
  });
  return { work: { ...created, accessRole: "owner", primary: false }, created: true };
}

// The booking link is kept in the Work calendar's own description, so it
// lives in each person's Google account and needs no separate database.
const BOOK_RE = /\nBooking page: (\S+)/;
export function readBookingUrl(cal) {
  const m = (cal?.description || "").match(BOOK_RE);
  return m ? m[1] : null;
}
export async function writeBookingUrl(token, calId, url) {
  const cal = await g(token, `${CAL}/calendars/${encodeURIComponent(calId)}`);
  let desc = (cal.description || "").replace(BOOK_RE, "");
  if (!desc.includes(WORK_MARK)) desc += `\n[${WORK_MARK}]`;
  if (url) desc += `\nBooking page: ${url}`;
  await g(token, `${CAL}/calendars/${encodeURIComponent(calId)}`, { method: "PATCH", body: { description: desc } });
}

/* ---------- events ---------- */
export const calUrl = id => `${CAL}/calendars/${encodeURIComponent(id)}/events`;

/* ---------- tasks (reminders) ---------- */
export async function ensureTaskList(token) {
  const r = await g(token, `${TASKS}/users/@me/lists`, { query: { maxResults: 100 } });
  const found = (r.items || []).find(l => l.title === team.remindersListName);
  if (found) return found.id;
  const created = await g(token, `${TASKS}/users/@me/lists`, { method: "POST", body: { title: team.remindersListName } });
  return created.id;
}
export const tasksUrl = listId => `${TASKS}/lists/${encodeURIComponent(listId)}/tasks`;
