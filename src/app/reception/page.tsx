import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReceptionHome() {
  const user = await getAppUser();
  if (!user || (user.role !== "staff" && user.role !== "admin")) redirect("/login");

  const admin = supabaseAdmin();
  const { data: stages } = await admin
    .from("tk_stages")
    .select("id, name, starts_at, tk_events(name)")
    .order("starts_at", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">受付</h1>
      <p className="text-sm text-neutral-400">チェックインを行うステージを選択してください。</p>
      <div className="grid gap-3">
        {(stages ?? []).map((s) => (
          <Link
            key={s.id}
            href={`/reception/s/${s.id}`}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
          >
            <p className="font-medium">{(s.tk_events as unknown as { name: string }).name}</p>
            <p className="text-sm text-neutral-400">
              {s.name} ／ {fmtDateTime(s.starts_at)} 開演
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
