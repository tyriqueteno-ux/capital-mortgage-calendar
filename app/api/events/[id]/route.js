import { requireGoogle } from "@/lib/auth";
import { g, calUrl, errorResponse } from "@/lib/google";
import { normalize, buildEventBody } from "@/lib/events";

export const dynamic = "force-dynamic";

const target = (req, params) => {
  const cal = new URL(req.url).searchParams.get("cal");
  return cal ? `${calUrl(cal)}/${encodeURIComponent(params.id)}` : null;
};

// PATCH /api/events/:id?cal=<calendarId>  — changes one event (one occurrence for repeating events)
export async function PATCH(req, { params }) {
  const a = await requireGoogle(req);
  if (a.error) return a.error;
  const url = target(req, params);
  if (!url) return Response.json({ error: "invalid", message: "Missing calendar." }, { status: 400 });
  const input = await req.json().catch(() => ({}));
  const { body, error } = buildEventBody(input, { partial: true });
  if (error) return Response.json({ error: "hours", message: error }, { status: 400 });
  try {
    const updated = await g(a.accessToken, url, { method: "PATCH", body, query: { sendUpdates: "none" } });
    return Response.json({ event: normalize(updated, new URL(req.url).searchParams.get("cal")) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req, { params }) {
  const a = await requireGoogle(req);
  if (a.error) return a.error;
  const url = target(req, params);
  if (!url) return Response.json({ error: "invalid", message: "Missing calendar." }, { status: 400 });
  try {
    await g(a.accessToken, url, { method: "DELETE", query: { sendUpdates: "none" } });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e.status === 410 || e.status === 404) return new Response(null, { status: 204 });
    return errorResponse(e);
  }
}
