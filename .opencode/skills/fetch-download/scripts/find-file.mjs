// find-file.mjs — 在已打开的列表页找当月电价文件（点行 / 预览 / 抄图 / 收下附件）。
// 各省在 sources.json 选一个 finder（门户前缀 + 形态，camelCase）。
//
// ---------- 网上国网（SG）----------
// sgTable       表格点开即下载
// sgImage       表格进详情，抄内嵌图（omg-static）
// sgNotice      公告列表进详情，再点「预览」
//
// ---------- 南网（CSG）----------
// csgListImage  列表点当月标题 → 详情内嵌图，或附件 PDF 直下（深圳等）

export const finders = {
  sgTable,
  sgImage,
  sgNotice,
  csgListImage,
};

// ---------- 国网 finders ----------

/** 点表格行并等 download 事件 */
async function sgTable(ctx) {
  return clickRow(ctx, ctx.page.locator('.el-table .cell'), { download: true });
}

/** 点表格行进详情，抄 img[src*=omg-static] */
async function sgImage(ctx) {
  const title = await clickRow(ctx, ctx.page.locator('.el-table .cell'));
  const img = ctx.page.locator('img[src*="omg-static"]').first();
  await img.waitFor({ timeout: 10000 });
  const src = await img.getAttribute('src');
  if (src) ctx.files.push(src);
  return title;
}

/** 点公告标题进详情，再点「预览」（可能弹窗或触发下载） */
async function sgNotice(ctx) {
  const loc = ctx.page.locator('.fagui li.item-title');
  const title = await clickRow(ctx, loc, { titleNode: '.title' });
  await clickPreview(ctx);
  return title;
}

// ---------- 共用：点行 / 匹配标题 / 翻页 ----------

/**
 * 在列表里找当月命中行并点击；可翻页最多 10 页。
 * @param {{ download?: boolean, titleNode?: string }} opts download=true 时等 download 事件；titleNode 点行内子节点
 */
async function clickRow(ctx, loc, { download = false, titleNode } = {}) {
  await loc.first().waitFor({ timeout: 15000 });
  for (let p = 0; p < 10; p++) {
    const hit = await findHit(ctx, loc);
    if (hit) {
      const waitDl = download
        ? ctx.page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
        : Promise.resolve(null);
      const row = loc.nth(hit.i);
      if (titleNode) await row.locator(titleNode).click();
      else await row.click();
      await waitDl;
      return hit.title;
    }
    if (!(await nextPage(ctx.page))) break;
  }
  throw new Error('列表无当月匹配标题');
}

/**
 * 规则匹配当月标题：年月 + titleInclude/Exclude + 贴近 titlePattern。
 * 返回得分最高的一行，或 null。
 */
async function findHit(ctx, loc) {
  const n = await loc.count();
  const hits = [];
  // titlePattern 去掉年月占位后，用于加分贴近
  const body = ctx.rule.titlePattern.replace(/YYYY年M月份?/g, '').replace(/[()（）]/g, '');
  const must = ctx.rule.titleInclude || [];
  const ban = ctx.rule.titleExclude || [];
  for (let i = 0; i < n; i++) {
    const title = (await loc.nth(i).innerText())
      .replace(/\s+/g, '')
      .replace(/\d{4}-\d{2}-\d{2}\d{2}:\d{2}:\d{2}$/, '');
    if (ctx.exclude.some((x) => title.includes(x))) continue;
    if (ban.some((x) => title.includes(x))) continue;
    if (must.length && !must.every((x) => title.includes(x))) continue;
    if (ctx.rule.id === 'anhui' && /第\d+周/.test(title)) continue;
    if (ctx.rule.matchYearMonth !== false && !ctx.ym.test(title)) continue;
    hits.push({ i, title, score: body && title.includes(body) ? 2 : 1 });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits[0] || null;
}

/** 点下一页；不可点则返回 false */
async function nextPage(page) {
  const next = page.locator('.btn-next, .el-icon-arrow-right').last();
  if (!(await next.isVisible().catch(() => false))) return false;
  if (/\bdisabled\b/.test((await next.getAttribute('class')) || '')) return false;
  await next.click();
  await waitIdle(page);
  return true;
}

/** 公告详情里点「预览」：可能新窗口或 download */
async function clickPreview(ctx) {
  const preview = ctx.page.getByText('预览', { exact: true }).first();
  await preview.waitFor({ timeout: 10000 });
  const popupP = ctx.page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
  const dlP = ctx.page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await preview.click();
  const popup = await popupP;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    const u = popup.url();
    if (ctx.isFile(u)) ctx.files.push(u);
  }
  await dlP;
}

/** 等 Element UI loading mask 消失（翻页后） */
async function waitIdle(page) {
  const mask = page.locator('.el-loading-mask').first();
  await mask.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  await mask.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
}

// ---------- 南网（CSG）----------

/**
 * 点当月列表项：深圳等为 PDF 附件直下；广东主表等为进详情抄内嵌图。
 * 并行等 download 或 SPA 跳转 /infomation。
 */
async function csgListImage(ctx) {
  const loc = await csgListLocator(ctx.page);
  await loc.first().waitFor({ timeout: 15000 });
  // 南网行结构多为 div.list-item > div.link
  const useLink = (await loc.first().locator('div.link').count()) > 0;
  const before = ctx.files.length;

  let title;
  for (let p = 0; p < 10; p++) {
    const hit = await findHit(ctx, loc);
    if (hit) {
      const dlP = ctx.page
        .waitForEvent('download', { timeout: 10000 })
        .then((d) => ({ kind: 'dl', d }))
        .catch(() => null);
      const navP = ctx.page
        .waitForURL(/\/infomation|\/information/i, { timeout: 10000 })
        .then(() => ({ kind: 'nav' }))
        .catch(() => null);

      const row = loc.nth(hit.i);
      if (useLink) await row.locator('div.link').click();
      else await row.click();

      const raced = await Promise.race([dlP, navP]);
      if (raced?.kind === 'dl' && raced.d) {
        const u = raced.d.url();
        if (u && ctx.isFile(u)) ctx.files.push(u);
      }
      title = hit.title;
      break;
    }
    if (!(await nextPage(ctx.page))) break;
  }
  if (!title) throw new Error('列表无当月匹配标题');
  // 附件已进 files（download 或 page.on('download')）
  if (ctx.files.length > before) return title;

  // 详情内嵌图
  await ctx.page.waitForTimeout(1500);
  const src = await grabCsgEmbedImage(ctx.page);
  if (src) {
    ctx.files.push(src);
    return title;
  }

  // 详情页附件链接（贵州等：正文区 a[href*=downloadFiles]）
  const attach = ctx.page.locator('a[href*="downloadFiles"], a[href$=".pdf" i], a[href*=".pdf?" i]').first();
  if (await attach.count()) {
    const href = await attach.getAttribute('href');
    if (href) {
      const abs = absolutize(ctx.page.url(), href);
      if (ctx.isFile(abs) || /downloadFiles/i.test(abs)) {
        ctx.files.push(abs);
        return title;
      }
    }
  }

  // 详情 iframe 里挂的 PDF / 图
  const iframeSrc = await ctx.page.locator('iframe').first().getAttribute('src').catch(() => null);
  if (iframeSrc) {
    const abs = absolutize(ctx.page.url(), iframeSrc);
    if (ctx.isFile(abs)) {
      ctx.files.push(abs);
      return title;
    }
  }
  throw new Error('详情页未找到内嵌电价图或附件');
}

/** 南网列表行定位：优先 div.list-item / div.link（不是 a/li） */
async function csgListLocator(page) {
  const candidates = [
    page.locator('div.list-item'),
    page.locator('div.link').filter({ hasText: /代理购电|电价/ }),
    page.locator('.list-box li, .news-list li, .info-list li'),
    page.locator('[class*="list"] a').filter({ hasText: /代理购电|电价/ }),
    page.locator('a').filter({ hasText: /代理购电/ }),
  ];
  for (const loc of candidates) {
    if (await loc.first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) return loc;
  }
  // 退回：含日期的可点击块
  return page.locator('div.list-item, div.link, a, li, .el-row').filter({ hasText: /\d{4}-\d{2}-\d{2}/ });
}

/** 详情页选面积最大的非装饰图（排除 logo/banner 等） */
async function grabCsgEmbedImage(page) {
  const imgs = page.locator('img');
  const n = await imgs.count();
  let best = null;
  let bestArea = 0;
  for (let i = 0; i < n; i++) {
    const img = imgs.nth(i);
    const src = await img.getAttribute('src');
    if (!src || /logo|icon|avatar|banner|qrcode/i.test(src)) continue;
    const box = await img.boundingBox().catch(() => null);
    const area = box ? box.width * box.height : 0;
    if (area > bestArea && area > 20000) {
      bestArea = area;
      best = src;
    }
  }
  if (best) return absolutize(page.url(), best);
  // 面积不够时退回正文区第一张带 http 的图
  const any = page.locator('.article img, .content img, .detail img, img[src*="http"]').first();
  if (await any.count()) {
    const src = await any.getAttribute('src');
    if (src) return absolutize(page.url(), src);
  }
  return null;
}

/** 相对路径 → 绝对 URL */
function absolutize(pageUrl, src) {
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('//')) return `https:${src}`;
  try {
    return new URL(src, pageUrl).href;
  } catch {
    return src;
  }
}
