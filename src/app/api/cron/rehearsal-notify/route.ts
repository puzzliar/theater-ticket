import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyMember } from "@/lib/rehearsal/notify";
import { listMemberSessions, sessionLine } from "@/lib/rehearsal/schedule";
import { addDays, fmtDateLabel, jstDateString, jstDayRange, jstHour } from "@/lib/rehearsal/time";
import { RESPONSE_LABEL, type MemberRow } from "@/lib/rehearsal/types";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// 定時通知(要件 5.8 / 5.9)。外部スケジューラから 10〜30 分おきに呼ぶ。
//  - 毎朝 REHEARSAL_DIGEST_HOUR(既定 8)時台: 今日の予定ダイジェスト(予定がある人のみ)
//  - 毎晩 REHEARSAL_REMINDER_HOUR(既定 20)時台: 翌日の予定リマインド
// 送信は dedupe_key (種別:日付:メンバー) で冪等。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const digestHour = Number(process.env.REHEARSAL_DIGEST_HOUR ?? 8);
  const reminderHour = Number(process.env.REHEARSAL_REMINDER_HOUR ?? 20);
  const hour = jstHour();
  const force = req.nextUrl.searchParams.get("force"); // 動作確認用: ?force=digest|reminder

  const jobs: ("digest" | "reminder")[] = [];
  if (hour === digestHour || force === "digest") jobs.push("digest");
  if (hour === reminderHour || force === "reminder") jobs.push("reminder");
  if (jobs.length === 0) return NextResponse.json({ skipped: true, hour });

  const admin = supabaseAdmin();
  const { data: members } = await admin.from("rh_members").select("id, name, line_user_id, email").eq("is_active", true);
  const today = jstDateString();
  const counts = { digest: 0, reminder: 0 };

  for (const m of (members ?? []) as MemberRow[]) {
    if (!m.line_user_id && !m.email) continue;
    for (const job of jobs) {
      const date = job === "digest" ? today : addDays(today, 1);
      const { start, end } = jstDayRange(date);
      const sessions = (await listMemberSessions(m.id, start, end)).filter((s) => s.response !== "no");
      if (sessions.length === 0) continue;
      const head = job === "digest" ? `おはようございます。今日(${fmtDateLabel(date)})の予定です。` : `明日(${fmtDateLabel(date)})の予定のリマインドです。`;
      const body = sessions.map((s) => `・${sessionLine(s, false)} [${RESPONSE_LABEL[s.response]}]`).join("\n");
      const pending = sessions.filter((s) => s.response === "pending").length;
      const foot = pending > 0 ? `\n\n未回答が${pending}件あります。「参加」「不参加」で返信してください。` : "";
      const ch = await notifyMember(m, `${job}:${date}:${m.id}`, `${head}\n${body}${foot}\n${SITE_URL}/me`, job === "digest" ? "【稽古管理】今日の予定" : "【稽古管理】明日の予定");
      if (ch === "line" || ch === "email") counts[job]++;
    }
  }
  return NextResponse.json({ hour, jobs, ...counts });
}
