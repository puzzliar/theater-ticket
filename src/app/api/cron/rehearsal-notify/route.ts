import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyProfile } from "@/lib/rehearsal/notify";
import { importBusyAsUnavailable } from "@/lib/rehearsal/google-sync";
import { listProfileSessions, sessionLine } from "@/lib/rehearsal/schedule";
import { addDays, fmtDateLabel, jstDateString, jstDayRange, jstHour } from "@/lib/rehearsal/time";
import { RESPONSE_LABEL } from "@/lib/rehearsal/types";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// 定時通知(要件 5.8 / 5.9)。外部スケジューラから 10〜30 分おきに呼ぶ。
//  - REHEARSAL_DIGEST_HOUR(既定 8)時台: 今日の予定ダイジェスト(予定がある人のみ) + Google FreeBusy の取り込み
//  - REHEARSAL_REMINDER_HOUR(既定 20)時台: 翌日の予定リマインド
// チャネルは本人設定に従う(既定はメール)。dedupe_key で冪等。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const digestHour = Number(process.env.REHEARSAL_DIGEST_HOUR ?? 8);
  const reminderHour = Number(process.env.REHEARSAL_REMINDER_HOUR ?? 20);
  const hour = jstHour();
  const force = req.nextUrl.searchParams.get("force");
  const jobs: ("digest" | "reminder")[] = [];
  if (hour === digestHour || force === "digest") jobs.push("digest");
  if (hour === reminderHour || force === "reminder") jobs.push("reminder");
  if (jobs.length === 0) return NextResponse.json({ skipped: true, hour });

  const admin = supabaseAdmin();
  const today = jstDateString();
  const counts = { digest: 0, reminder: 0, freebusy: 0 };

  // 対象: 今日/明日に召集がある人だけを集める(全プロフィールを走査しない)
  const dates = jobs.map((j) => (j === "digest" ? today : addDays(today, 1)));
  const { start } = jstDayRange(dates[0]);
  const { end } = jstDayRange(dates[dates.length - 1]);
  const { data: rows } = await admin
    .from("rh_session_members")
    .select("rh_participants!inner(profile_id), rh_sessions!inner(starts_at, status)")
    .gte("rh_sessions.starts_at", start)
    .lt("rh_sessions.starts_at", end)
    .neq("rh_sessions.status", "cancelled")
    .not("rh_participants.profile_id", "is", null);
  const profileIds = [...new Set(((rows ?? []) as unknown as { rh_participants: { profile_id: string } }[]).map((r) => r.rh_participants.profile_id))];

  for (const pid of profileIds) {
    for (const job of jobs) {
      const date = job === "digest" ? today : addDays(today, 1);
      const range = jstDayRange(date);
      const sessions = (await listProfileSessions(pid, range.start, range.end)).filter((s) => s.response !== "no");
      if (sessions.length === 0) continue;
      const title = job === "digest" ? `今日(${fmtDateLabel(date)})の予定` : `明日(${fmtDateLabel(date)})の予定`;
      const body = sessions.map((s) => `・${sessionLine(s, false)} [${RESPONSE_LABEL[s.response]}]`).join("\n");
      const pending = sessions.filter((s) => s.response === "pending").length;
      const foot = pending > 0 ? `\n未回答が${pending}件あります。` : "";
      const ch = await notifyProfile(pid, job, `${job}:${date}:${pid}`, { title, text: `${body}${foot}`, url: `${SITE_URL}/me` });
      if (ch !== "duplicate" && ch !== "none") counts[job]++;
    }
  }

  // Google 連携者の FreeBusy 取り込み(1日1回)
  if (jobs.includes("digest")) {
    const { data: idents } = await admin.from("core_identities").select("profile_id").eq("provider", "google_calendar");
    for (const i of idents ?? []) {
      const { error } = await admin.from("rh_notifications").insert({ profile_id: i.profile_id, channel: "none", dedupe_key: `freebusy:${today}:${i.profile_id}` });
      if (!error) counts.freebusy += await importBusyAsUnavailable(i.profile_id);
    }
  }
  return NextResponse.json({ hour, jobs, ...counts });
}
