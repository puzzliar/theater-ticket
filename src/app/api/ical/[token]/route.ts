import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { listMemberSessions } from "@/lib/rehearsal/schedule";
import { SESSION_KIND_LABEL, RESPONSE_LABEL } from "@/lib/rehearsal/types";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// メンバー個人の iCal フィード(要件 5.7 方式A)。
// Google カレンダーの「URLで追加」で購読する。トークンはメンバーごとのシークレット。
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();
  const { data: member } = await admin.from("rh_members").select("id, name, is_active").eq("ical_token", token).maybeSingle();
  if (!member || !member.is_active) return new NextResponse("not found", { status: 404 });

  // 過去60日〜未来1年。中止・不参加回答分は含めるが CANCELLED / TENTATIVE で表現する
  const from = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const to = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const sessions = await listMemberSessions(member.id, from, to, true);

  const events: IcsEvent[] = sessions
    .filter((s) => s.response !== "no")
    .map((s) => ({
      uid: `${s.id}@rehearsal.puzzliar`,
      start: s.startsAt,
      end: s.endsAt,
      summary: `[${SESSION_KIND_LABEL[s.kind]}] ${s.productionName}${s.title ? ` ${s.title}` : ""}`,
      description: [
        s.scenes.length ? `シーン: ${s.scenes.map((x) => `${x.code} ${x.name}`).join(" / ")}` : "",
        `出欠: ${RESPONSE_LABEL[s.response]}`,
        s.note,
        `${SITE_URL}/me`,
      ]
        .filter(Boolean)
        .join("\n"),
      location: s.location,
      status: s.status === "cancelled" ? "CANCELLED" : s.response === "yes" ? "CONFIRMED" : "TENTATIVE",
    }));

  const body = buildIcs(`稽古予定 (${member.name})`, events);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="rehearsal.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
