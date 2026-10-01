import { requireGoogle } from "@/lib/auth";
import { listCalendars, ensureWorkCalendar, writeBookingUrl, errorResponse } from "@/lib/google";

export const dynamic = "force-dynamic";

function validBookingUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && (/(^|\.)google\.com$/.test(u.hostname) || u.hostname === "calendar.app.google");
  } catch { return false; }
}

export async function PUT(req) {
  const a = await requireGoogle(req);
  if (a.error) return a.error;
  const body = await req.json().catch(() => ({}));
  const url = body.bookingUrl ? String(body.bookingUrl).trim() : null;
  if (url && !validBookingUrl(url)) {
    return Response.json({ error: "invalid", message: "Paste the link Google gives you under Share. It starts with https://calendar.app.google/ or https://calendar.google.com/." }, { status: 400 });
  }
  try {
    const { work } = await ensureWorkCalendar(a.accessToken, await listCalendars(a.accessToken));
    await writeBookingUrl(a.accessToken, work.id, url);
    return Response.json({ bookingUrl: url });
  } catch (e) {
    return errorResponse(e);
  }
}
