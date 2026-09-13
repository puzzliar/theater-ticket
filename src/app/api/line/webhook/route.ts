import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyLineSignature, lineReply, type LineWebhookEvent } from "@/lib/line";
import { listMemberSessions, sessionLine } from "@/lib/rehearsal/schedule";
import { applySubstitution, openSubstitutionsFor, respondToSession, RehearsalError } from "@/lib/rehearsal/core";
import { addDays, fmtDateLabel, jstDateString, jstDayRange, fmtRange } from "@/lib/rehearsal/time";
import type { MemberRow } from "@/lib/rehearsal/types";
import { SITE_URL } from "@/lib/constants";

// LINE Messaging API Webhook(要件 5.8)。
// 署名検証 → イベントIDで冪等化 → テキストコマンドに応答。

const HELP = [
  "使えるメッセージ:",
  "「今日」「明日」「今週」…予定を表示",
  "「参加」「不参加」…直近の未回答の召集に回答(複数ある場合は「参加 2」のように番号指定)",
  "「入れます」…募集中の代役に応募(複数ある場合は「入れます 2」)",
  "「連携 123456」…アカウント連携(コードはWebの予定画面で発行)",
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
      if (error) continue; // 処理済み(再送)
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
  const { data: memberRow } = await admin.from("rh_members").select("*").eq("line_user_id", lineUserId).maybeSingle();
  const member = memberRow as MemberRow | null;

  if (ev.type === "follow") {
    return member
      ? `${member.name} さん、連携済みです。「今日」「今週」などと送ると予定を返します。`
      : `友だち追加ありがとうございます。\n${SITE_URL}/me で表示される6桁の連携コードを「連携 123456」の形式で送信してください。`;
  }
  if (ev.type !== "message" || ev.message?.type !== "text") return null;
  const text = (ev.message.text ?? "").trim();

  // 連携
  const link = text.match(/^(?:連携|link)\s*(\d{6})$/i) ?? text.match(/^(\d{6})$/);
  if (link) {
    const code = link[1];
    const { data: target } = await admin.from("rh_members").select("id, name, line_link_expires_at").eq("line_link_code", code).maybeSingle();
    if (!target || !target.line_link_expires_at || new Date(target.line_link_expires_at).getTime() < Date.now()) {
      return "連携コードが無効か期限切れです。Webの予定画面でコードを発行し直してください。";
    }
    // 同じ LINE が別メンバーに紐づいていれば外す
    await admin.from("rh_members").update({ line_user_id: null }).eq("line_user_id", lineUserId);
    const { error } = await admin
      .from("rh_members")
      .update({ line_user_id: lineUserId, line_link_code: null, line_link_expires_at: null })
      .eq("id", target.id);
    if (error) return "連携に失敗しました。";
    return `${target.name} さんとして連携しました。これから稽古の召集や毎朝の予定をお送りします。\n\n${HELP}`;
  }

  if (!member) {
    return `まだアカウントが連携されていません。\n${SITE_URL}/me で表示される6桁のコードを「連携 123456」の形式で送信してください。`;
  }

  if (/^(ヘルプ|help|\?)$/i.test(text)) return HELP;

  // 予定照会
  const today = jstDateString();
  if (/^(今日|きょう|today)$/i.test(text)) return scheduleText(member.id, today, 1, "今日");
  if (/^(明日|あした|tomorrow)$/i.test(text)) return scheduleText(member.id, addDays(today, 1), 1, "明日");
  if (/^(今週|こんしゅう|week)$/i.test(text)) return scheduleText(member.id, today, 7, "今週(7日間)");

  // 出欠回答
  const resp = text.match(/^(参加|不参加|未定|yes|no|maybe)\s*(\d+)?$/i);
  if (resp) {
    const map: Record<string, "yes" | "no" | "maybe"> = { 参加: "yes", yes: "yes", 不参加: "no", no: "no", 未定: "maybe", maybe: "maybe" };
    const response = map[resp[1].toLowerCase()] ?? map[resp[1]];
    const pending = (await listMemberSessions(member.id, new Date().toISOString(), new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString())).filter(
      (s) => s.response === "pending",
    );
    if (pending.length === 0) return "未回答の召集はありません。";
    const idx = resp[2] ? Number(resp[2]) - 1 : 0;
    if (pending.length > 1 && !resp[2]) {
      return `未回答の召集が${pending.length}件あります。番号を付けて返信してください(例:「${resp[1]} 1」)\n` + pending.map((s, i) => `${i + 1}. ${sessionLine(s)}`).join("\n");
    }
    const target = pending[idx];
    if (!target) return "その番号の召集はありません。";
    await respondToSession(member.id, target.id, response);
    return `「${sessionLine(target)}」に「${resp[1]}」で回答しました。`;
  }

  // 代役応募
  const apply = text.match(/^(入れます|はいれます|入ります)\s*(\d+)?$/i);
  if (apply) {
    const open = await openSubstitutionsFor(member.id);
    if (open.length === 0) return "現在、あなたが応募できる代役募集はありません。";
    if (open.length > 1 && !apply[2]) {
      return `募集が${open.length}件あります。番号を付けて返信してください(例:「入れます 1」)\n` + open.map((o, i) => `${i + 1}. ${o.session ? `${fmtRange(o.session.starts_at, o.session.ends_at)} ${o.session.production_name}` : ""} (${o.absentName}さんの代役)`).join("\n");
    }
    const target = open[apply[2] ? Number(apply[2]) - 1 : 0];
    if (!target) return "その番号の募集はありません。";
    const result = await applySubstitution(member.id, target.requestId);
    return result === "filled" ? "応募ありがとうございます。あなたで確定しました。" : "残念ながら、この募集はすでに埋まりました。";
  }

  return `「${text}」は解釈できませんでした。\n\n${HELP}`;
}

async function scheduleText(memberId: string, fromDate: string, days: number, label: string): Promise<string> {
  const { start } = jstDayRange(fromDate);
  const { end } = jstDayRange(addDays(fromDate, days - 1));
  const sessions = await listMemberSessions(memberId, start, end);
  if (sessions.length === 0) return `${label}の予定はありません。`;
  if (days === 1) {
    return `${label}(${fmtDateLabel(fromDate)})の予定:\n` + sessions.map((s) => `・${sessionLine(s, false)} [${s.response === "yes" ? "参加" : s.response === "no" ? "不参加" : "未回答"}]`).join("\n");
  }
  const byDay = new Map<string, string[]>();
  for (const s of sessions) {
    const d = jstDateString(new Date(s.startsAt));
    const arr = byDay.get(d) ?? [];
    arr.push(`・${sessionLine(s, false)}`);
    byDay.set(d, arr);
  }
  return `${label}の予定:\n` + [...byDay.entries()].map(([d, lines]) => `▼${fmtDateLabel(d)}\n${lines.join("\n")}`).join("\n");
}
