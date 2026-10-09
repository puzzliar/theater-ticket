import "server-only";
import { cookies } from "next/headers";
import type { Mode } from "./types";
import type { SessionUser } from "./session";

// 利用モード(出演者/主催者)。切り替えは Cookie に即時反映し、既定値として core_profiles.active_mode にも保存する
export const MODE_COOKIE = "zagumi_mode";

export function isMode(v: unknown): v is Mode {
  return v === "cast" || v === "organizer";
}

export async function getMode(user: Pick<SessionUser, "profile"> | null): Promise<Mode> {
  const c = (await cookies()).get(MODE_COOKIE)?.value;
  if (isMode(c)) return c;
  return user?.profile.active_mode ?? "cast";
}

export function modeHome(mode: Mode): string {
  return mode === "organizer" ? "/manage" : "/me";
}
