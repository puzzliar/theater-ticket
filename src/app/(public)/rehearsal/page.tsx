import { redirect } from "next/navigation";

// 旧 URL。稽古管理は独立したサービスになり、トップページが紹介ページを兼ねる
export const dynamic = "force-dynamic";

export default async function RehearsalRedirect({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const sp = await searchParams;
  redirect(sp.deleted ? "/?deleted=1" : "/");
}
