import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IS_REHEARSAL } from "@/lib/app";
import { SITE_URL } from "@/lib/constants";
import { getPublicSite, handleProblem, LINK_KEYS, LINK_LABEL, normalizeHandle } from "@/lib/rehearsal/site";
import { fmtDateLabel, fmtTime } from "@/lib/rehearsal/time";
import { CREDIT_KIND_LABEL } from "@/lib/rehearsal/types";

export const dynamic = "force-dynamic";

// キャスト公式サイト(公開)。/[handle]
async function load(handleRaw: string) {
  if (!IS_REHEARSAL) return null;
  const handle = normalizeHandle(handleRaw);
  if (handleProblem(handle)) return null;
  return getPublicSite(handle);
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const data = await load(handle);
  if (!data) return { title: "ページが見つかりません" };
  const description = data.site.headline || `${data.displayName} の出演情報`;
  return {
    title: `${data.displayName}${data.site.headline ? ` | ${data.site.headline}` : ""}`,
    description,
    alternates: { canonical: `${SITE_URL}/${data.site.handle}` },
    openGraph: { title: data.displayName, description, url: `${SITE_URL}/${data.site.handle}`, type: "profile", images: data.site.photo_url ? [{ url: data.site.photo_url }] : undefined },
  };
}

export default async function PublicSitePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const data = await load(handle);
  if (!data) notFound();
  const { site, displayName, credits, upcoming } = data;
  const byYear = new Map<string, typeof credits>();
  for (const c of credits) {
    const y = c.started_on ? c.started_on.slice(0, 4) : "その他";
    byYear.set(y, [...(byYear.get(y) ?? []), c]);
  }
  const years = [...byYear.keys()].sort((a, b) => (a === "その他" ? 1 : b === "その他" ? -1 : b.localeCompare(a)));
  const links = LINK_KEYS.filter((k) => site.links?.[k]);

  return (
    <article className="mx-auto max-w-2xl space-y-10">
      <header className="flex flex-wrap items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {site.photo_url && <img src={site.photo_url} alt={displayName} className="h-32 w-32 rounded-full object-cover ring-2 ring-neutral-800" />}
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-bold">{displayName}</h1>
          {site.headline && <p className="text-neutral-300">{site.headline}</p>}
          {links.length > 0 && (
            <p className="flex flex-wrap gap-3 text-sm">
              {links.map((k) => <a key={k} href={site.links[k]} target="_blank" rel="noopener" className="text-amber-400 hover:underline">{LINK_LABEL[k]}</a>)}
            </p>
          )}
        </div>
      </header>

      {site.bio && <section className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{site.bio}</section>}

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-amber-300">近日の出演</h2>
          <div className="space-y-2">
            {upcoming.map((u, i) => (
              <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
                <p className="font-medium">{u.productionName}{u.title && <span className="text-neutral-300"> {u.title}</span>}</p>
                <p className="text-neutral-400">{fmtDateLabel(u.date)} {fmtTime(u.startsAt)}〜{u.orgName && ` ／ ${u.orgName}`}{u.location && ` ／ ${u.location}`}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {credits.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-amber-300">出演履歴</h2>
          {years.map((y) => (
            <div key={y} className="space-y-2">
              <h3 className="text-sm font-semibold text-neutral-400">{y}</h3>
              <ul className="space-y-2">
                {byYear.get(y)!.map((c) => (
                  <li key={c.id} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm">
                    <p>
                      {c.url ? <a href={c.url} target="_blank" rel="noopener" className="font-medium hover:underline">{c.title}</a> : <span className="font-medium">{c.title}</span>}
                      {c.role_name && <span className="text-neutral-300"> ／ {c.role_name}</span>}
                      <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">{CREDIT_KIND_LABEL[c.kind]}</span>
                    </p>
                    <p className="text-xs text-neutral-400">
                      {[c.org_name, c.venue, c.started_on ? `${fmtDateLabel(c.started_on)}${c.ended_on && c.ended_on !== c.started_on ? `〜${fmtDateLabel(c.ended_on)}` : ""}` : ""].filter(Boolean).join(" ／ ")}
                    </p>
                    {c.note && <p className="text-xs text-neutral-500">{c.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      <footer className="text-xs text-neutral-600">このページは ZAGUMIスケジュールの公式サイト機能で作られています。</footer>
    </article>
  );
}
