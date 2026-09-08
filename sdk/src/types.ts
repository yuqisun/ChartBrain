/**
 * ChartBrain 中性 spec 的类型定义（与 specs/chart-spec.schema.json v0.1 对应）。
 * 服务端产出的 spec 均满足这里声明的结构；SDK 按此结构确定性执行。
 */

export type ChartType = "bar" | "line" | "pie" | "scatter" | "area";

export type ValueType = "categorical" | "numeric" | "temporal";

export type AggOp = "sum" | "avg" | "count" | "countDistinct" | "min" | "max";

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "contains";

export type Scalar = string | number | boolean;

export interface EncodingSpec {
  field: string;
  value_type?: ValueType;
}

export interface FilterStep {
  op: "filter";
  field: string;
  operator: FilterOperator;
  value?: Scalar | Scalar[];
  values?: Scalar | Scalar[];
}

export interface Measure {
  /** agg=count 时可省略 field */
  field?: string;
  agg: AggOp;
  as: string;
}

export interface AggregateStep {
  op: "aggregate";
  group_by?: string[];
  measures: Measure[];
}

export interface SortStep {
  op: "sort";
  by: string;
  order?: "asc" | "desc";
}

export interface LimitStep {
  op: "limit";
  n: number;
}

export type ArithOp = "add" | "subtract" | "multiply" | "divide";

/** derive 的操作数：引用现有列或数字常量。 */
export interface Operand {
  field?: string;
  value?: number;
}

export interface DeriveStep {
  op: "derive";
  as: string;
  left: Operand;
  operator: ArithOp;
  right: Operand;
}

export type TimeGranularity = "month" | "quarter" | "year";

export interface BinTimeStep {
  op: "binTime";
  field: string;
  granularity: TimeGranularity;
  as: string;
}

export type TransformStep =
  | FilterStep
  | AggregateStep
  | SortStep
  | LimitStep
  | DeriveStep
  | BinTimeStep;

export interface ChartSpec {
  schema_version: number;
  chart: { type: ChartType; title?: string };
  transform_plan?: { steps: TransformStep[] };
  encodings: Partial<Record<"x" | "y" | "series", EncodingSpec>>;
}

/** 数据行：扁平对象。 */
export type Row = Record<string, unknown>;
