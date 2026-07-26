"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/constants";
import { cancelOrder, ensureStockRows } from "@/lib/orders";

export async function createEvent(formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const { error } = await admin.from("tk_events").insert({
    org_id: ORG_ID,
    name: String(formData.get("name") ?? "").trim(),
    venue_name: String(formData.get("venue_name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function togglePublish(eventId: string, publish: boolean) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  await admin.from("tk_events").update({ is_published: publish }).eq("id", eventId);
  revalidatePath(`/admin/e/${eventId}`);
  revalidatePath("/");
}

export async function createStage(eventId: string, formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const startsAt = String(formData.get("starts_at") ?? "");
  const doors = String(formData.get("doors_open_at") ?? "");
  const { error } = await admin.from("tk_stages").insert({
    org_id: ORG_ID,
    event_id: eventId,
    name: String(formData.get("name") ?? "").trim(),
    starts_at: new Date(startsAt).toISOString(),
    doors_open_at: doors ? new Date(doors).toISOString() : null,
    sales_starts_at: new Date().toISOString(),
    sales_ends_at: new Date(startsAt).toISOString(),
  });
  if (error) throw new Error(error.message);
  await ensureStockRows(eventId);
  revalidatePath(`/admin/e/${eventId}`);
}

// エリア作成 + 指定席なら座席一括生成
// 行仕様: 1行1エントリ「A: 1-4 | 5-12」("|" が通路 = block_group 分割)
export async function createArea(eventId: string, formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const kind = String(formData.get("kind")) as "reserved" | "free";
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const capacity = Number(formData.get("free_capacity") ?? 0);
  const rowSpec = String(formData.get("row_spec") ?? "").trim();

  const { data: area, error } = await admin
    .from("tk_areas")
    .insert({
      org_id: ORG_ID,
      event_id: eventId,
      name,
      kind,
      free_capacity: kind === "free" ? capacity : null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (kind === "reserved" && rowSpec) {
    const seats: {
      org_id: string; area_id: string; row_label: string; seat_number: number;
      pos_x: number; pos_y: number; block_group: number;
    }[] = [];
    const lines = rowSpec.split("\n").map((l) => l.trim()).filter(Boolean);
    lines.forEach((line, rowIdx) => {
      const m = line.match(/^([^:：]+)[:：](.+)$/);
      if (!m) throw new Error(`行仕様が不正です: ${line}`);
      const rowLabel = m[1].trim();
      let x = 0;
      m[2].split("|").forEach((segment, blockIdx) => {
        const seg = segment.trim().match(/^(\d+)\s*-\s*(\d+)$/);
        if (!seg) throw new Error(`区間指定が不正です: ${segment}`);
        const from = Number(seg[1]);
        const to = Number(seg[2]);
        for (let n = from; n <= to; n++) {
          seats.push({
            org_id: ORG_ID,
            area_id: area.id,
            row_label: rowLabel,
            seat_number: n,
            pos_x: x++,
            pos_y: rowIdx,
            block_group: blockIdx,
          });
        }
        x += 1; // 通路分の空き
      });
    });
    const { error: seatErr } = await admin.from("tk_seats").insert(seats);
    if (seatErr) throw new Error(seatErr.message);
  }

  // 席種 + 既定券種(一般前売)を自動作成
  const { data: sc, error: scErr } = await admin
    .from("tk_seat_classes")
    .insert({ org_id: ORG_ID, event_id: eventId, area_id: area.id, name, price })
    .select()
    .single();
  if (scErr) throw new Error(scErr.message);
  await admin.from("tk_ticket_types").insert({
    org_id: ORG_ID,
    seat_class_id: sc.id,
    name: "一般前売",
    price,
    sales_channel: ["online", "door", "guest"],
  });

  await ensureStockRows(eventId);
  revalidatePath(`/admin/e/${eventId}`);
}

export async function createCast(eventId: string, formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim() || name.toLowerCase().replace(/\s+/g, "-");
  const { data: cast, error } = await admin
    .from("tk_casts")
    .insert({ org_id: ORG_ID, event_id: eventId, name, slug })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // 扱いルール(任意)
  const ruleType = String(formData.get("rule_type") ?? "");
  if (ruleType === "rate" || ruleType === "fixed" || ruleType === "quota") {
    await admin.from("tk_guarantee_rules").insert({
      org_id: ORG_ID,
      event_id: eventId,
      cast_id: cast.id,
      rule_type: ruleType,
      rate: ruleType === "rate" ? Number(formData.get("rate") ?? 0) / 100 : null,
      fixed_amount: ruleType === "fixed" ? Number(formData.get("fixed_amount") ?? 0) : null,
      quota_threshold: ruleType === "quota" ? Number(formData.get("quota_threshold") ?? 0) : null,
      quota_amount: ruleType === "quota" ? Number(formData.get("quota_amount") ?? 0) : null,
    });
  }
  revalidatePath(`/admin/e/${eventId}`);
}

// キャスト/スタッフのログインアカウント作成(招待制・要件は物販側8.4と整合)
export async function createAccount(formData: FormData) {
  await requireRole("admin");
  const admin = supabaseAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const castId = String(formData.get("cast_id") ?? "");
  if (!email || password.length < 8) throw new Error("メールアドレスと8文字以上のパスワードが必要です");
  if (!["staff", "cast", "admin"].includes(role)) throw new Error("ロールが不正です");

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  const userId = created.user.id;
  const { error: appErr } = await admin.from("tk_app_users").insert({
    user_id: userId,
    org_id: ORG_ID,
    role,
    display_name: displayName || email,
  });
  if (appErr) throw new Error(appErr.message);
  if (role === "cast" && castId) {
    await admin.from("tk_casts").update({ user_id: userId }).eq("id", castId);
  }
  revalidatePath("/admin");
}

export async function adminCancelOrder(orderId: string, eventId: string, reason: "buyer" | "organizer") {
  const user = await requireRole("admin");
  await cancelOrder({ orderId, reason, actorUserId: user.userId });
  revalidatePath(`/admin/e/${eventId}`);
}
