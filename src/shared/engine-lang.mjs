/**
 * Engine-side language packs.
 *
 * Pure ESM, zero dependencies: this module is imported by engine.mjs, which runs in
 * both Node (API routes, unit tests) and the browser. Only display strings live here;
 * all numbers and rules stay language-independent in engine.mjs.
 */

export const DEFAULT_LANG = 'zh';

/** @param {unknown} value @returns {'zh'|'en'} */
export function resolveLang(value) {
  return value === 'en' ? 'en' : 'zh';
}

const en = {
  weather: {
    normal: 'Typical day',
    heat: 'Heat wave',
    rain: 'Heavy rain / typhoon',
  },
  dayTypes: {
    weekday: 'Weekday',
    weekend: 'Weekend',
    holiday: 'Holiday / event',
  },
  units: {
    cup: 'cup', bunch: 'bunch', loaf: 'loaf', box: 'box', pc: 'pc',
    bottle: 'bottle', kg: 'kg', tub: 'tub', pack: 'pack',
  },
  cities: {
    guangzhou: {
      label: 'Guangzhou · community store',
      city: 'Guangzhou, China',
      short: 'Guangzhou',
      note: 'Humid heat, afternoon thunderstorms swing evening footfall',
      channels: ['WeChat neighbourhood group', 'office lunch groups', 'markdown app'],
      dishes: ['mango sago', 'yogurt fruit cup', 'overnight oats'],
    },
    antalya: {
      label: 'Antalya · COP31 pop-up',
      city: 'Antalya, Türkiye',
      short: 'Antalya',
      note: 'Conference week lifts visitor footfall by about 22%',
      channels: ['mahalle WhatsApp group', 'venue pop-up board', 'hotel kitchens'],
      dishes: ['cacık', 'menemen', 'ayran'],
    },
    manila: {
      label: 'Manila · sari-sari store',
      city: 'Manila, Philippines',
      short: 'Manila',
      note: 'Typhoon watch makes both supply and demand unstable',
      channels: ['barangay FB group', 'sari-sari network', 'school canteen'],
      dishes: ['banana cue', 'fruit shake', 'fried rice box'],
    },
  },
  advice: [
    { window: '14:00-16:00 · Prepare', text: 'Flag the three at-risk SKUs and print the markdown labels before the evening rush.' },
    { window: '16:00-18:00 · Label and post', text: 'Put the labels on shelf and post a first notice to the neighbourhood channel.' },
    { window: '18:00-20:00 · Push and convert', text: 'Push the bundles to nearby groups and start turning surplus into ready-to-sell dishes.' },
    { window: '20:00-22:00 · Last call', text: 'Deepen the markdown, then donate or reroute anything still unsold to staff meals.' },
  ],
  assumptions: [
    'Deterministic rule engine with sample shelf data, not a trained forecast.',
    'The plan is assumed to rescue 75% of predicted surplus unless overridden.',
    'Emission and water factors are placeholders pending a published food LCA dataset.',
  ],
  shift: {
    title: "TONIGHT'S SHIFT CARD  /  Best-Before Twin",
    empty: 'No actions selected. Tick at least one action above.',
    unitsAtRisk: (n, unit) => `${n} ${unit} at risk`,
    discount: (d, t) => `${d}% markdown from ${t}`,
    channel: (c) => `Post to: ${c}`,
    dish: (d) => `Convert surplus into: ${d}`,
    expected: (food, co2, cur, money) => `Expected: ${food} kg rescued, ${co2} kg CO2e avoided, ${cur}${money} recovered.`,
    assumption: 'Assumption: the plan rescues 75% of predicted surplus. Illustrative estimate.',
  },
  brief: {
    title: 'FIELD BRIEF  /  Best-Before Twin',
    scan: (skus, food, co2) => `The model scanned ${skus} SKUs and flagged three at risk of going unsold tonight - about ${food} kg of food and ${co2} kg CO2e.`,
    actions: (discounts, start, channel, dish) => `Recommended actions: a tiered markdown of ${discounts} from ${start}, pushed through ${channel}, with surplus rerouted into ${dish}.`,
    week: (food, cur, money) => `Run daily for a week, one small store avoids roughly ${food} kg of waste and recovers about ${cur}${money} in revenue that would otherwise be written off.`,
    input: 'No hardware, no POS integration: the input is one shelf photo or a plain purchase list. Local discount rules, channels and rescue recipes come from teammates in each country.',
    footer: 'AI for Climate · Youth Hackathon · COP31 Antalya',
  },
};

const zh = {
  weather: {
    normal: '典型日',
    heat: '热浪',
    rain: '暴雨 / 台风',
  },
  dayTypes: {
    weekday: '工作日',
    weekend: '周末',
    holiday: '节假日 / 活动日',
  },
  units: {
    cup: '杯', bunch: '把', loaf: '条', box: '盒', pc: '个',
    bottle: '瓶', kg: '公斤', tub: '盒', pack: '包',
  },
  cities: {
    guangzhou: {
      label: '广州 · 社区小店',
      city: '中国广州',
      short: '广州',
      note: '湿热、午后雷阵雨，傍晚客流波动大',
      channels: ['社区微信群', '写字楼午餐群', '临期降价小程序'],
      dishes: ['芒果西米露', '酸奶水果杯', '隔夜燕麦'],
    },
    antalya: {
      label: '安塔利亚 · COP31 快闪',
      city: '土耳其安塔利亚',
      short: '安塔利亚',
      note: '大会周带来约 22% 的外来访客增量',
      channels: ['街区 WhatsApp 群', '会场快闪公告板', '酒店后厨'],
      dishes: ['cacık 黄瓜酸奶', 'menemen 番茄炒蛋', 'ayran 咸酸奶'],
    },
    manila: {
      label: '马尼拉 · sari-sari 小店',
      city: '菲律宾马尼拉',
      short: '马尼拉',
      note: '台风预警让进货与需求同时不稳',
      channels: ['社区 FB 群', 'sari-sari 小店互助网', '学校食堂'],
      dishes: ['banana cue 焦糖炸香蕉', '水果奶昔', '炒饭便当'],
    },
  },
  advice: [
    { window: '14:00–16:00 · 准备', text: '标出三件高风险商品，趁晚高峰前把降价标签打印好。' },
    { window: '16:00–18:00 · 贴标并预告', text: '把标签上货架，在社区群里发第一条预告。' },
    { window: '18:00–20:00 · 推送与转化', text: '把组合优惠推给附近群组，开始把剩余食材改成可直接售卖的餐食。' },
    { window: '20:00–22:00 · 最后一轮', text: '加大折扣；仍未售出的转作员工餐或捐赠。' },
  ],
  assumptions: [
    '确定性规则引擎 + 示例货架数据，不是训练出来的预测模型。',
    '默认假设该方案可挽回 75% 的预测剩余量，可手动覆盖。',
    '碳排放与水足迹因子为占位值，待替换为公开食物 LCA 数据集。',
  ],
  shift: {
    title: '今晚值班表  /  临期食物孪生',
    empty: '未勾选任何动作。请至少勾选上面的一项。',
    unitsAtRisk: (n, unit) => `${n} ${unit}有滞销风险`,
    discount: (d, t) => `${t} 起降价 ${d}%`,
    channel: (c) => `推送到：${c}`,
    dish: (d) => `剩余改做：${d}`,
    expected: (food, co2, cur, money) => `预计挽回 ${food} kg 食物、避免 ${co2} kg CO₂e、回收 ${cur}${money}。`,
    assumption: '假设：方案可挽回 75% 预测剩余量，数字为示例估算。',
  },
  brief: {
    title: '现场简报  /  临期食物孪生',
    scan: (skus, food, co2) => `模型扫描了 ${skus} 个 SKU，标记出 3 件今晚可能卖不掉的商品——约 ${food} kg 食物、${co2} kg CO₂e。`,
    actions: (discounts, start, channel, dish) => `建议动作：${start} 起分档降价 ${discounts}，通过${channel}推送，剩余食材改做${dish}。`,
    week: (food, cur, money) => `连续运行一周，一家小店可少浪费约 ${food} kg 食物，并回收约 ${cur}${money} 本会被核销的收入。`,
    input: '无需硬件、无需对接收银系统：输入只是一张货架照片或一张手写进货单。各地降价规则、推送渠道与剩余食材做法，由各国队友提供。',
    footer: 'AI for Climate · 青年气候行动创作营 · COP31 安塔利亚',
  },
};

const TEXT = { zh, en };

/** @param {unknown} lang */
export function text(lang) {
  return TEXT[resolveLang(lang)];
}
