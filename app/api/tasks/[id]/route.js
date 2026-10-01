import { requireGoogle } from "@/lib/auth";
import { g, ensureTaskList, tasksUrl, errorResponse } from "@/lib/google";

export const dynamic = "force-dynamic";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// PATCH /api/tasks/:id { done?, title?, due?, notes? }
export async function PATCH(req, { params }) {
  const a = await requireGoogle(req);
  if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  const body = {};
  if (b.done !== undefined) { body.status = b.done ? "completed" : "needsAction"; if (!b.done) body.completed = null; }
  if (b.title !== undefined) { const t = String(b.title).trim(); if (!t) return Response.json({ error: "invalid", message: "A reminder needs some text." }, { status: 400 }); body.title = t.slice(0, 1024); }
  if (b.notes !== undefined) body.notes = String(b.notes).slice(0, 8000);
  if (b.due !== undefined) {
    if (b.due && !DATE_RE.test(b.due)) return Response.json({ error: "invalid", message: "That date isn’t valid." }, { status: 400 });
    body.due = b.due ? `${b.due}T00:00:00.000Z` : null;
  }
  try {
    const listId = await ensureTaskList(a.accessToken);
    const t = await g(a.accessToken, `${tasksUrl(listId)}/${encodeURIComponent(params.id)}`, { method: "PATCH", body });
    return Response.json({ task: { id: t.id, title: t.title, notes: t.notes || "", due: t.due ? t.due.slice(0, 10) : null, done: t.status === "completed", completedAt: t.completed || null } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req, { params }) {
  const a = await requireGoogle(req);
  if (a.error) return a.error;
  try {
    const listId = await ensureTaskList(a.accessToken);
    await g(a.accessToken, `${tasksUrl(listId)}/${encodeURIComponent(params.id)}`, { method: "DELETE" });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e.status === 404) return new Response(null, { status: 204 });
    return errorResponse(e);
  }
}
