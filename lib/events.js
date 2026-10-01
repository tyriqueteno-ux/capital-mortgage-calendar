// Turns the page's event form into a Google event body, enforcing business hours.
import { checkHours } from "./hours";
import team from "../config/team";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalize(e, calendarId) {
  return {
    id: e.id,
    calendarId,
    title: e.summary || "(No title)",
    allDay: !!e.start?.date,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location || "",
    description: e.description || "",
    link: e.htmlLink,
    recurring: !!e.recurringEventId,
    reminders: e.reminders?.useDefault ? "default" : (e.reminders?.overrides?.[0]?.minutes ?? "none"),
    status: e.status,
  };
}

// input: { title, allDay, start, end, location, description, reminder }
//   allDay → start/end are YYYY-MM-DD (end exclusive); otherwise ISO instants.
// Returns { body } or { error } with a plain-language message.
export function buildEventBody(input, { partial = false } = {}) {
  const body = {};
  if (!partial || input.title !== undefined) {
    const title = String(input.title || "").trim();
    if (!title) return { error: "Give the appointment a title." };
    body.summary = title.slice(0, 300);
  }
  if (!partial || input.start !== undefined) {
    if (input.allDay) {
      if (!DATE_RE.test(input.start) || !DATE_RE.test(input.end)) return { error: "Pick a start and end date." };
      const why = checkHours({ start: input.start, end: input.end, allDay: true });
      if (why) return { error: why };
      body.start = { date: input.start, dateTime: null };
      body.end = { date: input.end, dateTime: null };
    } else {
      const s = new Date(input.start), e = new Date(input.end);
      const why = checkHours({ start: s, end: e, allDay: false });
      if (why) return { error: why };
      body.start = { dateTime: s.toISOString(), timeZone: team.timeZone, date: null };
      body.end = { dateTime: e.toISOString(), timeZone: team.timeZone, date: null };
    }
  }
  if (input.location !== undefined) body.location = String(input.location).slice(0, 500);
  if (input.description !== undefined) body.description = String(input.description).slice(0, 8000);
  if (input.reminder !== undefined) {
    if (input.reminder === "default") body.reminders = { useDefault: true };
    else if (input.reminder === "none") body.reminders = { useDefault: false, overrides: [] };
    else {
      const m = Number(input.reminder);
      if (!Number.isFinite(m) || m < 0 || m > 40320) return { error: "Pick a valid alert time." };
      body.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: m }] };
    }
  }
  if (input.free) body.transparency = "transparent";
  return { body };
}
