export type Lang = 'zh' | 'en';

export interface Sku {
  id: string;
  name: string;
  cn: string;
  displayName: string;
  altName: string;
  qty: number;
  unit: string;
  unitLabel: string;
  unitKg: number;
  cost: number;
  expiryDays: number;
  soldAverage: number;
  category: string;
}

export interface CityMeta {
  key: string;
  label: string;
  city: string;
  short: string;
  currency: string;
  temp: number;
  note: string;
  channels: string[];
  dishes: string[];
}

/** A photo-recognition draft. Prices and weights come from the city pack, not the model. */
export interface SkuDraft {
  name: string;
  nameAlt?: string;
  category: string;
  unit: string;
  qty: number;
  expiryDays: number;
  unitKg?: number;
  cost?: number;
  soldAverage?: number;
}

export interface AnalyseInput {
  city?: string;
  weather?: string;
  dayType?: string;
  hour?: number;
  quantities?: number[] | null;
  skuOverrides?: SkuDraft[] | null;
  rescueRate?: number;
  lang?: Lang | string;
}

export interface Action {
  id: string;
  name: string;
  cn: string;
  displayName: string;
  altName: string;
  category: string;
  onShelf: number;
  unit: string;
  unitLabel: string;
  expiryDays: number;
  risk: number;
  unitsAtRisk: number;
  discount: number;
  startTime: string;
  channel: string;
  dish: string;
  massKg: number;
}

export interface AnalysisResult {
  engineVersion: string;
  mode: 'rules';
  lang: Lang;
  city: CityMeta;
  scenario: {
    weather: string;
    weatherLabel: string;
    dayType: string;
    dayTypeLabel: string;
    hour: number;
    sellingHoursLeft: number;
  };
  shelf: Sku[];
  metrics: {
    foodAtRiskKg: number;
    co2eKg: number;
    waterLitres: number;
    revenueRecovered: number;
    currency: string;
  };
  ranked: Array<{ id: string; name: string; risk: number }>;
  actions: Action[];
  advice: { window: string; text: string };
  ladder: Array<{ hour: number; discount: number }>;
  comparison: {
    rescueRate: number;
    doNothing: { foodWastedKg: number; co2eKg: number; revenueRecovered: number };
    followPlan: { foodRescuedKg: number; co2eAvoidedKg: number; revenueRecovered: number };
  };
  assumptions: string[];
}

export declare const ENGINE_VERSION: string;
export declare const CATEGORIES: readonly string[];
export declare const UNITS: readonly string[];
export declare const CO2_FACTORS: Readonly<Record<string, number>>;
export declare const WATER_FACTORS: Readonly<Record<string, number>>;
export declare const WEATHER: Readonly<Record<string, { label: string; factor: number }>>;
export declare const DAY_TYPES: Readonly<Record<string, { label: string; factor: number }>>;

export declare function cityKeys(): string[];
export declare function shelfFor(cityKey: string, lang?: Lang): Sku[];
export declare function buildShelf(cityKey: string, drafts?: SkuDraft[] | null, lang?: Lang): Sku[];
export declare function cityMeta(cityKey: string, lang?: Lang): CityMeta;
export declare function discountFor(risk: number, hour: number): number;
export declare function adviceFor(hour: number, lang?: Lang): { window: string; text: string };
export declare function analyse(input?: AnalyseInput): AnalysisResult;
export declare function compareCities(input?: AnalyseInput): Array<{ key: string; label: string; foodAtRiskKg: number; currency: string }>;
export declare function buildShiftCard(result: AnalysisResult, picked?: boolean[]): string;
export declare function buildFieldBrief(result: AnalysisResult): string;
