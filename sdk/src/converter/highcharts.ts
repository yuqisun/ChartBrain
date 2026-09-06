/**
 * Highcharts 确定性转换器（D6/D13，库知识所在）。
 *
 * 输入：变换后的最终表（encodings 引用的列已存在）+ 中性 spec；
 * 输出：可直接交给 Highcharts 渲染的 option 对象（结构与 Highcharts.Options 兼容）。
 *
 * MVP 覆盖：bar/line/pie/scatter/area，x 为分类轴（bar/line/area）、可选 series 分组。
 */

import type { ChartSpec, EncodingSpec, Row } from "../types";

export interface HighchartsSeries {
  name: string;
  data: Array<number | Array<string | number> | { name: string; y: number }>;
  type?: string;
}

export interface HighchartsOption {
  chart: { type: string };
  title: { text: string };
  xAxis?: { categories?: string[]; title?: { text: string } };
  yAxis?: { title: { text: string } };
  series: HighchartsSeries[];
}

const TYPE_MAP: Record<string, string> = {
  bar: "column",
  line: "line",
  pie: "pie",
  scatter: "scatter",
  area: "area",
};

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function label(v: unknown): string {
  return String(v ?? "");
}

function firstSeen(rows: Row[], field: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const k = label(row[field]);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function groupRows(rows: Row[], field: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const k = label(row[field]);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(row);
  }
  return map;
}

export function toHighcharts(data: Row[], spec: ChartSpec): HighchartsOption {
  const { chart, encodings } = spec;
  const type = TYPE_MAP[chart.type] ?? "column";
  const title = chart.title ?? "";
  const x = encodings.x as EncodingSpec | undefined;
  const y = encodings.y as EncodingSpec | undefined;
  const seriesEnc = encodings.series as EncodingSpec | undefined;

  if (chart.type === "pie") {
    const name = y?.field ?? "value";
    return {
      chart: { type },
      title: { text: title },
      series: [
        {
          type: "pie",
          name,
          data: data.map((r) => ({
            name: x ? label(r[x.field]) : "",
            y: y ? toNumber(r[y.field]) : 0,
          })),
        },
      ],
    };
  }

  if (chart.type === "scatter") {
    const name = seriesEnc?.field ?? (title || (y?.field ?? ""));
    return {
      chart: { type },
      title: { text: title },
      xAxis: { title: { text: x?.field ?? "" } },
      yAxis: { title: { text: y?.field ?? "" } },
      series: [
        {
          name,
          data: data.map((r) => [
            x ? toNumber(r[x.field]) : 0,
            y ? toNumber(r[y.field]) : 0,
          ]),
        },
      ],
    };
  }

  // bar / line / area：分类 x + 数值 y（可选 series 拆多系列）
  const categories = x ? firstSeen(data, x.field) : [];
  if (seriesEnc) {
    const seriesOut: HighchartsSeries[] = [];
    const groups = groupRows(data, seriesEnc.field);
    for (const [name, rows] of groups) {
      const perCat = new Map<string, number>();
      for (const row of rows) {
        perCat.set(x ? label(row[x.field]) : "", y ? toNumber(row[y.field]) : 0);
      }
      seriesOut.push({
        name,
        data: categories.map((c) => perCat.get(c) ?? 0),
      });
    }
    return {
      chart: { type },
      title: { text: title },
      xAxis: { categories, title: { text: x?.field ?? "" } },
      yAxis: { title: { text: y?.field ?? "" } },
      series: seriesOut,
    };
  }

  return {
    chart: { type },
    title: { text: title },
    xAxis: { categories, title: { text: x?.field ?? "" } },
    yAxis: { title: { text: y?.field ?? "" } },
    series: [
      {
        name: title || (y?.field ?? ""),
        data: data.map((r) => (y ? toNumber(r[y.field]) : 0)),
      },
    ],
  };
}
