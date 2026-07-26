import type { SeatRow } from "@/lib/types";

// 連番席自動割当 (docs/domain-model.md 5.4)
// 同一行(row_label)×同一ブロック(block_group)内で seat_number が連続する空き区間を探す。
// 前方の行(pos_y が小さい順) → 区間中央寄りを優先。
export function allocateContiguous(
  seats: SeatRow[],
  takenSeatIds: Set<string>,
  qty: number,
): { seatIds: string[]; contiguous: boolean } | null {
  const free = seats.filter((s) => s.is_active && !takenSeatIds.has(s.id));
  if (free.length < qty) return null;

  // 行×ブロックごとにグループ化し、番号順に並べる
  const groups = new Map<string, SeatRow[]>();
  for (const s of free) {
    const key = `${s.row_label}__${s.block_group}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  const candidates: SeatRow[][] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.seat_number - b.seat_number);
    // 連続区間を列挙
    let run: SeatRow[] = [];
    for (const s of group) {
      if (run.length === 0 || s.seat_number === run[run.length - 1].seat_number + 1) {
        run.push(s);
      } else {
        if (run.length >= qty) candidates.push(run);
        run = [s];
      }
    }
    if (run.length >= qty) candidates.push(run);
  }

  if (candidates.length > 0) {
    // 前方の行を優先(pos_yの小さい区間)
    candidates.sort((a, b) => a[0].pos_y - b[0].pos_y);
    const best = candidates[0];
    // 区間中央寄りに qty 席を切り出す
    const start = Math.floor((best.length - qty) / 2);
    return { seatIds: best.slice(start, start + qty).map((s) => s.id), contiguous: true };
  }

  // 連番が取れない場合: 前方から順に qty 席(離れ席)。呼び出し側で了承確認を行うこと
  const sorted = [...free].sort(
    (a, b) => a.pos_y - b.pos_y || a.row_label.localeCompare(b.row_label) || a.seat_number - b.seat_number,
  );
  return { seatIds: sorted.slice(0, qty).map((s) => s.id), contiguous: false };
}
