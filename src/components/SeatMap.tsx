"use client";

import { useMemo } from "react";
import type { SeatRow } from "@/lib/types";

const CELL = 30;

interface Props {
  seats: SeatRow[];
  takenSeatIds: Set<string>;
  selectedSeatIds: string[];
  onToggle?: (seatId: string) => void;
}

// 座席図(SVG)。pos_x / pos_y はレイアウト生成時に決めた論理座標
export default function SeatMap({ seats, takenSeatIds, selectedSeatIds, onToggle }: Props) {
  const { width, height } = useMemo(() => {
    const maxX = Math.max(0, ...seats.map((s) => Number(s.pos_x)));
    const maxY = Math.max(0, ...seats.map((s) => Number(s.pos_y)));
    return { width: (maxX + 2) * CELL, height: (maxY + 2) * CELL + 24 };
  }, [seats]);

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="select-none">
        <rect x={CELL / 2} y={2} width={width - CELL} height={16} rx={4} className="fill-neutral-700" />
        <text x={width / 2} y={14} textAnchor="middle" className="fill-neutral-300 text-[10px]">
          舞台 (STAGE)
        </text>
        {seats.map((s) => {
          const cx = (Number(s.pos_x) + 1) * CELL;
          const cy = (Number(s.pos_y) + 1) * CELL + 24;
          const taken = takenSeatIds.has(s.id);
          const selected = selectedSeatIds.includes(s.id);
          return (
            <g
              key={s.id}
              onClick={() => !taken && onToggle?.(s.id)}
              className={taken ? "cursor-not-allowed" : "cursor-pointer"}
            >
              <circle
                cx={cx}
                cy={cy}
                r={11}
                className={
                  taken
                    ? "fill-neutral-800 stroke-neutral-700"
                    : selected
                      ? "fill-amber-400 stroke-amber-300"
                      : "fill-neutral-200 stroke-neutral-400 hover:fill-amber-200"
                }
                strokeWidth={1}
              />
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                className={`pointer-events-none text-[8px] ${taken ? "fill-neutral-600" : "fill-neutral-900"}`}
              >
                {s.row_label}
                {s.seat_number}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-neutral-400">
        <span>○ 空席</span>
        <span className="text-amber-400">● 選択中</span>
        <span className="text-neutral-600">● 販売済み</span>
      </div>
    </div>
  );
}
