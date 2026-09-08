/**
 * 示例金融数据（模拟一个消费端本地的真实数据集）。
 * 确定性生成：2025-07 ~ 2026-06 × 4 区域，含营收/订单量/成本。
 */

const REGIONS = ["East", "North", "South", "West"];

export const columns = [
  { name: "month", type: "string" },
  { name: "region", type: "string" },
  { name: "revenue", type: "number" },
  { name: "orders", type: "number" },
  { name: "cost", type: "number" },
];

function seedRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function buildRows() {
  const rand = seedRand(20260905);
  const rows = [];
  const pad = (n) => String(n).padStart(2, "0");
  for (let m = 0; m < 12; m++) {
    // 2025-07 … 2025-12, 2026-01 … 2026-06
    const monthLabel = m < 6 ? `2025-${pad(m + 7)}` : `2026-${pad(m - 5)}`;
    for (const region of REGIONS) {
      const base = 800 + Math.floor(rand() * 1400); // 800~2200
      const regionK = 0.85 + REGIONS.indexOf(region) * 0.18;
      const revenue = Math.round(base * regionK * (1 + 0.05 * Math.sin(m / 2)));
      rows.push({
        month: monthLabel,
        region,
        revenue,
        orders: Math.round(revenue / 28),
        cost: Math.round(revenue * (0.55 + rand() * 0.2)),
      });
    }
  }
  return rows;
}

export const rows = buildRows();
