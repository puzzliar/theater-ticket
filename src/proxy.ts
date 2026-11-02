import { NextResponse, type NextRequest } from "next/server";

// サービス分離: 1 つのリポジトリを NEXT_PUBLIC_APP=(未設定: チケット)|rehearsal(スケジュール)|shift(シフト) の 3 つのデプロイで配信する。
// それぞれのデプロイでは他サービスのパスを提供しない(API は 404、画面は相手サービスまたはトップへ転送)。
// 共通: / (トップはサービスごとに異なる) /login /auth/callback /terms /privacy

const APP = process.env.NEXT_PUBLIC_APP === "rehearsal" || process.env.NEXT_PUBLIC_APP === "schedule" ? "rehearsal" : process.env.NEXT_PUBLIC_APP === "shift" ? "shift" : "ticket";
const TICKET_URL = process.env.NEXT_PUBLIC_TICKET_SITE_URL || null;
const SCHEDULE_URL = process.env.NEXT_PUBLIC_SCHEDULE_SITE_URL || process.env.NEXT_PUBLIC_REHEARSAL_SITE_URL || null;

const TICKET_ONLY = ["/admin", "/cast", "/reception", "/e", "/my", "/order", "/portal", "/api/checkout", "/api/guest-reservation", "/api/pay", "/api/stripe", "/api/cron/send-reminders"];
// スケジュールとシフトで共通の rh_ 基盤のパス
const RH_COMMON = ["/rehearsal", "/me", "/o", "/orgs", "/join", "/onboarding", "/platform", "/signup", "/auth/line", "/api/google", "/api/ical", "/api/line", "/api/push", "/api/me", "/api/cron/rehearsal-notify"];
// スケジュールだけの機能(空き状況の共有、公式サイト、セルフ公演の引き渡し)
const SCHEDULE_ONLY = ["/me/availability", "/me/site", "/a", "/handover"];

function hasPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  let target: string | null = null;
  let foreign = false;
  if (APP === "ticket") {
    foreign = hasPrefix(pathname, RH_COMMON) || hasPrefix(pathname, SCHEDULE_ONLY);
    target = SCHEDULE_URL;
  } else if (APP === "rehearsal") {
    foreign = hasPrefix(pathname, TICKET_ONLY);
    target = TICKET_URL;
  } else {
    if (hasPrefix(pathname, TICKET_ONLY)) {
      foreign = true;
      target = TICKET_URL;
    } else if (hasPrefix(pathname, SCHEDULE_ONLY)) {
      foreign = true;
      target = SCHEDULE_URL;
    }
  }
  if (!foreign) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "not_found", message: "このサービスでは提供していないエンドポイントです" }, { status: 404 });
  }
  if (target) return NextResponse.redirect(`${target.replace(/\/$/, "")}${pathname}${search}`);
  return NextResponse.redirect(new URL("/", req.url));
}

// matcher は静的である必要があるため全サービス分を列挙する
export const config = {
  matcher: [
    "/admin/:path*", "/cast/:path*", "/reception/:path*", "/e/:path*", "/my/:path*", "/order/:path*", "/portal/:path*",
    "/api/checkout/:path*", "/api/guest-reservation/:path*", "/api/pay/:path*", "/api/stripe/:path*", "/api/cron/send-reminders/:path*",
    "/rehearsal/:path*", "/me/:path*", "/o/:path*", "/orgs/:path*", "/join/:path*", "/onboarding/:path*", "/platform/:path*", "/signup/:path*", "/auth/line/:path*", "/a/:path*", "/handover/:path*",
    "/api/google/:path*", "/api/ical/:path*", "/api/line/:path*", "/api/push/:path*", "/api/me/:path*", "/api/cron/rehearsal-notify/:path*",
  ],
};
