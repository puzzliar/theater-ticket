export type MemberKind = "cast" | "staff" | "director";
export type SessionKind = "rehearsal" | "performance" | "other";
export type SessionStatus = "scheduled" | "done" | "cancelled";
export type SceneStatus = "planned" | "done" | "skipped";
export type Response = "pending" | "yes" | "no" | "maybe";
export type Attendance = "unknown" | "present" | "absent" | "late";

export interface MemberRow {
  id: string;
  org_id: string;
  user_id: string | null;
  name: string;
  kind: MemberKind;
  email: string | null;
  line_user_id: string | null;
  line_link_code: string | null;
  line_link_expires_at: string | null;
  ical_token: string;
  is_active: boolean;
  created_at: string;
}

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

export interface ProductionMemberRow {
  production_id: string;
  member_id: string;
  part: MemberKind;
  role_name: string;
}

export interface SceneRow {
  id: string;
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
  member_id: string;
  required: boolean;
  response: Response;
  attendance: Attendance;
  note: string;
  notified_at: string | null;
}

export interface AvailabilityRow {
  id: string;
  member_id: string;
  starts_at: string;
  ends_at: string;
  status: "available" | "unavailable";
  note: string;
  source: "manual" | "calendar";
}

export interface SubstitutionRequestRow {
  id: string;
  session_id: string;
  absent_member_id: string;
  reason: string;
  status: "open" | "filled" | "cancelled";
  filled_by_member_id: string | null;
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

export const SESSION_KIND_LABEL: Record<SessionKind, string> = {
  rehearsal: "稽古",
  performance: "本番",
  other: "その他",
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: "予定",
  done: "完了",
  cancelled: "中止",
};

export const RESPONSE_LABEL: Record<Response, string> = {
  pending: "未回答",
  yes: "参加",
  no: "不参加",
  maybe: "未定",
};

export const ATTENDANCE_LABEL: Record<Attendance, string> = {
  unknown: "-",
  present: "出席",
  absent: "欠席",
  late: "遅刻",
};

export const MEMBER_KIND_LABEL: Record<MemberKind, string> = {
  cast: "キャスト",
  staff: "スタッフ",
  director: "演出",
};
