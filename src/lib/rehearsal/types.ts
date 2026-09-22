import type { Part } from "@/lib/core/types";

export type SessionKind = "rehearsal" | "performance" | "other";
export type SessionStatus = "scheduled" | "done" | "cancelled";
export type SceneStatus = "planned" | "done" | "skipped";
export type Response = "pending" | "yes" | "no" | "maybe";
export type Attendance = "unknown" | "present" | "absent" | "late";
export type NotifyChannel = "line" | "webpush" | "email" | "none";
export type NotifyKind = "digest" | "reminder" | "invite" | "substitution";

export interface ProductionRow {
  id: string;
  org_id: string;
  tk_event_id: string | null;
  name: string;
  status: "planning" | "rehearsing" | "running" | "closed";
  default_location: string;
  rehearsal_starts_on: string | null;
  opens_on: string | null;
  note: string;
  created_at: string;
}

// 組織内の参加者。profile_id が null なら仮メンバー(本人未登録)
export interface ParticipantRow {
  id: string;
  org_id: string;
  profile_id: string | null;
  display_name: string;
  part: Part;
  is_active: boolean;
  created_at: string;
}

export interface SceneRow {
  id: string;
  org_id: string;
  production_id: string;
  code: string;
  name: string;
  sort_order: number;
  target_count: number;
  note: string;
}

export interface SessionRow {
  id: string;
  org_id: string;
  production_id: string;
  kind: SessionKind;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  note: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface SessionSceneRow {
  session_id: string;
  scene_id: string;
  status: SceneStatus;
}

export interface SessionMemberRow {
  session_id: string;
  participant_id: string;
  org_id: string;
  required: boolean;
  response: Response;
  attendance: Attendance;
  note: string;
  notified_at: string | null;
  google_event_id: string | null;
}

export interface AvailabilityRow {
  id: string;
  profile_id: string;
  starts_at: string;
  ends_at: string;
  status: "available" | "unavailable";
  note: string;
  source: "manual" | "calendar";
}

export interface SubstitutionRequestRow {
  id: string;
  org_id: string;
  session_id: string;
  absent_participant_id: string;
  reason: string;
  status: "open" | "filled" | "cancelled";
  filled_by_participant_id: string | null;
  created_at: string;
  filled_at: string | null;
}

export interface SceneProgressRow {
  production_id: string;
  scene_id: string;
  code: string;
  name: string;
  sort_order: number;
  target_count: number;
  done_count: number;
  last_done_at: string | null;
}

export interface ProfileSettingsRow {
  profile_id: string;
  ical_token: string;
  line_link_code: string | null;
  line_link_expires_at: string | null;
  google_calendar_id: string;
  google_freebusy_import: boolean;
  notify_digest: NotifyChannel;
  notify_reminder: NotifyChannel;
  notify_invite: NotifyChannel;
  notify_substitution: NotifyChannel;
  updated_at: string;
}

export const SESSION_KIND_LABEL: Record<SessionKind, string> = { rehearsal: "稽古", performance: "本番", other: "その他" };
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = { scheduled: "予定", done: "完了", cancelled: "中止" };
export const RESPONSE_LABEL: Record<Response, string> = { pending: "未回答", yes: "参加", no: "不参加", maybe: "未定" };
export const ATTENDANCE_LABEL: Record<Attendance, string> = { unknown: "-", present: "出席", absent: "欠席", late: "遅刻" };
export const PRODUCTION_STATUS_LABEL: Record<ProductionRow["status"], string> = { planning: "準備中", rehearsing: "稽古中", running: "公演中", closed: "終了" };
export const CHANNEL_LABEL: Record<NotifyChannel, string> = { line: "LINE", webpush: "プッシュ通知", email: "メール", none: "送らない" };
export const NOTIFY_KIND_LABEL: Record<NotifyKind, string> = {
  digest: "毎朝の予定",
  reminder: "前日リマインド",
  invite: "召集・変更・中止",
  substitution: "代役募集・確定",
};
