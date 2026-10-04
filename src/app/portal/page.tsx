import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "./actions";

// チケット販売サービスのログイン後振り分け(ロール別)。
// 共通アカウントでログインできてもチケット側のロール(tk_app_users)が無い人には案内を表示する
export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const supa = await supabaseServer();
  const {
    data: { user: authUser },
  } = await supa.auth.getUser();
  if (!authUser) redirect("/login");
  const user = await getAppUser();
  if (user?.role === "admin") redirect("/admin");
  if (user?.role === "cast") redirect("/cast");
  if (user?.role === "staff") redirect("/reception");

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">チケット管理の権限がありません</h1>
      <p className="text-sm text-neutral-300">{authUser.email} でログインしていますが、このアカウントには主催・キャスト・受付スタッフの権限が設定されていません。公演の主催者に、このメールアドレスへの権限付与を依頼してください。</p>
      <form action={signOut}>
        <button className="rounded-md border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900">別のアカウントでログインする</button>
      </form>
    </div>
  );
}
