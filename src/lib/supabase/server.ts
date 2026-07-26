import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// 認証セッション読み取り用のSSRクライアント(anonキー)
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component からの呼び出しでは set 不可(読み取りのみで問題ない)
          }
        },
      },
    },
  );
}
