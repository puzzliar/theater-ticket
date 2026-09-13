import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/constants";
import { linePush } from "@/lib/line";
import { sendEmail } from "@/lib/email";
import type { MemberRow } from "./types";

// メンバーへの通知。LINE 連携済みなら LINE、なければメール、どちらもなければログのみ。
// dedupeKey の一意制約で二重送信を防ぐ(要件 5.9)。
export async function notifyMember(
  member: Pick<MemberRow, "id" | "name" | "line_user_id" | "email">,
  dedupeKey: string,
  text: string,
  subject = "【稽古管理】お知らせ",
): Promise<"line" | "email" | "none" | "duplicate"> {
  const admin = supabaseAdmin();
  const channel: "line" | "email" | "none" = member.line_user_id ? "line" : member.email ? "email" : "none";

  // 先にログを確保(重複なら送らない)
  const { error } = await admin
    .from("rh_notifications")
    .insert({ org_id: ORG_ID, member_id: member.id, channel, dedupe_key: dedupeKey, payload: { text } });
  if (error) return "duplicate";

  let ok = true;
  if (channel === "line") ok = await linePush(member.line_user_id!, text);
  else if (channel === "email") ok = await sendEmail(member.email!, subject, `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre>`);
  if (!ok) {
    // 送信失敗時はログを消して次回の再送を許す
    await admin.from("rh_notifications").delete().eq("dedupe_key", dedupeKey);
  }
  return channel;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
