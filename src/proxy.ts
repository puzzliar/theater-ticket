import { NextResponse, type NextRequest } from "next/server";

// サービス分離: 1 つのリポジトリを NEXT_PUBLIC_APP=ticket|rehearsal の 2 つのデプロイで配信する。
// それぞれのデプロイでは相手サービスのパスを提供しない(API は 404、画面は相手サービスまたはトップへ転送)。
// 共通: / (トップはサービスごとに異なる) /login /auth/callback /terms /privacy

const IS_REHEARSAL = process.env.NEXT_PUBLIC_APP === "rehearsal";
const SIBLING = (IS_REHEARSAL ? process.env.NEXT_PUBLIC_TICKET_SITE_URL : process.env.NEXT_PUBLIC_REHEARSAL_SITE_URL) || null;

const TICKET_ONLY = ["/admin", "/cast", "/reception", "/e", "/my", "/order", "/portal", "/api/checkout", "/api/guest-reservation", "/api/pay", "/api/stripe", "/api/cron/send-reminders"];
const REHEARSAL_ONLY = ["/rehearsal", "/me", "/o", "/orgs", "/join", "/onboarding", "/platform", "/signup", "/auth/line", "/api/google", "/api/ical", "/api/line", "/api/push", "/api/me", "/api/cron/rehearsal-notify"];

function hasPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const foreign = IS_REHEARSAL ? hasPrefix(pathname, TICKET_ONLY) : hasPrefix(pathname, REHEARSAL_ONLY);
  if (!foreign) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "not_found", message: "このサービスでは提供していないエンドポイントです" }, { status: 404 });
  }
  if (SIBLING) return NextResponse.redirect(`${SIBLING.replace(/\/$/, "")}${pathname}${search}`);
  return NextResponse.redirect(new URL("/", req.url));
}

// matcher は静的である必要があるため両サービス分を列挙する
export const config = {
  matcher: [
    "/admin/:path*", "/cast/:path*", "/reception/:path*", "/e/:path*", "/my/:path*", "/order/:path*", "/portal/:path*",
    "/api/checkout/:path*", "/api/guest-reservation/:path*", "/api/pay/:path*", "/api/stripe/:path*", "/api/cron/send-reminders/:path*",
    "/rehearsal/:path*", "/me/:path*", "/o/:path*", "/orgs/:path*", "/join/:path*", "/onboarding/:path*", "/platform/:path*", "/signup/:path*", "/auth/line/:path*",
    "/api/google/:path*", "/api/ical/:path*", "/api/line/:path*", "/api/push/:path*", "/api/me/:path*", "/api/cron/rehearsal-notify/:path*",
  ],
};
