export type Role = "admin" | "staff" | "cast";

export interface EventRow {
  id: string;
  org_id: string;
  name: string;
  description: string;
  venue_name: string;
  is_published: boolean;
  created_at: string;
}

export interface StageRow {
  id: string;
  event_id: string;
  name: string;
  starts_at: string;
  doors_open_at: string | null;
  sales_starts_at: string | null;
  sales_ends_at: string | null;
}

export interface AreaRow {
  id: string;
  event_id: string;
  name: string;
  kind: "reserved" | "free";
  free_capacity: number | null;
}

export interface SeatRow {
  id: string;
  area_id: string;
  row_label: string;
  seat_number: number;
  pos_x: number;
  pos_y: number;
  block_group: number;
  is_active: boolean;
}

export interface SeatClassRow {
  id: string;
  event_id: string;
  area_id: string;
  name: string;
  price: number;
}

export interface TicketTypeRow {
  id: string;
  seat_class_id: string;
  name: string;
  price: number;
  sales_channel: string[];
  is_active: boolean;
}

export interface CastRow {
  id: string;
  event_id: string;
  name: string;
  slug: string;
  user_id: string | null;
}

export interface GuaranteeRuleRow {
  id: string;
  event_id: string;
  cast_id: string;
  rule_type: "rate" | "fixed" | "quota";
  rate: number | null;
  fixed_amount: number | null;
  quota_threshold: number | null;
  quota_amount: number | null;
  effective_from: string;
}

export interface OrderRow {
  id: string;
  org_id: string;
  stage_id: string;
  channel: "general" | "guest" | "door";
  cast_id: string | null;
  buyer_name: string;
  buyer_email: string | null;
  payment_method: "online" | "cash_at_door" | "cast_paid";
  settlement_method: "online" | "cash_at_door" | "cash_with_organizer" | null;
  payment_status: "pending" | "paid" | "cancelled" | "refunded" | "partially_refunded";
  total: number;
  status: "active" | "cancelled";
  manage_token: string;
  created_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  ticket_type_id: string;
  qty: number;
  unit_price: number;
  guarantee_snapshot: Record<string, unknown> | null;
}

export interface TicketRow {
  id: string;
  order_item_id: string;
  stage_id: string;
  seat_id: string | null;
  entry_number: number | null;
  qr_token: string;
  holder_name: string | null;
  checkin_status: "not_checked_in" | "checked_in" | "void";
  checked_in_at: string | null;
}

export interface StockRow {
  stage_id: string;
  area_id: string;
  capacity: number;
  remaining: number;
  next_entry_number: number;
}
