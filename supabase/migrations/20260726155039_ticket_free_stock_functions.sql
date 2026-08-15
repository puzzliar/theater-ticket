-- 自由席在庫のアトミック消費(整理番号レンジ確保)・復元。service role専用
create function tk_consume_free_stock(p_stage uuid, p_area uuid, p_qty int)
returns int language plpgsql as $$
declare v_next int;
begin
  update tk_stage_area_stock
    set remaining = remaining - p_qty,
        next_entry_number = next_entry_number + p_qty
  where stage_id = p_stage and area_id = p_area and remaining >= p_qty
  returning next_entry_number into v_next;
  if v_next is null then
    return null;  -- 在庫不足
  end if;
  return v_next - p_qty;  -- 採番開始番号
end $$;

create function tk_restore_free_stock(p_stage uuid, p_area uuid, p_qty int)
returns void language plpgsql as $$
begin
  update tk_stage_area_stock
    set remaining = least(capacity, remaining + p_qty)
  where stage_id = p_stage and area_id = p_area;
end $$;

revoke execute on function tk_consume_free_stock(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function tk_restore_free_stock(uuid, uuid, int) from public, anon, authenticated;
