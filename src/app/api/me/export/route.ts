import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/core/session";
import { listProfileSessions } from "@/lib/rehearsal/schedule";
import { fmtRange } from "@/lib/rehearsal/time";
import { RESPONSE_LABEL, SESSION_KIND_LABEL, SESSION_STATUS_LABEL } from "@/lib/rehearsal/types";

export const dynamic = "force-dynamic";

// 自分のデータのエクスポート(要件 5.0): 予定・出欠・空き時間を CSV で返す
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const from = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const to = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const [sessions, { data: avail }] = await Promise.all([
    listProfileSessions(me.id, from, to, true),
    supabaseAdmin().from("rh_availability").select("*").eq("profile_id", me.id).order("starts_at"),
  ]);
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ["種別,組織,プロダクション,タイトル,日時,場所,状態,出欠"];
  for (const s of sessions) {
    lines.push([SESSION_KIND_LABEL[s.kind], s.orgName, s.productionName, s.title, fmtRange(s.startsAt, s.endsAt), s.location, SESSION_STATUS_LABEL[s.status], RESPONSE_LABEL[s.response]].map(esc).join(","));
  }
  lines.push("", "空き時間,開始,終了,区分,メモ,取得元");
  for (const a of avail ?? []) {
    lines.push(["", a.starts_at, a.ends_at, a.status === "available" ? "可" : "不可", a.note, a.source].map(esc).join(","));
  }
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="rehearsal-export.csv"' },
  });
}
