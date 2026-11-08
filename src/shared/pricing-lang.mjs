/**
 * Engine-side language pack for the pricing optimiser.
 * Pure ESM, zero dependencies: only display strings live here. Every number and
 * rule stays in pricing.mjs so switching language can never change a result.
 */
import { resolveLang } from './engine-lang.mjs';

const zh = {
  assumptions: [
    '需求曲线由导入的历史售卖记录拟合：先按天气与日期类型归一化销量，再对 ln(销量) ~ ln(成交价/标价) 做最小二乘回归；样本不足或价格无变化时回退到品类默认弹性，并明确标注。',
    '优化目标是「毛利 + 避免浪费的折算价值」，在 0–设定上限之间以 5% 为步长网格搜索；默认约束成交价不低于进货成本。',
    '剩余时段需求按剩余可卖小时数 / 8 小时线性缩放；剩余 1 天的商品不可结转，剩余 2 天以上按 35% 比例结转，不计入当晚浪费。',
    '碳因子为示意占位值，待替换为公开食物 LCA 数据集；示例售卖数据由显式需求模型确定性生成，不是真实交易记录。',
  ],
  methods: { regression: '历史回归', fallback: '品类默认' },
  csv: {
    fileName: 'optimal-selling-plan.csv',
    headers: [
      '商品', '品类', '今日在架', '标价', '进货成本', '拟合弹性', '样本数', '拟合方式',
      '建议折扣', '建议售价', '预计售出', '预计剩余', '原价预计收入', '建议价预计收入',
      '收入变化', '收入变化率', '原价浪费kg', '建议价浪费kg', '减少浪费kg', '避免CO2e kg',
      '规则引擎折扣', '相比规则多增收', '执行时间',
    ],
  },
  brief: {
    title: '最优售卖方案  /  临期食物孪生',
    intro: (days, rows, skus, city) => `依据 ${days} 天、${rows} 条、${skus} 个 SKU 的历史售卖记录（${city}）拟合需求弹性，并对今晚每个 SKU 网格搜索最优折扣。`,
    assumptionsTitle: '方法与假设',
    tableTitle: '逐件商品的价格建议',
    line: (n, discount, price, cur, sold, waste, delta) =>
      `${n}：降 ${discount}%，售价 ${cur}${price}，预计售出 ${sold} 件，减少浪费 ${waste} kg，收入 ${delta >= 0 ? '增加' : '减少'} ${cur}${Math.abs(delta)}`,
    totalsTitle: '今晚合计',
    totals: (cur, delta, pct, food, co2) =>
      `收入 ${cur}${delta}（${pct}%），少浪费 ${food} kg 食物，避免约 ${co2} kg CO₂e。`,
    ladderTitle: '分时段价格阶梯（前三件）',
    ladderLine: (time, name, discount, cur, price) => `${time} · ${name} 降 ${discount}% → ${cur}${price}`,
    footer: 'AI for Climate · 青年气候行动创作营 · COP31 安塔利亚 · 示例估算',
  },
  stages: [
    { time: '18:00', label: '开门促销' },
    { time: '20:00', label: '晚间加推' },
    { time: '21:00', label: '打烊前最后一轮' },
  ],
};

const en = {
  assumptions: [
    'Demand is fitted from the imported sales history: quantities are normalised for weather and day type, then ln(quantity) is regressed on ln(paid price / list price). SKUs with too few samples or no price variation fall back to a category default and are labelled as such.',
    'The objective is gross profit plus a credit for waste avoided, searched over discounts from 0 to the configured cap in 5% steps. By default the paid price may not fall below unit cost.',
    'Remaining-window demand scales linearly with selling hours left / 8. Items with one day left cannot be carried over; items with two or more days carry 35% of leftovers and those are not counted as tonight\'s waste.',
    'Emission factors are illustrative placeholders pending a published food LCA dataset. The sample sales history is generated deterministically from an explicit demand model, not real transactions.',
  ],
  methods: { regression: 'History regression', fallback: 'Category default' },
  csv: {
    fileName: 'optimal-selling-plan.csv',
    headers: [
      'Item', 'Category', 'On shelf', 'List price', 'Unit cost', 'Fitted elasticity', 'Samples', 'Fit method',
      'Optimal discount', 'Optimal price', 'Expected sold', 'Expected leftover', 'Baseline revenue', 'Plan revenue',
      'Revenue delta', 'Revenue delta %', 'Baseline waste kg', 'Plan waste kg', 'Waste avoided kg', 'CO2e avoided kg',
      'Rule-engine discount', 'Revenue vs rule', 'Start time',
    ],
  },
  brief: {
    title: 'OPTIMAL SELLING PLAN  /  Best-Before Twin',
    intro: (days, rows, skus, city) => `Price elasticity was fitted from ${rows} sales records across ${days} days and ${skus} SKUs (${city}), then the optimal markdown was searched per SKU for tonight.`,
    assumptionsTitle: 'Method & assumptions',
    tableTitle: 'Per-item price recommendations',
    line: (n, discount, price, cur, sold, waste, delta) =>
      `${n}: ${discount}% off at ${cur}${price}, ~${sold} units sold, ${waste} kg waste avoided, revenue ${delta >= 0 ? 'up' : 'down'} ${cur}${Math.abs(delta)}`,
    totalsTitle: 'Tonight in total',
    totals: (cur, delta, pct, food, co2) =>
      `${cur}${delta} revenue (${pct}%), ${food} kg less food wasted, about ${co2} kg CO2e avoided.`,
    ladderTitle: 'Time-phased markdown ladder (top 3 items)',
    ladderLine: (time, name, discount, cur, price) => `${time} · ${name} ${discount}% off → ${cur}${price}`,
    footer: 'AI for Climate · Youth Hackathon · COP31 Antalya · illustrative estimate',
  },
  stages: [
    { time: '18:00', label: 'Evening start' },
    { time: '20:00', label: 'Second push' },
    { time: '21:00', label: 'Final hour' },
  ],
};

const TEXT = { zh, en };

/** @param {unknown} lang */
export function pricingText(lang) {
  return TEXT[resolveLang(lang)];
}
