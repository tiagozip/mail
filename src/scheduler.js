import { sendMessage } from "./send.js";
import { deleteMessageRow, recordChanges } from "./store.js";
import { now } from "./util.js";

export async function processScheduledSends(env) {
  const due = await env.DB.prepare(
    "SELECT * FROM scheduled_sends WHERE send_at <= ? ORDER BY send_at LIMIT 50",
  )
    .bind(now())
    .all();
  for (const row of due.results || []) {
    await env.DB.prepare("DELETE FROM scheduled_sends WHERE id = ?").bind(row.id).run();
    const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(row.user_id).first();
    if (!user) continue;
    try {
      const payload = JSON.parse(row.payload_json);
      await sendMessage(env, user, payload);
      if (payload.draftId) await deleteMessageRow(env, user.id, payload.draftId);
    } catch (e) {
      console.error("scheduled send failed", row.id, e?.stack || e);
    }
  }
}

export async function wakeSnoozed(env) {
  const t = now();
  const due = await env.DB.prepare(
    "SELECT id, user_id FROM messages WHERE snooze_until IS NOT NULL AND snooze_until <= ?",
  )
    .bind(t)
    .all();
  const rows = due.results || [];
  if (!rows.length) return;
  await env.DB.prepare(
    "UPDATE messages SET snooze_until = NULL, date = ?, received_at = ?, is_read = 0 WHERE snooze_until IS NOT NULL AND snooze_until <= ?",
  )
    .bind(t, t, t)
    .run();
  const byUser = {};
  for (const r of rows) (byUser[r.user_id] ||= []).push(r.id);
  for (const [uid, ids] of Object.entries(byUser)) await recordChanges(env, uid, ids, "upsert");
}
