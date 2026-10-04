"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function signOut() {
  const supa = await supabaseServer();
  await supa.auth.signOut();
  redirect("/login");
}
