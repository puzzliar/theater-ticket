// ギャランティ計算(チケット領域分)。販売時スナップショットを優先して適用する。
// 最終的な合算(物販込み)は事前物販OS側で行う(要件5.9)。

export interface SnapshotRule {
  rule_type: "rate" | "fixed" | "quota";
  rate: number | null;
  fixed_amount: number | null;
  quota_threshold: number | null;
  quota_amount: number | null;
}

export interface SoldUnit {
  unitPrice: number;
  snapshot: SnapshotRule | null;
}

// units: 有効チケット1枚ごとの単価とスナップショット(販売時ルール)
export function calcGuarantee(units: SoldUnit[]): number {
  // quota はチケット数に依存するため、ルールごとにグループ化して計算
  const groups = new Map<string, { rule: SnapshotRule; count: number; sales: number }>();
  for (const u of units) {
    if (!u.snapshot) continue;
    const key = JSON.stringify(u.snapshot);
    const g = groups.get(key) ?? { rule: u.snapshot, count: 0, sales: 0 };
    g.count += 1;
    g.sales += u.unitPrice;
    groups.set(key, g);
  }
  let total = 0;
  for (const { rule, count, sales } of groups.values()) {
    if (rule.rule_type === "rate" && rule.rate != null) {
      total += Math.round(sales * Number(rule.rate));
    } else if (rule.rule_type === "fixed" && rule.fixed_amount != null) {
      total += count * rule.fixed_amount;
    } else if (rule.rule_type === "quota" && rule.quota_amount != null) {
      const over = Math.max(0, count - (rule.quota_threshold ?? 0));
      total += over * rule.quota_amount;
    }
  }
  return total;
}
