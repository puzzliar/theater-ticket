import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { linePush, lineConfigured } from "@/lib/line";
import { sendEmail } from "@/lib/email";
import { sendWebPush, webpushConfigured } from "@/lib/webpush";
import { jstDateString } from "./time";
import type { NotifyChannel, NotifyKind, ProfileSettingsRow } from "./types";

// 通知の配送(要件 5.8 / 5.9 v0.2)。
//  - 種別ごとの希望チャネル(本人設定)を優先し、使えなければ line → webpush → email の順で代替
//  - LINE プッシュは無料枠を守るため月間の全体上限(LINE_PUSH_MONTHLY_LIMIT、既定 200)を超えたら次のチャネルへ
//  - dedupe_key の一意制約で二重送信を防ぐ

export interface NotifyMessage {
  title: string;
  text: string;
  url?: string;
}

const FALLBACK: NotifyChannel[] = ["line", "webpush", "email"];

function monthStartIso(): string {
  const today = jstDateString();
  return new Date(`${today.slice(0, 7)}-01T00:00:00+09:00`).toISOString();
}

async function lineBudgetLeft(): Promise<number> {
  const limit = Number(process.env.LINE_PUSH_MONTHLY_LIMIT ?? 200);
  const { count } = await supabaseAdmin().from("rh_notifications").select("id", { count: "exact", head: true }).eq("channel", "line").gte("sent_at", monthStartIso());
  return limit - (count ?? 0);
}

export async function notifyProfile(profileId: string, kind: NotifyKind, dedupeKey: string, msg: NotifyMessage): Promise<NotifyChannel | "duplicate"> {
  const admin = supabaseAdmin();
  // 先にログ行を確保(重複なら送らない)。チャネルは送信後に確定させる
  const { error: dupErr } = await admin.from("rh_notifications").insert({ profile_id: profileId, channel: "none", dedupe_key: dedupeKey, payload: { kind, ...msg } });
  if (dupErr) return "duplicate";

  const [{ data: settings }, { data: profile }, { data: line }, { data: subs }] = await Promise.all([
    admin.from("rh_profile_settings").select("*").eq("profile_id", profileId).maybeSingle(),
    admin.from("core_profiles").select("email, deleted_at").eq("id", profileId).maybeSingle(),
    admin.from("core_identities").select("provider_uid").eq("profile_id", profileId).eq("provider", "line").maybeSingle(),
    admin.from("rh_push_subscriptions").select("id, endpoint, p256dh, auth").eq("profile_id", profileId),
  ]);
  if (!profile || profile.deleted_at) return "none";

  const prefKey = `notify_${kind}` as keyof ProfileSettingsRow;
  const preferred = ((settings as ProfileSettingsRow | null)?.[prefKey] as NotifyChannel | undefined) ?? "email";
  if (preferred === "none") return "none";
  const order = [preferred, ...FALLBACK.filter((c) => c !== preferred)];

  const fullText = msg.url ? `${msg.text}\n${msg.url}` : msg.text;
  for (const ch of order) {
    if (ch === "line") {
      if (!line || !lineConfigured()) continue;
      if ((await lineBudgetLeft()) <= 0) continue;
      if (await linePush(line.provider_uid, `${msg.title}\n${fullText}`)) return finalize(dedupeKey, "line");
    } else if (ch === "webpush") {
      if (!subs?.length || !webpushConfigured()) continue;
      let ok = false;
      for (const s of subs) {
        const r = await sendWebPush(s, { title: msg.title, body: msg.text, url: msg.url, tag: dedupeKey });
        if (r === "ok") ok = true;
        if (r === "gone") await admin.from("rh_push_subscriptions").delete().eq("id", s.id);
      }
      if (ok) return finalize(dedupeKey, "webpush");
    } else if (ch === "email") {
      if (!profile.email || profile.email.endsWith("@line.puzzliar.jp")) continue;
      if (await sendEmail(profile.email, `【稽古管理】${msg.title}`, `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(fullText)}</pre>`)) return finalize(dedupeKey, "email");
    }
  }
  // どのチャネルでも送れなかった: 記録は残す(画面上の「要対応」で拾える)
  return "none";
}

async function finalize(dedupeKey: string, channel: NotifyChannel): Promise<NotifyChannel> {
  await supabaseAdmin().from("rh_notifications").update({ channel }).eq("dedupe_key", dedupeKey);
  return channel;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
