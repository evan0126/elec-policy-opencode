// run.mjs — 一省（或一额外原文）取链并落盘。
// 用法: node run.mjs <省|id|sourceId> YYYY-MM
// stdout 仅一行 localPath；调试 JSON / 失败原因写 stderr，失败 exit 1。
//
// 流程：读 sources.json → 开浏览器 → openColumn(Csg) → finder → 落盘 data/file/{月}/
// pathMap / CLI：主任务 = 省 id；额外原文 = extraSources[].id（如 shenzhen）

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openColumn, openColumnCsg } from './open-column.mjs';
import { finders } from './find-file.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '..', '..', '..', '..');
const cfg = JSON.parse(readFileSync(join(dir, '..', 'sources.json'), 'utf8'));

const [rawArg, monthArg] = process.argv.slice(2);
if (!rawArg || !/^\d{4}-\d{2}$/.test(monthArg || '')) fail('用法: node run.mjs <省|id|sourceId> YYYY-MM');

const { id, sourceId } = resolveFetchArg(rawArg);
const base = cfg.provinces[id];
const rule = buildRule(id, base, sourceId);
const find = finders[rule.finder];
if (!find) fail(`未知 finder: ${rule.finder}`);

const [year, month] = monthArg.split('-');
const files = [];

// 用响应 URL / download 事件收文件；不要靠站点路径猜后缀（会变）
// 国网：omg-static 或 .pdf；排除占位图
const isFileSg = (u) => /omg-static|\.pdf($|\?)/i.test(u) && !/no_data|\/osgweb\/img\//.test(u);
// 南网：常见图片/PDF 后缀，或 downloadFiles / documentType=pdf
const isFileCsg = (u) =>
  /\.(pdf|jpe?g|png|gif|webp)($|\?)/i.test(u) ||
  /downloadFiles|documentType=pdf/i.test(u) ||
  (/\/(upload|file|image|img)\//i.test(u) && !/logo|icon|banner|avatar/i.test(u));
const isFile = rule.portal === 'csg' ? isFileCsg : isFileSg;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
page.setDefaultTimeout(20000);
page.on('response', (res) => { if (isFile(res.url()) && res.status() < 400) files.push(res.url()); });
page.on('download', (d) => { if (isFile(d.url())) files.push(d.url()); });

try {
  const entry = rule.entry || cfg.entry;
  // 按门户分流：国网 openColumn / 南网 openColumnCsg
  if (rule.portal === 'csg') {
    await openColumnCsg(page, { entry, portalCity: rule.portalCity, columnPath: rule.columnPath });
  } else {
    await openColumn(page, { entry, portalCity: rule.portalCity, columnPath: rule.columnPath, finder: rule.finder });
  }
  // finder 点当月文件；命中的直链进 files
  const title = await find({
    page,
    files,
    isFile,
    rule,
    year,
    month,
    ym: new RegExp(`${year}年0?${Number(month)}月份?`),
    exclude: [...cfg.excludeTitle, ...(rule.excludeTitle || [])],
  });
  const file = pickUrl();
  if (file.kind === '仅详情页') throw new Error('未拿到文件直链');
  const localPath = await saveFile(file.url, rule.saveName || rule.name, monthArg);
  // 调试信息走 stderr，勿污染 stdout 的路径一行
  console.error(JSON.stringify({
    ok: true,
    id: rule.id,
    sourceId: rule.sourceId || undefined,
    name: rule.saveName || rule.name,
    month: monthArg,
    title,
    url: file.url,
    kind: file.kind,
  }));
  console.log(localPath);
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
}

/**
 * 解析 CLI 参数。
 * - 省 id / 中文别名 → 主任务
 * - extraSources[].id（如 shenzhen）→ 反查父省后跑该下载槽
 * pathMap key 与 CLI 参数相同：主任务 = 省 id，额外原文 = sourceId。
 */
function resolveFetchArg(rawArg) {
  if (rawArg.includes(':')) {
    fail(`参数勿含冒号: ${rawArg}（额外原文直接传 sourceId，如 shenzhen）`);
  }
  const asProvince = cfg.provinces[rawArg] ? rawArg : cfg.aliases[rawArg];
  if (asProvince && !cfg.unsupported.includes(asProvince) && cfg.provinces[asProvince]) {
    return { id: asProvince, sourceId: null };
  }
  const hits = [];
  for (const [pid, p] of Object.entries(cfg.provinces)) {
    if (cfg.unsupported.includes(pid)) continue;
    if ((p.extraSources || []).some((s) => s.id === rawArg)) hits.push(pid);
  }
  if (hits.length === 1) return { id: hits[0], sourceId: rawArg };
  if (hits.length > 1) fail(`下载槽 id 冲突: ${rawArg} 属于 ${hits.join(', ')}`);
  fail(`未覆盖: ${rawArg}`);
}

/**
 * 合并省配置与可选 extraSources。
 * 落盘名：主任务用 name；额外原文用 extraSources[].saveName（自定，不绑 regions.md）。
 * @param {string} provinceId
 * @param {object} base sources.json 省项
 * @param {string|null} sourceId extraSources[].id（如 shenzhen）
 */
function buildRule(provinceId, base, sourceId) {
  const rule = { id: provinceId, portal: base.portal || 'sg', ...base };
  if (!sourceId) {
    rule.saveName = base.name;
    return rule;
  }
  if (!/^[a-z][a-z0-9_-]*$/i.test(sourceId)) {
    fail(`下载槽 id 非法: ${sourceId}（建议小写字母开头，仅字母数字 _ -）`);
  }
  const extra = (base.extraSources || []).find((s) => s.id === sourceId);
  if (!extra) fail(`未配置下载槽: ${provinceId}:${sourceId}`);
  if (!extra.saveName || typeof extra.saveName !== 'string') {
    fail(`extraSources ${provinceId}:${sourceId} 缺少 saveName`);
  }
  Object.assign(rule, {
    portalCity: extra.portalCity || rule.portalCity,
    titlePattern: extra.titlePattern || rule.titlePattern,
    titleInclude: extra.titleInclude || [],
    titleExclude: extra.titleExclude || [],
    sourceId: extra.id,
    saveName: extra.saveName,
  });
  return rule;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** 取本次操作收到的最后一个合格 URL；仍停在国网详情无直链则标「仅详情页」 */
function pickUrl() {
  const url = [...files].reverse().find(isFile);
  if (url) return { url, kind: /\.(jpe?g|png)($|\?)/i.test(url) ? '图片' : 'PDF' };
  if (/ipSupportDetailItems/.test(page.url())) return { url: page.url(), kind: '仅详情页' };
  throw new Error('未拿到文件直链');
}

/** 拉直链写入 data/file/{YYYY-MM}/{中文名}_电价表.{后缀}；同前缀旧文件先删 */
async function saveFile(url, name, month) {
  const outDir = join(repoRoot, 'data', 'file', month);
  mkdirSync(outDir, { recursive: true });

  const prefix = `${name}_电价表.`;
  for (const f of readdirSync(outDir)) {
    if (f.startsWith(prefix)) unlinkSync(join(outDir, f));
  }

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`下载失败: ${res.status} ${url}`);

  const ext = extFrom(res.headers.get('content-type'), url);
  const absPath = join(outDir, `${name}_电价表.${ext}`);
  writeFileSync(absPath, Buffer.from(await res.arrayBuffer()));
  return relative(repoRoot, absPath).replace(/\\/g, '/');
}

/** 后缀优先 Content-Type，其次 URL，默认 pdf */
function extFrom(contentType, url) {
  const ct = (contentType || '').split(';')[0].trim().toLowerCase();
  const map = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  if (map[ct]) return map[ct];

  const m = url.match(/\.(pdf|jpe?g|png|gif|webp)($|\?)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');

  if (ct.includes('pdf')) return 'pdf';
  return 'pdf';
}
