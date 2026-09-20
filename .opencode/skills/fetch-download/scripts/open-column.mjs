// open-column.mjs — 打开电价栏目，停在列表页（不取文件）。
// 文字由 sources.json 的 columnPath / portalCity 填入；选择器写死在本文件。
// 国网：openColumn；南网：openColumnCsg。

// ---------- 网上国网（SG）----------

/**
 * 国网：首页 → 切省 → 信息公开 → 左侧栏目 →（可选）地区弹窗 →（可选）右侧子栏目。
 * @param {import('playwright').Page} page
 * @param {{ entry: string, portalCity: string, columnPath: string[], finder: string }} opts
 */
export async function openColumn(page, { entry, portalCity, columnPath, finder }) {
  const [nav, menu, item] = columnPath;

  // 1. 首页
  await page.goto(entry);

  // 2. 切省（顶栏 a.current → 列表 .province）
  const city = page.locator('a.current').first();
  if ((await city.innerText()).trim() !== portalCity) {
    await city.click();
    await page.locator('.province').getByRole('link', { name: portalCity }).click();
  }

  // 3. 顶栏 .newnav-main（一般是「信息公开」）
  await page.locator('.newnav-main').getByText(nav, { exact: true }).click();

  // 4. 左侧 .aside（如「电价标准」「执行的电价和收费标准」）
  await page.locator('.aside').getByText(menu, { exact: true }).click();

  // 5. 地区弹窗：点第一市、第一区（无弹窗则跳过）
  const dlg = page.locator('.el-dialog');
  if (await dlg.getByText('请选择您所在地区').waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) {
    const first = dlg.locator('.tab-con-box-li').locator('visible=true').first();
    await first.click();
    await first.click();
  }

  // 6. 右侧子栏目（columnPath 有第三段才点；公告列表与表格列表点法不同）
  if (item) {
    if (finder === 'sgNotice') await clickNoticeItem(page, item);
    else await clickTableItem(page, item);
  }
}

/** 表格形态子栏目：点 .el-table 单元格文案 */
async function clickTableItem(page, item) {
  await page.locator('.el-table .cell').getByText(item, { exact: true }).first().click();
}

/** 公告形态子栏目：点 .fagui 列表标题 */
async function clickNoticeItem(page, item) {
  await page.locator('.fagui li.item-title .title').getByText(item, { exact: true }).first().click();
}

// ---------- 南网（CSG）----------
// 广东：切市 → 营商环境 → 信息公开 → 电价及收费标准（停在列表；取文件见 find-file csgListImage）

/**
 * 南网：打开厅堂 → 切市 → 按 columnPath 点进电价列表。
 * @param {import('playwright').Page} page
 * @param {{ entry: string, portalCity: string, columnPath: string[] }} opts
 */
export async function openColumnCsg(page, { entry, portalCity, columnPath }) {
  const [nav, info, price] = columnPath;
  await page.goto(entry, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await switchCsgCity(page, portalCity);

  // 顶栏：营商环境
  await page.getByText(nav, { exact: true }).first().click();
  await page.waitForTimeout(800);

  // 侧栏：信息公开
  await page.getByText(info, { exact: true }).first().click();
  await page.waitForTimeout(800);

  // 宫格：电价及收费标准
  await page.getByText(price, { exact: true }).first().click();
  await page.waitForTimeout(1200);
}

/** 南网顶栏「切换地区」→ 点目标市（如 广州市 / 深圳市）；已在目标市则跳过 */
async function switchCsgCity(page, portalCity) {
  const headerText = await page.locator('body').innerText().catch(() => '');
  // 兼容「广州市」「广州」
  if (headerText.includes(portalCity) || (portalCity.length >= 2 && headerText.includes(portalCity.replace(/市$/, '')))) {
    const near = page.getByText(portalCity, { exact: true }).first();
    if (await near.isVisible().catch(() => false)) return;
  }

  await page.getByText('切换地区', { exact: true }).first().click();
  await page.waitForTimeout(500);

  // 面板内点市名：优先 exact，再试去「市」
  const panel = page.locator('body');
  let link = panel.getByText(portalCity, { exact: true }).last();
  if (!(await link.isVisible().catch(() => false)) && portalCity.endsWith('市')) {
    link = panel.getByText(portalCity.slice(0, -1), { exact: true }).last();
  }
  if (!(await link.isVisible().catch(() => false))) {
    link = page.getByText(portalCity, { exact: true }).first();
  }
  await link.click();
  await page.waitForTimeout(1000);
}
