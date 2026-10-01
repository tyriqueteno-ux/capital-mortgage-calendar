import { requireGoogle } from "@/lib/auth";
import { g, ensureTaskList, tasksUrl, errorResponse } from "@/lib/google";

export const dynamic = "force-dynamic";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const norm = t => ({
  id: t.id,
  title: t.title || "",
  notes: t.notes || "",
  due: t.due ? t.due.slice(0, 10) : null,
  done: t.status === "completed",
  completedAt: t.completed || null,
  updated: t.updated,
});

// GET /api/tasks — reminders from the "Capital Mortgage" list in Google Tasks
export async function GET(req) {
  const a = await requireGoogle(req);
  if (a.error) return a.error;
  try {
    const listId = await ensureTaskList(a.accessToken);
    const out = [];
    let pageToken, pages = 0;
    do {
      const r = await g(a.accessToken, tasksUrl(listId), { query: { maxResults: 100, showCompleted: true, showHidden: true, pageToken } });
      out.push(...(r.items || []).filter(t => !t.deleted && t.title));
      pageToken = r.nextPageToken; pages++;
    } while (pageToken && pages < 5);
    return Response.json({ tasks: out.map(norm) });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/tasks { title, due?, notes? }
export async function POST(req) {
  const a = await requireGoogle(req);
  if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || "").trim().slice(0, 1024);
  if (!title) return Response.json({ error: "invalid", message: "Type what you need to remember." }, { status: 400 });
  if (b.due && !DATE_RE.test(b.due)) return Response.json({ error: "invalid", message: "That date isn’t valid." }, { status: 400 });
  try {
    const listId = await ensureTaskList(a.accessToken);
    const t = await g(a.accessToken, tasksUrl(listId), {
      method: "POST",
      body: { title, notes: b.notes ? String(b.notes).slice(0, 8000) : undefined, due: b.due ? `${b.due}T00:00:00.000Z` : undefined },
    });
    return Response.json({ task: norm(t) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
