/**
 * Run the real shared optimiser against the bundled sales history and write the
 * deliverable plan files. No HTTP server needed - this is the exact same module
 * the browser and /api/pricing use.
 *
 * Run: npm run export:plan
 * Writes: data/optimal-selling-plan.csv and data/optimal-selling-plan.md
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  SAMPLE_SALES_CSV, SAMPLE_SALES_META,
  buildPricingCsv, buildPricingBrief, optimisePricing, parseSalesCsv,
} from '../src/shared/pricing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parsed = parseSalesCsv(SAMPLE_SALES_CSV);
if (parsed.errors.length) throw new Error(`sample data invalid: ${parsed.errors.join(', ')}`);

const result = optimisePricing({ rows: parsed.rows, city: 'guangzhou', lang: 'zh' });
const cur = result.city.currency;
const n = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

mkdirSync(path.join(root, 'data'), { recursive: true });
writeFileSync(path.join(root, 'data/optimal-selling-plan.csv'), buildPricingCsv(result, 'zh'), 'utf8');

const lines = [
  '# 最优售卖方案 · 临期食物孪生',
  '',
  `> 由导入的示例售卖数据实跑得出 · 生成时间 ${new Date().toISOString().slice(0, 10)} · 定价引擎 v${result.pricingVersion} · 共享规则引擎 v${result.engineVersion}`,
  '',
  '## 一、输入数据',
  '',
  `文件：\`data/sample-sales-history.csv\`（页面可下载副本：\`public/data/sample-sales-history.csv\`）`,
  '',
  `| 项目 | 值 |`,
  `| --- | --- |`,
  `| 记录数 | ${result.dataset.rows} 行 |`,
  `| 商品数 | ${result.dataset.skus} 个 SKU |`,
  `| 天数 | ${result.dataset.days} 天（${result.dataset.from} → ${result.dataset.to}）|`,
  `| 门店 | ${result.city.label} · 货币 ${cur} |`,
  `| 数据来源 | 由显式需求模型确定性生成的示例数据，非真实交易记录 |`,
  '',
  '必需列：`sku_id, list_price, selling_price, qty_sold`。可选列包含日期、品名、品类、单位、单重、进货成本、进货量、报废量、天气、日期类型、剩余保质期。',
  '',
  '## 二、方法',
  '',
  '1. **归一化**：先把每天销量按天气与日期类型还原到「典型工作日」水平，避免把台风天误判成价格不敏感。',
  '2. **拟合需求曲线**：对每个 SKU 做 `ln(销量) ~ ln(成交价 / 标价)` 最小二乘回归，斜率取负得到价格弹性；被库存截断（卖断货）的记录剔除。样本不足或价格无变化时回退到品类默认弹性并标注。',
  '3. **求解最优价**：在 0–60% 之间以 5% 为步长网格搜索，目标为「毛利 + 避免浪费的折算价值」，约束成交价不低于进货成本。',
  '4. **分时段阶梯**：按卖剩的库存，在 18:00 / 20:00 / 21:00 三个窗口重新求解；最后一小时放宽成本下限，因为另一条路是全额报废。',
  '',
  '## 三、今晚合计（18:00，典型工作日，剩 4 小时可卖）',
  '',
  '| 指标 | 不打折 | 采纳最优方案 | 变化 |',
  '| --- | ---: | ---: | ---: |',
  `| 售卖收入 | ${cur}${n(result.totals.revenueBaseline)} | ${cur}${n(result.totals.revenueOptimized)} | **+${cur}${n(result.totals.revenueDelta)}（+${result.totals.revenueDeltaPct}%）** |`,
  `| 售出件数 | ${result.totals.unitsSoldBaseline} | ${result.totals.unitsSoldOptimized} | +${result.totals.unitsSoldOptimized - result.totals.unitsSoldBaseline} |`,
  `| 当晚浪费食物 | ${n(result.totals.foodWastedKgBaseline)} kg | ${n(result.totals.foodWastedKgOptimized)} kg | **−${n(result.totals.foodRescuedKg)} kg** |`,
  `| 对应排放 | ${n(result.totals.co2eKgBaseline)} kg CO₂e | ${n(result.totals.co2eKgOptimized)} kg CO₂e | −${n(result.totals.co2eAvoidedKg)} kg CO₂e |`,
  `| 毛利 | ${cur}${n(result.totals.profitBaseline)} | ${cur}${n(result.totals.profitOptimized)} | ${cur}${n(result.totals.profitDelta)} |`,
  '',
  `> **权衡要说清楚**：收入上升的同时毛利下降 ${cur}${n(Math.abs(result.totals.profitDelta))}。这是用毛利换「少浪费 + 多卖出」的结果，不是免费午餐。页面上把「避免浪费权重」拖到 0，方案会退回几乎不打折、毛利回升；这正是该假设可被质疑、可被验证的地方。`,
  '',
  `> **对照原有规则引擎**：只看风险分给出的折扣，预计收入 ${cur}${n(result.totals.revenueRule)}；用历史弹性拟合后的最优价，预计收入 ${cur}${n(result.totals.revenueOptimized)}，多 ${cur}${n(result.totals.revenueVsRule)}。`,
  '',
  '## 四、逐件商品的最优价',
  '',
  '| 商品 | 在架 | 原价 | 弹性 / 拟合 | 最优折扣 | 建议售价 | 预计售出 | 收入变化 | 少浪费 | 规则引擎折扣 |',
  '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...result.plan.map((p) =>
    `| ${p.name} | ${p.onHand} | ${cur}${n(p.listPrice)} | ${p.elasticity} / ${p.method === 'regression' ? `回归 R²=${p.r2}` : '品类默认'} | −${p.optimalDiscount}% | **${cur}${n(p.optimalPrice)}** | ${p.expectedSold} | +${cur}${n(p.revenueDelta)} | ${n(p.foodRescuedKg)} kg | ${p.ruleDiscount}% |`),
  '',
  '完整字段（含进货成本、预计剩余、原价/建议价浪费、CO₂e、相比规则多增收、执行时间）见 `data/optimal-selling-plan.csv`。',
  '',
  '## 五、分时段价格阶梯',
  '',
  '| 商品 | 时段 | 标签价 | 预计售出 | 段后剩余 | 备注 |',
  '| --- | --- | ---: | ---: | ---: | --- |',
  ...result.schedule.flatMap((s) => s.stages.map((st) =>
    `| ${s.name} | ${st.time} | ${cur}${n(st.price)}（−${st.discount}%）| ${st.expectedSold} | ${st.leftAfter} | ${st.label}${st.relaxed ? ' · 放宽成本约束' : ''}${st.belowCost ? ' · 低于进货成本' : ''} |`)),
  '',
  '## 六、方法与假设',
  '',
  ...result.assumptions.map((a) => `- ${a}`),
  '',
  '## 七、文字版方案（可直接发给店长）',
  '',
  '```text',
  buildPricingBrief(result, 'zh'),
  '```',
  '',
  '---',
  '',
  '碳与水足迹因子为示意占位值，正式提交前需替换为公开食物 LCA 数据集；「约 1/3 食物被浪费」「约 10% 全球排放」两处页面文案也需补一手文献引用。',
  '',
];

writeFileSync(path.join(root, 'data/optimal-selling-plan.md'), lines.join('\n'), 'utf8');

console.log(`Plan exported from ${result.dataset.rows} rows / ${result.dataset.skus} SKUs`);
console.log(`  revenue ${cur}${n(result.totals.revenueBaseline)} → ${cur}${n(result.totals.revenueOptimized)} (+${result.totals.revenueDeltaPct}%)`);
console.log(`  waste   ${n(result.totals.foodWastedKgBaseline)} kg → ${n(result.totals.foodWastedKgOptimized)} kg (−${n(result.totals.foodRescuedKg)} kg)`);
console.log('  data/optimal-selling-plan.csv');
console.log('  data/optimal-selling-plan.md');
console.log(`Sample meta: ${JSON.stringify(SAMPLE_SALES_META)}`);
