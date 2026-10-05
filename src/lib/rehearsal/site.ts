import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listProfileSessions } from "./schedule";
import { addDays, jstDateString, jstDayRange } from "./time";
import type { CreditRow, PublicProfileRow } from "./types";

// キャスト公式サイト: 公開プロフィール(/[handle])と出演履歴。
// 出演履歴は所属した公演から自動で作り(source=auto)、ZAGUMI 以前の経歴は手入力(source=manual)で足す。

export const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;
export const RESERVED_HANDLES = new Set([
  "me", "o", "orgs", "join", "login", "signup", "onboarding", "platform", "terms", "privacy", "api", "auth", "a", "rehearsal", "handover",
  "admin", "cast", "e", "my", "order", "portal", "reception", "_next", "favicon.ico", "sw.js", "robots.txt", "sitemap.xml", "zagumi", "puzzliar",
  "about", "help", "support", "contact", "news", "blog", "app", "www", "mail", "static", "assets", "public", "null", "undefined",
]);

export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, "");
}
export function handleProblem(handle: string): string | null {
  if (!HANDLE_RE.test(handle)) return "URL 名は英小文字・数字・ハイフン・アンダースコアで 3〜30 文字にしてください";
  if (RESERVED_HANDLES.has(handle)) return "その URL 名は使えません";
  return null;
}

export const LINK_KEYS = ["website", "x", "instagram", "youtube", "tiktok", "note", "threads", "other"] as const;
export type LinkKey = (typeof LINK_KEYS)[number];
export const LINK_LABEL: Record<LinkKey, string> = { website: "Web サイト", x: "X", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", note: "note", threads: "Threads", other: "その他" };

export async function getMySite(profileId: string): Promise<PublicProfileRow | null> {
  const { data } = await supabaseAdmin().from("rh_public_profiles").select("*").eq("profile_id", profileId).maybeSingle();
  return (data as PublicProfileRow | null) ?? null;
}

export async function listCredits(profileId: string): Promise<CreditRow[]> {
  const { data } = await supabaseAdmin().from("rh_credits").select("*").eq("profile_id", profileId).order("started_on", { ascending: false, nullsFirst: false });
  return (data ?? []) as CreditRow[];
}

// 所属した公演から出演履歴を同期。新規は作成、既存の自動行はタイトル・団体名・期間だけ追従(役名・公開設定は本人の編集を尊重)
export async function syncAutoCredits(profileId: string): Promise<void> {
  const admin = supabaseAdmin();
  const { data: pm } = await admin
    .from("rh_production_members")
    .select("production_id, role_name, rh_participants!inner(profile_id), rh_productions!inner(id, name, opens_on, closes_on, status, core_organizations(name, kind))")
    .eq("rh_participants.profile_id", profileId);
  type Row = { production_id: string; role_name: string; rh_productions: { id: string; name: string; opens_on: string | null; closes_on: string | null; status: string; core_organizations: { name: string; kind: string } | null } };
  const rows = (pm ?? []) as unknown as Row[];
  if (rows.length === 0) return;
  const prodIds = [...new Set(rows.map((r) => r.production_id))];
  const [{ data: perf }, { data: existing }] = await Promise.all([
    admin.from("rh_sessions").select("production_id, starts_at").in("production_id", prodIds).eq("kind", "performance").neq("status", "cancelled"),
    admin.from("rh_credits").select("id, production_id").eq("profile_id", profileId).in("production_id", prodIds),
  ]);
  const perfDates = new Map<string, { min: string; max: string }>();
  for (const s of perf ?? []) {
    const d = jstDateString(new Date(s.starts_at));
    const cur = perfDates.get(s.production_id);
    perfDates.set(s.production_id, { min: cur && cur.min < d ? cur.min : d, max: cur && cur.max > d ? cur.max : d });
  }
  const existingByProd = new Map((existing ?? []).map((e) => [e.production_id as string, e.id as string]));
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.production_id)) continue;
    seen.add(r.production_id);
    const p = r.rh_productions;
    const dates = perfDates.get(r.production_id);
    const patch = {
      title: p.name,
      org_name: p.core_organizations?.kind === "personal" ? "" : p.core_organizations?.name ?? "",
      started_on: p.opens_on ?? dates?.min ?? null,
      ended_on: p.closes_on ?? dates?.max ?? p.opens_on ?? null,
      updated_at: new Date().toISOString(),
    };
    const id = existingByProd.get(r.production_id);
    if (id) await admin.from("rh_credits").update(patch).eq("id", id);
    else await admin.from("rh_credits").insert({ profile_id: profileId, production_id: r.production_id, source: "auto", role_name: r.role_name, ...patch });
  }
}

export interface UpcomingPerformance {
  date: string;
  startsAt: string;
  endsAt: string;
  title: string;
  productionName: string;
  orgName: string;
  location: string;
}

// 近日の出演(本番のみ、公開中の出演履歴に含まれる公演だけ)
export async function listUpcomingPerformances(profileId: string, publicProductionIds: Set<string>, days = 180): Promise<UpcomingPerformance[]> {
  const today = jstDateString();
  const sessions = await listProfileSessions(profileId, jstDayRange(today).start, jstDayRange(addDays(today, days)).end);
  return sessions
    .filter((s) => s.kind === "performance" && s.status === "scheduled" && s.response !== "no" && !s.tentative && publicProductionIds.has(s.productionId))
    .map((s) => ({ date: jstDateString(new Date(s.startsAt)), startsAt: s.startsAt, endsAt: s.endsAt, title: s.title, productionName: s.productionName, orgName: s.orgName, location: s.location }));
}

export interface PublicSite {
  site: PublicProfileRow;
  displayName: string;
  credits: CreditRow[];
  upcoming: UpcomingPerformance[];
}

export async function getPublicSite(handle: string): Promise<PublicSite | null> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("rh_public_profiles").select("*, core_profiles(display_name, deleted_at)").eq("handle", handle).eq("is_public", true).maybeSingle();
  if (!data) return null;
  const { core_profiles, ...site } = data as PublicProfileRow & { core_profiles: { display_name: string; deleted_at: string | null } | null };
  if (!core_profiles || core_profiles.deleted_at) return null;
  await syncAutoCredits(site.profile_id);
  const credits = (await listCredits(site.profile_id)).filter((c) => c.is_public);
  const publicProductionIds = new Set(credits.map((c) => c.production_id).filter((x): x is string => Boolean(x)));
  const upcoming = site.show_upcoming ? await listUpcomingPerformances(site.profile_id, publicProductionIds) : [];
  return { site, displayName: core_profiles.display_name, credits, upcoming };
}

export function publicPhotoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/zagumi-public/${path}`;
}
