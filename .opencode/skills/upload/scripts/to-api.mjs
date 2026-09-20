import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {import('node:fs').PathLike} PathLike */

const PRICE_KEYS = {
  tip: 'tipPrice',
  peak: 'peakPrice',
  flat: 'flatPrice',
  valley: 'valleyPrice',
  deepValley: 'deepValleyPrice',
};

/** region 枚举 → regions.json label（有区时 name 前缀用 label 替代省份） */
const REGION_LABEL_BY_ID = (() => {
  const regionsPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'parse', 'regions.json');
  /** @type {Record<string, Array<{ region: string, label: string }>>} */
  const raw = JSON.parse(readFileSync(regionsPath, 'utf8'));
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const list of Object.values(raw)) {
    for (const item of list ?? []) {
      if (item?.region && item?.label) map.set(String(item.region), String(item.label));
    }
  }
  return map;
})();

/**
 * name 前缀：无区用省份；有区用 regions.json 的 label（如 广东深圳）。
 * @param {Record<string, unknown>} row
 */
export function namePrefix(row) {
  const region = row.region;
  if (region != null && region !== '') {
    const label = REGION_LABEL_BY_ID.get(String(region));
    if (label) return label;
  }
  return row.province ?? '';
}

/**
 * @param {string} type
 * @param {{ tipPrice?: number|null, peakPrice?: number|null, flatPrice?: number|null, valleyPrice?: number|null, deepValleyPrice?: number|null }} prices
 * @returns {number|null|undefined}
 */
export function priceOf(type, prices) {
  const key = PRICE_KEYS[type];
  return key ? prices?.[key] : undefined;
}

/**
 * @param {{ periods?: Array<{ start: string, end: string, type: string }>, prices?: Record<string, number|null> }} row
 * @returns {Array<{ periodType: string, startTime: string, endTime: string, price: number }>}
 */
export function toTouPeriods(row) {
  const periods = row.periods ?? [];
  const prices = row.prices ?? {};
  const touPeriods = [];

  for (const p of periods) {
    const price = priceOf(p.type, prices);
    if (price == null) continue;
    touPeriods.push({
      periodType: p.type,
      startTime: p.start,
      endTime: p.end,
      price,
    });
  }

  return touPeriods;
}

/** 入库只准这三项 */
export const API_CUSTOMER_CATEGORIES = Object.freeze([
  'TWO_PART_LARGE_INDUSTRY',
  'TWO_PART_GENERAL_COMMERCIAL',
  'SINGLE_PART_GENERAL_COMMERCIAL',
]);

/** 入库只准这六档，不要 LEVEL_BELOW_1 / LEVEL_35_110 */
export const API_VOLTAGE_LEVELS = Object.freeze([
  'LEVEL_1_10',
  'LEVEL_20',
  'LEVEL_35',
  'LEVEL_110',
  'LEVEL_220',
  'LEVEL_220_PLUS',
]);

const API_CUSTOMER_SET = new Set(API_CUSTOMER_CATEGORIES);
const API_VOLTAGE_SET = new Set(API_VOLTAGE_LEVELS);

const CATEGORY_LABEL = Object.freeze({
  LARGE_INDUSTRY: '大工业用电',
  GENERAL_COMMERCIAL: '一般工商业用电',
});

const TARIFF_LABEL = Object.freeze({
  SINGLE_PART: '单一制',
  TWO_PART: '两部制',
});

const VOLTAGE_LABEL = Object.freeze({
  LEVEL_1_10: '1-10千伏',
  LEVEL_20: '20千伏',
  LEVEL_35: '35千伏',
  LEVEL_110: '110千伏',
  LEVEL_220: '220千伏',
  LEVEL_220_PLUS: '220千伏及以上',
});

/**
 * name 用枚举中文含义拼接，不要拼英文字段值。
 * @param {unknown} place 省份，或有区时的 region label
 * @param {string} customerCategory
 * @param {string} tariffMode
 * @param {string} voltageLevel
 */
export function toPolicyName(place, customerCategory, tariffMode, voltageLevel) {
  const cat = CATEGORY_LABEL[customerCategory];
  const tariff = TARIFF_LABEL[tariffMode];
  const volt = VOLTAGE_LABEL[voltageLevel];
  if (!cat || !tariff || !volt) {
    throw new Error(`cannot assemble name: ${customerCategory}+${tariffMode}+${voltageLevel}`);
  }
  return `${place ?? ''}${cat}${tariff}（${volt}）`;
}

/**
 * 解析档位 → 接口 customerCategory。非法组合直接失败，不要用别的枚举顶上。
 * @param {string} tariffMode
 * @param {string} customerCategory
 */
export function toCustomerCategory(tariffMode, customerCategory) {
  const cc = String(customerCategory ?? '');
  const tm = String(tariffMode ?? '');
  if (API_CUSTOMER_SET.has(cc)) return cc;

  if (tm === 'TWO_PART' && cc === 'LARGE_INDUSTRY') return 'TWO_PART_LARGE_INDUSTRY';
  if (tm === 'TWO_PART' && cc === 'GENERAL_COMMERCIAL') return 'TWO_PART_GENERAL_COMMERCIAL';
  if (tm === 'SINGLE_PART' && cc === 'GENERAL_COMMERCIAL') return 'SINGLE_PART_GENERAL_COMMERCIAL';

  throw new Error(`unsupported customerCategory: ${tm}+${cc}`);
}

/**
 * 解析电压 → 接口电压。不满 1 千伏跳过、不要并入 1-10；35-110 合并档拆成两条。
 * 返回空数组表示本行不上报。
 * @param {unknown} voltageLevel
 * @returns {string[]}
 */
export function toVoltageLevels(voltageLevel) {
  const v = String(voltageLevel ?? '');
  if (v === 'LEVEL_BELOW_1') return [];
  if (v === 'LEVEL_35_110') return ['LEVEL_35', 'LEVEL_110'];
  if (API_VOLTAGE_SET.has(v)) return [v];
  throw new Error(`unsupported voltageLevel: ${v}`);
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} [fallbackYearMonth]
 * @param {string} [voltageLevel]
 */
export function toRecord(row, fallbackYearMonth, voltageLevel) {
  const yearMonth = String(row.yearMonth ?? fallbackYearMonth ?? '');
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error(`invalid yearMonth: ${yearMonth || '(missing)'}`);

  const year = Number(m[1]);
  const month = Number(m[2]);
  const tariffMode = String(row.tariffMode ?? '');
  const customerCategory = String(row.customerCategory ?? '');
  const voltages = toVoltageLevels(voltageLevel ?? row.voltageLevel);
  if (voltages.length !== 1) {
    throw new Error(`toRecord expects a single voltageLevel, got ${voltages.join(',')}`);
  }

  return {
    name: toPolicyName(namePrefix(row), customerCategory, tariffMode, voltages[0]),
    province: Number(row.provinceId),
    region: row.region ?? null,
    priceSource: 'auto',
    dataGranularity: '1h',
    priceUnit: 'CNY',
    priceType: 'realTime',
    customerCategory: toCustomerCategory(tariffMode, customerCategory),
    voltageLevel: voltages[0],
    electricityPolicyConfigs: [
      {
        year,
        month,
        touPeriods: toTouPeriods(row),
      },
    ],
  };
}

/**
 * Resolve jsonMap value: path string → read file; or legacy inline array.
 * @param {unknown} value
 * @returns {unknown[]}
 */
export function loadRecords(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('jsonMap value must be a file path or non-empty array');
  }
  const text = readFileSync(value, 'utf8');
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`JSON at ${value} is not an array`);
  }
  return parsed;
}

/**
 * Flatten jsonMap (path → records) to API body array. Tracks per-province conversion errors.
 * @param {Record<string, string|unknown[]>} jsonMap
 * @param {string} [yearMonth]
 * @returns {{ body: unknown[], errors: Record<string, string>, provinceByIndex: string[] }}
 */
export function toApi(jsonMap, yearMonth) {
  const body = [];
  const errors = {};
  const provinceByIndex = [];

  for (const [id, value] of Object.entries(jsonMap ?? {})) {
    let records;
    try {
      records = loadRecords(value);
    } catch (e) {
      errors[id] = e instanceof Error ? e.message : String(e);
      continue;
    }

    if (!Array.isArray(records) || records.length === 0) {
      errors[id] = 'empty records';
      continue;
    }

    try {
      for (const row of records) {
        const voltages = toVoltageLevels(/** @type {Record<string, unknown>} */ (row).voltageLevel);
        // 不满 1 千伏等无入库枚举的行：跳过，不要并入其它电压
        if (voltages.length === 0) continue;
        for (const voltage of voltages) {
          body.push(toRecord(/** @type {Record<string, unknown>} */ (row), yearMonth, voltage));
          provinceByIndex.push(id);
        }
      }
    } catch (e) {
      errors[id] = e instanceof Error ? e.message : String(e);
    }
  }

  return { body, errors, provinceByIndex };
}
