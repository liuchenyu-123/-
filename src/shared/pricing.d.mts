import type { Lang } from './engine.mjs';

export interface SalesRow {
  date: string;
  skuId: string;
  name: string;
  nameEn: string;
  category: string;
  unit: string;
  unitKg: number;
  unitCost: number;
  listPrice: number;
  sellingPrice: number;
  qtyReceived: number;
  qtySold: number;
  qtyWasted: number;
  weather: string;
  dayType: string;
  expiryDays: number;
}

export interface SalesStats {
  rows: number;
  skus: number;
  days: number;
  from: string;
  to: string;
  truncated: boolean;
}

export interface ParseResult {
  rows: SalesRow[];
  errors: string[];
  warnings: string[];
  stats: SalesStats;
  missing?: string[];
}

export interface ElasticityProfile {
  skuId: string;
  name: string;
  nameEn: string;
  category: string;
  unit: string;
  unitKg: number;
  unitCost: number;
  listPrice: number;
  onHand: number;
  expiryDays: number;
  elasticity: number;
  baselineDemand: number;
  samples: number;
  priceLevels: number;
  method: 'regression' | 'fallback';
  r2: number;
  days: number;
  avgSold: number;
  avgWasted: number;
}

export interface MarkdownOutcome {
  discount: number;
  price: number;
  sold: number;
  leftover: number;
  wastedUnits: number;
  wastedKg: number;
  revenue: number;
  profit: number;
  co2eKg: number;
  wasteCredit: number;
  score?: number;
}

export interface PlanItem {
  skuId: string;
  name: string;
  altName: string;
  category: string;
  unit: string;
  unitLabel: string;
  unitKg: number;
  onHand: number;
  expiryDays: number;
  listPrice: number;
  unitCost: number;
  elasticity: number;
  samples: number;
  priceLevels: number;
  method: 'regression' | 'fallback';
  methodLabel: string;
  r2: number;
  confidence: 'fitted' | 'fallback';
  optimalDiscount: number;
  optimalPrice: number;
  expectedSold: number;
  expectedLeftover: number;
  baseline: MarkdownOutcome;
  optimized: MarkdownOutcome;
  revenueDelta: number;
  revenueDeltaPct: number;
  foodRescuedKg: number;
  co2eAvoidedKg: number;
  profitDelta: number;
  ruleDiscount: number;
  rulePrice: number;
  ruleRevenue: number;
  revenueVsRule: number;
  startTime: string;
  history: { days: number; avgSold: number; avgWasted: number };
}

export interface PricingTotals {
  currency: string;
  revenueBaseline: number;
  revenueOptimized: number;
  revenueRule: number;
  unitsSoldBaseline: number;
  unitsSoldOptimized: number;
  foodWastedKgBaseline: number;
  foodWastedKgOptimized: number;
  co2eKgBaseline: number;
  co2eKgOptimized: number;
  profitBaseline: number;
  profitOptimized: number;
  revenueDelta: number;
  revenueDeltaPct: number;
  foodRescuedKg: number;
  co2eAvoidedKg: number;
  profitDelta: number;
  revenueVsRule: number;
}

export interface ScheduleStage {
  time: string;
  label: string;
  discount: number;
  price: number;
  expectedSold: number;
  leftAfter: number;
  wastedKg: number;
  relaxed: boolean;
  belowCost: boolean;
}

export interface ScheduleItem {
  skuId: string;
  name: string;
  stages: ScheduleStage[];
}

export interface PricingResult {
  engineVersion: string;
  pricingVersion: string;
  lang: Lang;
  city: { key: string; label: string; short: string; currency: string };
  scenario: { hour: number; weather: string; dayType: string; sellingHoursLeft: number; windowRatio: number };
  knobs: { maxDiscount: number; wasteWeight: number; allowBelowCost: boolean; currency: string };
  dataset: SalesStats & { source: string };
  warnings: string[];
  totals: PricingTotals;
  plan: PlanItem[];
  schedule: ScheduleItem[];
  assumptions: string[];
}

export interface PricingInput {
  rows?: SalesRow[] | null;
  csv?: string | null;
  useSample?: boolean;
  city?: string;
  hour?: number;
  weather?: string;
  dayType?: string;
  maxDiscount?: number;
  wasteWeight?: number;
  allowBelowCost?: boolean;
  todayStock?: Record<string, number> | null;
  todayPrice?: Record<string, number> | null;
  lang?: Lang | string;
}

export declare const PRICING_VERSION: string;
export declare const SALES_COLUMNS: readonly string[];
export declare const REQUIRED_COLUMNS: readonly string[];
export declare const DEFAULT_ELASTICITY: Readonly<Record<string, number>>;
export declare const WEATHER_DEMAND_FACTOR: Readonly<Record<string, number>>;
export declare const DAY_DEMAND_FACTOR: Readonly<Record<string, number>>;
export declare const SAMPLE_SALES_CSV: string;
export declare const SAMPLE_SALES_META: Readonly<Record<string, string | number | boolean>>;

export declare function parseSalesCsv(csvText: string, options?: { maxRows?: number; maxSkus?: number }): ParseResult;
export declare function sampleSalesRows(): SalesRow[];
export declare function fitElasticity(rows: SalesRow[]): ElasticityProfile[];
export declare function optimisePricing(input?: PricingInput): PricingResult;
export declare function buildPricingCsv(result: PricingResult, lang?: Lang): string;
export declare function buildPricingBrief(result: PricingResult, lang?: Lang): string;
