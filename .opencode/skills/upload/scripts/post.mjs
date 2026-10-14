import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { toApi } from './to-api.mjs';
import { loadUploadConfig } from '../../../../scripts/upload-config.mjs';

/** nevermore-web：登录成功为 `{ status: 2000, data: "<token>" }`，token 直接存在 data 字符串里 */
function extractToken(data) {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  const obj = /** @type {Record<string, unknown>} */ (data);
  if (typeof obj.data === 'string' && obj.data) return obj.data;
  const direct = obj.token ?? obj.accessToken ?? obj.access_token;
  if (typeof direct === 'string' && direct) return direct;
  const nested = obj.data;
  if (nested && typeof nested === 'object') {
    const inner = /** @type {Record<string, unknown>} */ (nested);
    const t = inner.token ?? inner.accessToken ?? inner.access_token;
    if (typeof t === 'string') return t;
  }
  return '';
}

function extractError(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  const obj = /** @type {Record<string, unknown>} */ (data);
  const msg = obj.message ?? obj.error ?? obj.msg;
  if (typeof msg === 'string' && msg) return msg;
  if (obj.data && typeof obj.data === 'object') {
    const inner = /** @type {Record<string, unknown>} */ (obj.data);
    const innerMsg = inner.message ?? inner.error ?? inner.msg;
    if (typeof innerMsg === 'string' && innerMsg) return innerMsg;
  }
  return fallback;
}

/** nevermore-web 业务成功码 */
function assertOk(data, fallback) {
  if (!data || typeof data !== 'object') {
    throw new Error(fallback);
  }
  const status = Number(/** @type {Record<string, unknown>} */ (data).status);
  if (status !== 2000) {
    throw new Error(extractError(data, fallback || `status ${status}`));
  }
}

async function readJsonMapArg() {
  const [, , monthArg, jsonArg] = process.argv;
  if (jsonArg) return JSON.parse(jsonArg);
  if (process.stdin.isTTY) return null;
  const text = readFileSync(0, 'utf8').trim();
  if (!text) return null;
  return JSON.parse(text);
}

/**
 * 对齐 nevermore-web：`POST /login`，body `{ name, password }`，token = `res.data`
 * @param {string} base
 * @param {{ name: string, password: string }} creds
 */
export async function login(base, creds) {
  const res = await fetch(`${base.replace(/\/$/, '')}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: creds.name, password: creds.password }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(extractError(data, `login HTTP ${res.status}`));
  }

  assertOk(data, `login status ${data?.status ?? 'missing'}`);

  const token = extractToken(data);
  if (!token) throw new Error('login response missing token (expected data string)');
  return token;
}

/**
 * 对齐 nevermore-web：请求头 `Authorization` 直接放 token（不加 Bearer）
 * @param {string} base
 * @param {string} token
 * @param {unknown[]} body
 */
export async function savePolicies(base, token, body) {
  const res = await fetch(`${base.replace(/\/$/, '')}/electricity-policy/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(extractError(data, `save HTTP ${res.status}`));
  }

  assertOk(data, `save status ${data?.status ?? 'missing'}`);
  return data;
}

/**
 * 一次整表 POST。submitted 与 jsonMap key 一致（有区按区）。
 * @param {string} yearMonth
 * @param {Record<string, string|unknown[]>} jsonMap 省 id 或 provinceId:regionId → 落盘路径
 * @returns {Promise<{
 *   status: '更新成功'|'上传失败'|'跳过',
 *   error?: string,
 *   submitted: string[],
 * }>}
 */
export async function uploadJsonMap(yearMonth, jsonMap) {
  const config = loadUploadConfig();
  if (!config.enabled) return { status: '仅解析', submitted: [] };
  const ids = Object.keys(jsonMap ?? {});
  if (ids.length === 0) {
    return { status: '跳过', submitted: [] };
  }

  const { body, provinceByIndex } = toApi(jsonMap, yearMonth);
  // 与 jsonMap key 一致：无分区为省 id，有分区为 provinceId:regionId（不去重成省）
  const submitted = [...new Set(provinceByIndex.map((k) => String(k)))];

  if (body.length === 0) {
    return {
      status: '上传失败',
      error: '无有效数据可提交',
      submitted: [],
    };
  }

  const { base, user: name, password } = config;
  if (!base || !name || !password) {
    return {
      status: '上传失败',
      error: 'missing API base / user / password',
      submitted,
    };
  }

  let token;
  try {
    token = await login(base, { name, password });
  } catch (e) {
    return {
      status: '上传失败',
      error: e instanceof Error ? e.message : String(e),
      submitted,
    };
  }

  try {
    await savePolicies(base, token, body);
    return { status: '更新成功', submitted };
  } catch (e) {
    return {
      status: '上传失败',
      error: e instanceof Error ? e.message : String(e),
      submitted,
    };
  }
}

async function main() {
  const monthArg = process.argv[2];
  if (!monthArg || !/^\d{4}-\d{2}$/.test(monthArg)) {
    console.error('用法: node post.mjs YYYY-MM [jsonMap]  （jsonMap 省略则从 stdin 读）');
    process.exit(1);
  }

  let jsonMap;
  try {
    jsonMap = await readJsonMapArg();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  if (!jsonMap) jsonMap = {};

  const status = await uploadJsonMap(monthArg, jsonMap);
  console.log(JSON.stringify(status, null, 2));
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
