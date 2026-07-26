import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

// service role クライアント(サーバー専用)。RLSをバイパスするため、
// 呼び出し側(server action / route handler)で必ずロール検証を行うこと。
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です");
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
