-- 契約ビューをキャスト単位の正しい集計に修正(数量・返金の扱いを整理)
drop view tk_ticket_sales_by_cast_v1;
create view tk_ticket_sales_by_cast_v1 as
with per_order as (
  select o.id as order_id, o.org_id, s.event_id, o.stage_id, o.cast_id,
    count(t.id) filter (where t.checkin_status <> 'void') as ticket_count,
    coalesce(sum(oi.unit_price) filter (where t.checkin_status <> 'void'), 0) as gross,
    count(t.id) filter (where t.checkin_status = 'checked_in') as attendance
  from tk_orders o
  join tk_order_items oi on oi.order_id = o.id
  join tk_tickets t on t.order_item_id = oi.id
  join tk_stages s on s.id = o.stage_id
  where o.payment_status in ('paid','partially_refunded') and o.status = 'active'
  group by o.id, o.org_id, s.event_id, o.stage_id, o.cast_id
),
refunds as (
  select order_id, sum(refund_amount) as refunded
  from tk_cancellations group by order_id
)
select p.org_id, p.event_id, p.stage_id, p.cast_id,
  sum(p.ticket_count) as ticket_count,
  sum(p.gross - coalesce(r.refunded, 0)) as net_sales,
  sum(p.attendance) as attendance
from per_order p
left join refunds r on r.order_id = p.order_id
group by p.org_id, p.event_id, p.stage_id, p.cast_id;
