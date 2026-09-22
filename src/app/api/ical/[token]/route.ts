import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { listProfileSessions } from "@/lib/rehearsal/schedule";
import { SESSION_KIND_LABEL, RESPONSE_LABEL } from "@/lib/rehearsal/types";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// 個人の iCal フィード(要件 5.7 方式A)。トークンは本人専用のシークレット
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();
  const { data: settings } = await admin.from("rh_profile_settings").select("profile_id, core_profiles(display_name, deleted_at)").eq("ical_token", token).maybeSingle();
  const prof = settings?.core_profiles as unknown as { display_name: string; deleted_at: string | null } | null;
  if (!settings || !prof || prof.deleted_at) return new NextResponse("not found", { status: 404 });

  const from = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const to = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const sessions = await listProfileSessions(settings.profile_id, from, to, true);

  const events: IcsEvent[] = sessions
    .filter((s) => s.response !== "no")
    .map((s) => ({
      uid: `${s.id}.${s.participantId}@rehearsal.puzzliar`,
      start: s.startsAt,
      end: s.endsAt,
      summary: `[${SESSION_KIND_LABEL[s.kind]}] ${s.orgName} ${s.productionName}${s.title ? ` ${s.title}` : ""}`,
      description: [s.scenes.length ? `シーン: ${s.scenes.map((x) => `${x.code} ${x.name}`).join(" / ")}` : "", `出欠: ${RESPONSE_LABEL[s.response]}`, s.note, `${SITE_URL}/me`].filter(Boolean).join("\n"),
      location: s.location,
      status: s.status === "cancelled" ? "CANCELLED" : s.response === "yes" ? "CONFIRMED" : "TENTATIVE",
    }));

  return new NextResponse(buildIcs(`稽古予定 (${prof.display_name})`, events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="rehearsal.ics"', "Cache-Control": "private, max-age=300" },
  });
}
