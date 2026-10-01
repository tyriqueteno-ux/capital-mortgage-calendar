import { requireGoogle } from "@/lib/auth";
import { listCalendars, ensureWorkCalendar, readBookingUrl, errorResponse } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const a = await requireGoogle(req);
  if (a.error) return a.error;
  try {
    let cals = await listCalendars(a.accessToken);
    const { work, created } = await ensureWorkCalendar(a.accessToken, cals);
    if (created) cals = [...cals, work];
    const calendars = cals
      .filter(c => !c.deleted)
      .map(c => ({
        id: c.id,
        name: c.id === work.id ? "Work" : c.primary ? "Personal (main)" : (c.summaryOverride || c.summary || c.id),
        primary: !!c.primary,
        isWork: c.id === work.id,
        readOnly: !["owner", "writer"].includes(c.accessRole),
        holiday: /#holiday@/.test(c.id),
      }))
      .sort((x, y) => (y.isWork - x.isWork) || (y.primary - x.primary) || (x.holiday - y.holiday) || x.name.localeCompare(y.name));
    return Response.json({ calendars, workId: work.id, bookingUrl: readBookingUrl(work), createdWork: created });
  } catch (e) {
    return errorResponse(e);
  }
}
