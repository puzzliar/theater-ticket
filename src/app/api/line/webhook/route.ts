import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyLineSignature, lineReply, type LineWebhookEvent } from "@/lib/line";
import { listProfileSessions, sessionLine } from "@/lib/rehearsal/schedule";
import { applySubstitution, openSubstitutionsFor, respondToSession, RehearsalError } from "@/lib/rehearsal/core";
import { addDays, fmtDateLabel, jstDateString, jstDayRange, fmtRange } from "@/lib/rehearsal/time";
import { SITE_URL } from "@/lib/constants";

// LINE Messaging API Webhook(要件 5.8)。返信(reply)は無料なので問い合わせ型の機能はすべてここで提供する。
// 本人特定は core_identities(provider=line)。LINE ログインで登録した人は自動で紐づき、
// メール/Google で登録した人は「連携 123456」で紐づける。

const HELP = [
  "使えるメッセージ:",
  "「今日」「明日」「今週」…予定を表示",
  "「参加」「不参加」…直近の未回答の召集に回答(複数ある場合は「参加 2」のように番号指定)",
  "「入れます」…募集中の代役に応募(複数ある場合は「入れます 2」)",
  "「連携 123456」…アカウント連携(コードは Web の設定画面で発行)",
  `詳細: ${SITE_URL}/me`,
].join("\n");

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!verifyLineSignature(body, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const { events } = JSON.parse(body) as { events: LineWebhookEvent[] };
  const admin = supabaseAdmin();

  for (const ev of events ?? []) {
    if (ev.webhookEventId) {
      const { error } = await admin.from("rh_line_webhook_events").insert({ event_id: ev.webhookEventId });
      if (error) continue;
    }
    const lineUserId = ev.source?.userId;
    if (!lineUserId || !ev.replyToken) continue;
    try {
      const reply = await handle(ev, lineUserId);
      if (reply) await lineReply(ev.replyToken, reply);
    } catch (e) {
      console.error("line webhook failed", e);
      await lineReply(ev.replyToken, e instanceof RehearsalError ? e.message : "処理に失敗しました。時間をおいて再度お試しください。");
    }
  }
  return NextResponse.json({ ok: true });
}

async function handle(ev: LineWebhookEvent, lineUserId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: ident } = await admin.from("core_identities").select("profile_id, core_profiles(display_name, deleted_at)").eq("provider", "line").eq("provider_uid", lineUserId).maybeSingle();
  const prof = ident?.core_profiles as unknown as { display_name: string; deleted_at: string | null } | null;
  const profileId = ident && prof && !prof.deleted_at ? ident.profile_id : null;
  const name = prof?.display_name ?? "";

  if (ev.type === "follow") {
    return profileId
      ? `${name} さん、連携済みです。「今日」「今週」などと送ると予定を返します。`
      : `友だち追加ありがとうございます。\n${SITE_URL}/me/settings で表示される 6 桁の連携コードを「連携 123456」の形式で送信してください。(LINE でログインした方は自動で連携されます)`;
  }
  if (ev.type !== "message" || ev.message?.type !== "text") return null;
  const text = (ev.message.text ?? "").trim();

  const link = text.match(/^(?:連携|link)\s*(\d{6})$/i) ?? text.match(/^(\d{6})$/);
  if (link) {
    const { data: target } = await admin
      .from("rh_profile_settings")
      .select("profile_id, line_link_expires_at, core_profiles(display_name)")
      .eq("line_link_code", link[1])
      .maybeSingle();
    if (!target || !target.line_link_expires_at || new Date(target.line_link_expires_at).getTime() < Date.now()) {
      return "連携コードが無効か期限切れです。Web の設定画面でコードを発行し直してください。";
    }
    await admin.from("core_identities").delete().eq("provider", "line").eq("provider_uid", lineUserId);
    const { error } = await admin
      .from("core_identities")
      .upsert({ profile_id: target.profile_id, provider: "line", provider_uid: lineUserId }, { onConflict: "profile_id,provider" });
    if (error) return "連携に失敗しました。";
    await admin.from("rh_profile_settings").update({ line_link_code: null, line_link_expires_at: null }).eq("profile_id", target.profile_id);
    const tname = (target.core_profiles as unknown as { display_name: string } | null)?.display_name ?? "";
    return `${tname} さんとして連携しました。\n\n${HELP}`;
  }

  if (!profileId) {
    return `まだアカウントが連携されていません。\n${SITE_URL}/me/settings で表示される 6 桁のコードを「連携 123456」の形式で送信してください。`;
  }
  if (/^(ヘルプ|help|\?)$/i.test(text)) return HELP;

  const today = jstDateString();
  if (/^(今日|きょう|today)$/i.test(text)) return scheduleText(profileId, today, 1, "今日");
  if (/^(明日|あした|tomorrow)$/i.test(text)) return scheduleText(profileId, addDays(today, 1), 1, "明日");
  if (/^(今週|こんしゅう|week)$/i.test(text)) return scheduleText(profileId, today, 7, "今週(7日間)");

  const resp = text.match(/^(参加|不参加|未定|yes|no|maybe)\s*(\d+)?$/i);
  if (resp) {
    const map: Record<string, "yes" | "no" | "maybe"> = { 参加: "yes", yes: "yes", 不参加: "no", no: "no", 未定: "maybe", maybe: "maybe" };
    const response = map[resp[1].toLowerCase()] ?? map[resp[1]];
    const pending = (await listProfileSessions(profileId, new Date().toISOString(), new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString())).filter((s) => s.response === "pending");
    if (pending.length === 0) return "未回答の召集はありません。";
    if (pending.length > 1 && !resp[2]) {
      return `未回答の召集が${pending.length}件あります。番号を付けて返信してください(例:「${resp[1]} 1」)\n` + pending.map((s, i) => `${i + 1}. ${sessionLine(s)}`).join("\n");
    }
    const target = pending[resp[2] ? Number(resp[2]) - 1 : 0];
    if (!target) return "その番号の召集はありません。";
    await respondToSession(profileId, target.id, response);
    return `「${sessionLine(target)}」に「${resp[1]}」で回答しました。`;
  }

  const apply = text.match(/^(入れます|はいれます|入ります)\s*(\d+)?$/i);
  if (apply) {
    const open = await openSubstitutionsFor(profileId);
    if (open.length === 0) return "現在、あなたが応募できる代役募集はありません。";
    if (open.length > 1 && !apply[2]) {
      return `募集が${open.length}件あります。番号を付けて返信してください(例:「入れます 1」)\n` + open.map((o, i) => `${i + 1}. ${o.session ? `${fmtRange(o.session.starts_at, o.session.ends_at)} ${o.session.org_name}/${o.session.production_name}` : ""} (${o.absentName}さんの代役)`).join("\n");
    }
    const target = open[apply[2] ? Number(apply[2]) - 1 : 0];
    if (!target) return "その番号の募集はありません。";
    const result = await applySubstitution(profileId, target.requestId);
    return result === "filled" ? "応募ありがとうございます。あなたで確定しました。" : "残念ながら、この募集はすでに埋まりました。";
  }

  return `「${text}」は解釈できませんでした。\n\n${HELP}`;
}

async function scheduleText(profileId: string, fromDate: string, days: number, label: string): Promise<string> {
  const { start } = jstDayRange(fromDate);
  const { end } = jstDayRange(addDays(fromDate, days - 1));
  const sessions = await listProfileSessions(profileId, start, end);
  if (sessions.length === 0) return `${label}の予定はありません。`;
  if (days === 1) {
    return `${label}(${fmtDateLabel(fromDate)})の予定:\n` + sessions.map((s) => `・${sessionLine(s, false)} [${s.response === "yes" ? "参加" : s.response === "no" ? "不参加" : "未回答"}]`).join("\n");
  }
  const byDay = new Map<string, string[]>();
  for (const s of sessions) {
    const d = jstDateString(new Date(s.startsAt));
    byDay.set(d, [...(byDay.get(d) ?? []), `・${sessionLine(s, false)}`]);
  }
  return `${label}の予定:\n` + [...byDay.entries()].map(([d, lines]) => `▼${fmtDateLabel(d)}\n${lines.join("\n")}`).join("\n");
}
