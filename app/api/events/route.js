import { requireGoogle } from "@/lib/auth";
import { g, calUrl, errorResponse } from "@/lib/google";
import { normalize, buildEventBody } from "@/lib/events";

export const dynamic = "force-dynamic";

// GET /api/events?start=ISO&end=ISO&cal=<id>&cal=<id>
export async function GET(req) {
  const a = await requireGoogle(req);
  if (a.error) return a.error;
  const sp = new URL(req.url).searchParams;
  const start = sp.get("start"), end = sp.get("end");
  const cals = sp.getAll("cal").slice(0, 25);
  if (!start || !end || isNaN(new Date(start)) || isNaN(new Date(end))) {
    return Response.json({ error: "invalid", message: "Missing date range." }, { status: 400 });
  }
  const events = [], failed = [];
  let reauth = false;
  await Promise.all(cals.map(async id => {
    try {
      let pageToken, pages = 0;
      do {
        const r = await g(a.accessToken, calUrl(id), {
          query: { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString(), singleEvents: true, orderBy: "startTime", maxResults: 250, pageToken },
        });
        for (const e of r.items || []) if (e.status !== "cancelled") events.push(normalize(e, id));
        pageToken = r.nextPageToken; pages++;
      } while (pageToken && pages < 8);
    } catch (e) {
      if (e.status === 401) reauth = true;
      failed.push(id);
    }
  }));
  if (reauth) return Response.json({ error: "reauth", message: "Your Google connection expired. Sign out and sign back in." }, { status: 401 });
  if (failed.length === cals.length && cals.length) {
    return Response.json({ error: "google", message: "Couldn’t load your calendars from Google. Try again in a moment." }, { status: 502 });
  }
  return Response.json({ events, failed });
}

// POST /api/events  { calendarId, title, allDay, start, end, location, description, reminder, free }
export async function POST(req) {
  const a = await requireGoogle(req);
  if (a.error) return a.error;
  const input = await req.json().catch(() => ({}));
  if (!input.calendarId) return Response.json({ error: "invalid", message: "Pick a calendar." }, { status: 400 });
  const { body, error } = buildEventBody(input);
  if (error) return Response.json({ error: "hours", message: error }, { status: 400 });
  try {
    const created = await g(a.accessToken, calUrl(input.calendarId), { method: "POST", body, query: { sendUpdates: "none" } });
    return Response.json({ event: normalize(created, input.calendarId) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
