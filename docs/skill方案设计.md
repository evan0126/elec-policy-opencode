# Skill 方案设计

name 与 skill 目录名必须一致。已定：


| name             | 谁调用               | 做什么                                                    |
| ---------------- | ----------------- | ------------------------------------------------------ |
| `fetch-download` | `flow`            | 取直链并下载到本地，回复该省路径（每次一省）                                 |
| `parse`          | `flow`            | 按 pathMap 解析并落盘 JSON；有 `regions.md` 则按 label 分文件，不合并 |
| `upload`         | `flow`            | 按 jsonMap 路径读 JSON，提交到自有系统                             |
| `flow`           | 人说「更新」（省可省略）或每月调度 | 串行下载 → 仅将本轮新终稿补进 jsonMap（已有终稿直接跳过）→ 一次上传；允许半份     |


`flow` 按顺序加载它们；上一 skill 的**回复**由 `flow` 在会话里收齐，再写进下一 skill 的**入参**。

`pathMap` / `jsonMap` 的 value 一律是**本地路径**（失败项**不要**出现在 map 里）。

- `pathMap` key：标记**电价来自哪份原文**。一省一份原文 → 省 id；另有独立原文 → `extraSources[].id`（如 `shenzhen`；只区分下载槽 / 覆盖文件，**不**表示只能出一个区，也**不必**等于 `regions.md` 枚举；`id` 不得与省 key / 别名撞名）
- `jsonMap` key：本省无 `regions.md` → 省 id；有配置 → `{provinceId}:{region}`（按**实际写出的区**，每区一文件，**不**汇成一省一份；这里的 `:` 是分区）

解析前须有读表规则：pathMap 每个 key 要有 `provinces/{pathMapKey}.md`（省主与额外原文同级）。缺了就该 key 失败，提示「还没有写…的读表规则，请先补 …」。哪几个区的电价来自这份文件，写在对应覆盖 md 里。

落盘约定：

- 原文：`data/file/{YYYY-MM}/{中文名}_电价表.{后缀}`（分区原文用 `regions.md` 的 `label`；已有则覆盖）
- 解析 JSON：无分区 → `data/json/{YYYY-MM}/{中文省}.json`；有分区 → 各 `data/json/{YYYY-MM}/{label}.json`

示例 A（获取 2026-09 浙江、江苏；两省都成功）：

```js
// pathMap
{
  "zhejiang": "data/file/2026-09/浙江_电价表.pdf",
  "jiangsu": "data/file/2026-09/江苏_电价表.pdf"
}

// jsonMap（无 regions 配置 → 一省一文件）
{
  "zhejiang": "data/json/2026-09/浙江.json",
  "jiangsu": "data/json/2026-09/江苏.json"
}
```

示例 B（浙江成功、江苏失败）：仅 `zhejiang` 进 pathMap / jsonMap。

示例 C（广东有 `regions.md`，主表 + 深圳都解析成功）：

```js
// jsonMap：按分区，不合并成广东.json
{
  "guangdong:GD_PEARL_RIVER_DELTA_FIVE_CITIES": "data/json/2026-09/广东珠三角五市.json",
  "guangdong:GD_HUIZHOU": "data/json/2026-09/广东惠州市.json",
  "guangdong:GD_JIANGMEN": "data/json/2026-09/广东江门市.json",
  "guangdong:GD_EAST_WEST_WINGS": "data/json/2026-09/广东东西两翼地区.json",
  "guangdong:GD_NORTH_MOUNTAIN": "data/json/2026-09/广东粤北山区.json",
  "guangdong:GD_SHENZHEN": "data/json/2026-09/广东深圳.json"
}
```

---

## 1. fetch-download

一次一省：取当月直链，存到本地。把路径**回复给** `flow`。

为什么一次一省：网上国网要先切省再进栏目，一个浏览器一次只能停在一省；多省同时跑会抢同一套浏览器，或一起打栏目页触发风控。失败只丢这一省，由 `flow` 继续下一省。

**输入（**`flow` **写入）**


| 字段 | 格式 | 说明 |
| --- | --- | --- |
| 月份 | `YYYY-MM` | 如 `2026-09` |
| 省 | 一个省 id、中文名，或 `extraSources[].id` | 如 `zhejiang` / `浙江` / `shenzhen` |


**输出（回复给** `flow`**）**


| 结果 | 格式 | `flow` 怎么用 |
| --- | --- | --- |
| 成功 | 一行 `localPath` 字符串 | `pathMap[key] = localPath`（主任务 = 省 id；额外原文 = `sourceId`） |
| 失败 | 失败原因文字 | 该项不进 `pathMap`，继续下一任务 |


落盘：`data/file/{YYYY-MM}/{中文名}_电价表.{后缀}`（主任务用省 `name`，分区用 `label`），已有则覆盖。`data/file` 只供人核对。

### 目录与脚本分工

```
.opencode/skills/fetch-download/
  SKILL.md
  sources.json              # 各省栏目文字、finder、标题规则
  scripts/
    open-column.mjs         # 打开栏目：首页 → 切省 → 点信息公开/电价栏目
    find-file.mjs           # 找电价文件：点表格预览 / 详情内嵌图 / 公告点「预览」
    run.mjs                 # 一省取链并落盘：读配置 → 打开栏目 → 按省找文件 → 存盘
```

### 1.1 `sources.json`：各省规则

只配文字，不配选择器。三个脚本都读它。改栏目或标题只改这里。

**网上国网单文件省**（以浙江为例）：

```js
{
  "aliases": { "浙江": "zhejiang" }, // 中文名认出省
  "unsupported": [],                // 未覆盖的省，直接失败
  "excludeTitle": ["1.5倍", "输配电价"], // 全国排除标题
  "provinces": {
    "zhejiang": {
      "name": "浙江",               // 落盘文件名用的中文省
      "portalCity": "浙江",         // 顶栏要切到的省
      "columnPath": ["信息公开", "执行的电价和收费标准"], // 进栏目要点的文字；有第三段再点子栏目
      "finder": "sgNotice",           // 找文件方式：sgTable / sgImage / sgNotice / csgListImage
      "titleMatch": "rule",         // 默认 rule；该省标题差异很大、规则写不全时改 ai
      "titlePattern": "国网浙江省电力有限公司关于YYYY年M月代理工商业用户购电价格的公告" // 列表匹配当月标题；YYYY年M月换成当月
    }
  }
}
```

**南网多文件省**（以广东为例；`portal: "csg"`，有 `extraSources` 则 N+1 下载任务）：

```js
"guangdong": {
  "name": "广东",               // 主任务落盘中文名（广东_电价表）
  "portal": "csg",              // 走南网；缺省走网上国网
  "entry": "https://95598.csg.cn/#/gd/hall", // 该省入口，覆盖根 entry
  "portalCity": "广州市",       // 主任务：切广州
  "columnPath": ["营商环境", "信息公开", "电价及收费标准"],
  "finder": "csgListImage",     // 南网：列表 → 详情内嵌图或附件
  "titlePattern": "广东电网有限责任公司关于YYYY年M月代理购电工商业用户价格的公告",
  "titleExclude": [],
  "extraSources": [
    {
      "id": "shenzhen",           // pathMap key / CLI / 覆盖 md 名（勿与省 key 撞名）
      "saveName": "广东深圳",     // 原文落盘中文名（自定，不绑 regions.md）
      "portalCity": "深圳市",
      "titlePattern": "YYYY年M月代理购电",
      "titleInclude": ["深圳"]
    }
  ]
}
```

有 `extraSources`（N 项）时展开为 **N+1** 个下载任务：主任务 pathMap key / fetch = 省 id；每个额外原文 pathMap key / fetch = `{id}`。落盘名用 `saveName`。端到端见 [§6](#6-南网以广东为例)。

### 1.2 `open-column.mjs`：打开栏目

同一套点击，文字由该省配置填入。

```js
// 打开栏目，停在该省列表页
export async function openColumn(page, { entry, portalCity, columnPath, finder }) {
  // 打开网上国网首页
  // 顶栏切到该省
  // 点 columnPath[0]（一般是「信息公开」）
  // 点 columnPath[1]（左侧栏目）
  // 若弹出「请选择您所在地区」，点第一市、第一区
  // 若有 columnPath[2]，再点子栏目
}

async function clickNoticeItem(page, item) {} // 公告列表点子栏目
async function clickTableItem(page, item) {}  // 表格点子栏目
```

### 1.3 `find-file.mjs`：找电价文件

列表页怎么拿到文件，按门户+形态命名 finder（`sgTable` / `sgImage` / `sgNotice` / `csgListImage`），各省只选一个。新省配 `columnPath` + `finder`；新形态加方法后挂到 `finders`。

- **表格**：点开一行就是打开文件预览
- **内嵌图**：点开表格进入详情页，文件以图片嵌在页面里
- **公告**：进去只展示文件标题，再点「预览」才打开文件预览

标题默认**规则匹配**，不用 AI。`findHit` 认当月 + 排除噪音 + 贴近 `titlePattern`（空格、`9月`/`09月`/`月份` 由正则消化）。

原因：各列表标题格式差得小，规则稳定、可复现，点选循环里不必调模型。

```js
export const finders = {
  sgTable,       // 点开表格 → 打开文件预览（北京、江苏）
  sgImage,       // 点开表格 → 详情页内嵌图（天津、山东）
  sgNotice,      // 进公告列表 → 展示文件标题 → 点「预览」才打开文件预览（浙江、河北）
  csgListImage,  // 南网列表 → 详情内嵌图或附件 PDF（广东）
};

async function sgTable(ctx) {}         // 点开表格行，打开文件预览
async function sgImage(ctx) {}         // 点开表格行，进详情抄内嵌图
async function sgNotice(ctx) {}        // 点进公告标题后，再点「预览」打开文件预览
async function csgListImage(ctx) {}    // 南网列表点标题：内嵌图或 PDF 附件
async function clickRow(ctx, loc) {}   // 按当月标题点中一行，可翻页
async function findHit(ctx, loc) {}    // 默认规则匹配：含当月 YYYY年M月；贴近 titlePattern；排除 1.5 倍/输配电价
async function findHitByAi(ctx, loc) {} // 该省标题差异很大时：AI 按「当月代理购电」语义挑一条
async function nextPage(page) {}       // 翻下一页
async function clickPreview(ctx) {}    // 公告详情里点「预览」按钮
async function readImage(ctx) {}       // 从详情页取出内嵌图
```

### 1.4 `run.mjs`：一省取链并落盘

本 skill 内部实现。落盘成功后，把路径作为 **skill 回复**交回 `flow`（由 `SKILL.md` 约定怎么呈现），不要假定会话外还有总控在收结果。

```js
const rule = loadProvince(provArg);    // 认出省（浙江 → zhejiang）；未覆盖则 fail
const find = finders[rule.finder];     // 按省取出找文件方法；未知 finder 则 fail

// 启动 Playwright
// 用 download 事件、以及响应 Content-Type（PDF/图片）收集文件
// 不要用 URL 路径/后缀规则判断，站点路径会变

await openColumn(page, rule);          // 打开栏目
await find(ctx);                       // 找当月文件
const url = pickUrl(files);            // 取本次收到的文件；没有（仍停在栏目页）则 fail
const localPath = saveToOut(url, rule.name, monthArg); // 落盘；路径回复给 flow
// 关闭浏览器

function loadProvince(provArg) {}      // 从 sources.json 取该省规则
function pickUrl(files) {}             // 取本次操作收到的文件
function saveToOut(url, name, month) {} // 存到 data/file/{YYYY-MM}/{中文省}_电价表.{后缀}，已有则覆盖；后缀看 Content-Type 或下载文件名
function fail(msg) {}                  // 回复失败原因（flow 不把该省写入 pathMap）
```

### 示例：浙江 2026-09

`flow` 入参：`2026-09` + `浙江`。`finder` = `sgNotice`。首页 → 切到浙江 → 信息公开 → 执行的电价和收费标准 → 公告列表找 **2026年9月** → 点「预览」打开文件预览 → 存成 `data/file/2026-09/浙江_电价表.pdf` → **回复该路径给** `flow` → `flow` 写入 `pathMap.zhejiang`。

---

## 2. parse

按 `flow` 传入的 `pathMap` 打开磁盘上的电价文件，解析成分时电价 JSON 并落盘。把 `jsonMap` **回复给** `flow`。

编排单位是 **pathMap 的每个 key**：每个 key 各起一次 `@general`，只开对应那一份文件；同省多 key 可并行。

落盘（**有分区则按 label 分文件，不要汇成一省一份**）：


| 本省 `regions.md` | 落盘                                                     | `jsonMap` key             |
| ----------------- | ------------------------------------------------------ | ------------------------- |
| 无配置               | `data/json/{YYYY-MM}/{中文省}.json`                       | `{provinceId}`            |
| 有配置               | 解析完按 `region` 分组，每组 `data/json/{YYYY-MM}/{label}.json` | `{provinceId}:{regionId}` |


**允许半份**：缺分区原文或某 key 失败时，已成功落盘的分区仍进 `jsonMap`。

> 何时调用：由 `flow` 决定。某 key 对应的 JSON 已经在盘上（无分区看 `{中文省}.json`，有分区看各 `{label}.json`）→ `flow` 直接记进 `jsonMap`，**不**调本 skill。只有还没有这份 JSON 的 key，才把对应原文路径放进传给本 skill 的 `pathMap`。

### 入出参怎么经 `flow` 传

1. `fetch-download` 成功路径由 `flow` 收进完整 `pathMap`。传给本 skill 时，`flow` **只放还缺 JSON 的那些 key**（已有 JSON 的项视为已完成，不进入 `jsonMap`）。
2. **本 skill**：父会话按 key 检查读表规则是否存在（§2.1），再起 `@general`（不打开电价 / 覆盖 md 正文）。每个 `@general` 只打开对应那一份原文；解析成功后**由该子会话直接写出** `data/json/...`（无分区 → `{中文省}.json`，有分区 → 各 `{label}.json`），不要把 JSON 交回父会话再写盘。
3. 父会话根据回复收齐 `jsonMap`（无合并、无 `_part`）。不要在会话里贴整份 JSON 正文。

**输入（**`flow` **写入）**


| 字段        | 格式        | 说明                           |
| --------- | --------- | ---------------------------- |
| 月份        | `YYYY-MM` | 与下载同一月                       |
| `pathMap` | 见下        | 只含「已有本地原文、且还缺 JSON」的项；value 为路径字符串 |


`pathMap` key：


| key                       | 何时用                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `{provinceId}`            | 省主原文（文件内仍可能有多张区域表、多个区） |
| `{sourceId}`              | 另一份独立原文；抄 `extraSources[].id`（如 `shenzhen`） |


示例（无分区 / 同省多份原文）同总述示例 A、C / §6。

**输出（回复给** `flow`**）**


| 结果        | 格式                                   | `flow` 怎么用                                  |
| --------- | ------------------------------------ | ------------------------------------------- |
| 成功（无分区）   | `data/json/{YYYY-MM}/{中文省}.json`     | `jsonMap[省id] =` 路径                         |
| 成功（有分区）   | 各 `data/json/{YYYY-MM}/{label}.json` | `jsonMap["省id:region"] =` 各路径（`region` 抄枚举） |
| 失败（某 key） | 明确原因；禁止 `[]`、不要写空文件                  | 该 key 未写出的项不进 map；其它已落盘项保留                  |
| 整次结束      | 整份 `jsonMap`                         | **原样**作为 `upload` 入参                        |


### 文件分工

父会话只编排 `@general`，不跑取链脚本。规则文件是 `template.md`、`common.md`、`rule.md`、`province-ids.md`、`regions.md`、`provinces/`。

```
.opencode/skills/parse/
  SKILL.md
  template.md               # 规则：输出 JSON 形状、枚举、缺值 null；含 region
  common.md                 # 规则：各省共用读表约定
  rule.md                   # 覆盖文件怎么写
  province-ids.md           # 规则：province / provinceId 只准抄本表
  regions.md                # Markdown 表格：省 key、分区枚举、label；没有该省则 region 为 null
  provinces/                # 规则：怎么读表（只写相对 common 的差异）
    zhejiang.md             # 省主表
    guangdong.md            # 广东主表（一份原文内多区域）
    shenzhen.md             # 另一份原文的读表规则（文件名 = extraSources[].id，与省主同级）
```

### 2.1 规则文件

读表差异写在 `provinces/`。父会话**只看文件在不在**，不打开正文；缺了就失败，**不要**起 `@general`，也**不要**改用另一份 md 或只靠 `common.md`。

| pathMap key | 要用的文件 | 缺了时提示 |
| --- | --- | --- |
| `{provinceId}`（如 `zhejiang`） | `provinces/zhejiang.md` | `还没有写浙江的读表规则，请先补 …/provinces/zhejiang.md` |
| `{sourceId}`（如 `shenzhen`） | `provinces/shenzhen.md` | `还没有写广东深圳的读表规则，请先补 …/provinces/shenzhen.md` |

每个 key **只选上表那一份**。两份原文读法不同时，各自一份 md（一律同级，文件名 = pathMap key）。

`regions.md`：用 Markdown 表格维护分区配置，每行一个分区，列固定为 `provinceId | region | label`。这里的 `provinceId` 是 `sources.json` 的省 key（如 `guangdong`），不是入库数字编号；输出 JSON 的数字 `provinceId` 仍只抄 `province-ids.md`。有该省配置时，给出 `region` 枚举和落盘用的 `label`；没有配置则 JSON 里 `region` 为 `null`。

上传脚本 `to-api.mjs` 直接读取该表，用 `region` 查找 `label` 作为名称前缀。维护时保留三列表头及列顺序，单元格使用纯文本，不加反引号、不含 `|`；分区枚举全表唯一。

- **pathMap 管来源文件，jsonMap 管区**：一份原文出几个区，由该文件的覆盖 md 写明；认出几个就按 label 写几个 JSON
- 多份原文 → pathMap 多个 key，各起一次解析；同一区不要在两份原文里重复出（覆盖里划清「要 / 不要」）
- 有配置但认不出区名 → 本 key 失败（不要求「配置里每个枚举都必须在本文件出现」）

```md
| provinceId | region | label |
| --- | --- | --- |
| exampleprovince | REGION_A | 某省分区A |
| exampleprovince | REGION_B | 某省分区B |
```

### 2.2 父会话：编排

从 `flow` 入参取出 `pathMap`。path 缺失、或不存在对应读表规则（见 §2.1）→ 该 key 失败，**不要**起 `@general`。其余 **每个 key 各起一次** `@general`（可并行）。

1. 起 `@general` 前写清：`localPath`、落盘规则、**必填**覆盖路径（不打开正文）。
2. 成功：无分区 → 一行路径进 `jsonMap[provinceId]`；有分区 → 每行 `{regionId}\t{path}` 进 `jsonMap["{provinceId}:{regionId}"]`（`regionId` 是写出的区，与 pathMap 的 `sourceId` 无关）
3. 某 key 失败不影响其它已写入项。不要合并、不要 `_part`、不要扫目录猜文件。

### 2.3 `@general`：解析一个 key

独立子会话。只开 prompt 里的一份电价文件。必读 template / common / province-ids 当前行 / regions 当前省 / **覆盖 md** / 该 `localPath`。

有分区：按覆盖 md 认出的区分组，每组非空数组写入 `data/json/{YYYY-MM}/{label}.json`；回复每行 `regionId\tpath`（可多行）。

无分区：写入 `{中文省}.json`；回复一行路径。

失败：`{"ok":false,"provinceId":"...","pathMapKey":"...","error":"..."}`；不要 `[]`、不要空文件。

### 示例 A：无分区（浙江）

```js
pathMap: { "zhejiang": "data/file/2026-09/浙江_电价表.pdf" }
// → data/json/2026-09/浙江.json → jsonMap.zhejiang
```

### 示例 B：有分区（广东 / 河北等同理）

`guangdong` 与 `shenzhen` 是两份原文；各用各的覆盖 md。当前深圳覆盖只出 `GD_SHENZHEN`；若同文件还要入库其它区，在该覆盖里加映射即可，不必改 pathMap key。缺 `guangdong.md` / `shenzhen.md` → 对应 key 失败。详见 [§6](#6-南网以广东为例)。

---

## 3. upload

按 `flow` 传入的 `jsonMap`（省 id 或 `{provinceId}:{regionId}` → 本地 JSON 路径）读盘，转成接口数组，提交到自有系统。地址、用户名、密码只读根目录 `upload.config.json`。不下载、不解析电价原文。

### 入出参怎么经 `flow` 传

1. 上一环 `parse` 本轮新生成路径汇总的 `jsonMap` 由 `flow` **原样**写入本 skill 入参（再加月份）；运行前已有终稿不进入本 skill。
2. 按路径读出各 JSON 数组，摊平为接口数组，登录后一次 POST。
3. 按整次结果回复。`submitted` 与 **jsonMap key 一致**（有区就按区，不按省去重）。`flow` 投影给人时：无分区显示中文省，有分区显示 `label`。

解析一条档位对应接口一条；多文件拼成**一个数组一次提交**。`jsonMap` 为空 → 不上报、不登录。

示例：

```js
// jsonMap（可含分区 key）
{
  "zhejiang": "data/json/2026-09/浙江.json",
  "guangdong:GD_SHENZHEN": "data/json/2026-09/广东深圳.json",
  "guangdong:GD_HUIZHOU": "data/json/2026-09/广东惠州市.json"
}

// submitted: ["zhejiang", "guangdong:GD_SHENZHEN", "guangdong:GD_HUIZHOU"]
// 对人：浙江 / 广东深圳 / 广东惠州市
```

**输出（回复给** `flow`**）示例**

```js
// 成功
{
  "status": "更新成功",
  "submitted": ["zhejiang", "guangdong:GD_SHENZHEN", "guangdong:GD_HUIZHOU"]
}

// 失败
{
  "status": "上传失败",
  "error": "接口返回的具体错误信息",
  "submitted": ["zhejiang", "guangdong:GD_SHENZHEN", "guangdong:GD_HUIZHOU"]
}
```

### 文件分工

```
.opencode/skills/upload/
  SKILL.md
  scripts/
    to-api.mjs    # 读 jsonMap 路径 → 接口数组
    post.mjs      # 先登录拿 token，再一次 POST
```

### 3.1 转接口格式

按 `jsonMap` 路径读出解析记录 → 接口一条。`customerCategory` 只映射成后端三项：`TWO_PART_LARGE_INDUSTRY` / `TWO_PART_GENERAL_COMMERCIAL` / `SINGLE_PART_GENERAL_COMMERCIAL`。`periods` 与 `prices` 合成 `touPeriods`（价为 `null` 的时段丢掉）。

```js
function toApi(jsonMap) {}           // 按路径读各省数组摊平，每条 toRecord
function toRecord(row) {
  // name            ← 中文含义拼接：地名 + 用户类别 + 电价制度 +（电压等级）
  //                   无区：省份，如 浙江一般工商业用电单一制（1-10千伏）
  //                   有区：regions.md 的 label，如 广东深圳一般工商业用电单一制（1-10千伏）
  // province        ← Number(row.provinceId)（186，不要用拼音）
  // region          ← row.region；无区域就是 null
  // priceSource     ← "auto"
  // dataGranularity ← "1h"
  // priceUnit       ← "CNY"
  // priceType       ← "realTime"
  // customerCategory← 只准三项：
  //                   LARGE_INDUSTRY + TWO_PART → TWO_PART_LARGE_INDUSTRY
  //                   GENERAL_COMMERCIAL + TWO_PART → TWO_PART_GENERAL_COMMERCIAL
  //                   GENERAL_COMMERCIAL + SINGLE_PART → SINGLE_PART_GENERAL_COMMERCIAL
  // voltageLevel    ← 只准 LEVEL_1_10 / LEVEL_20 / LEVEL_35 / LEVEL_110 / LEVEL_220 / LEVEL_220_PLUS
  //                   不满 1 千伏跳过、不要并入 LEVEL_1_10；LEVEL_35_110 拆成 LEVEL_35 与 LEVEL_110
  // electricityPolicyConfigs[0].year / month ← yearMonth 拆开（2026-09 → 2026, 9）
  // touPeriods      ← toTouPeriods(row)
}

function toTouPeriods(row) {}        // periods[].type/start/end + 对应 prices.* → periodType/startTime/endTime/price
function priceOf(type, prices) {}    // tip→tipPrice，peak→peakPrice，flat→flatPrice，valley→valleyPrice，deepValley→deepValleyPrice
function postApi(body) {}            // 先 login 再 POST {BASE}/electricity-policy/save；body 为整表数组
```

`priceOf` 得到 `null` 的时段不写入 `touPeriods`。不要改枚举大小写，不要把 `region` 缺省成全省名。

### 3.2 登录

无数据则不登录、不提交。用户名、密码只读根目录 `upload.config.json`，不写进 skill 正文。

```
POST {BASE}/login
Content-Type: application/json

{ "name": ..., "password": ... }
```

响应里取出登录 token。失败则整次 `{ "status": "上传失败", "error": "..." }`（`submitted` 仍为拟提交的 jsonMap key），不要调 save。

```js
function login() {}                  // POST {BASE}/login；body 为 { name, password }，都从根目录 upload.config.json 读；返回 token
```

### 3.3 提交

```
POST {BASE}/electricity-policy/save
Content-Type: application/json
```

带上 3.2 拿到的 token。`BASE`、用户名、密码只读根目录 `upload.config.json`，不写进 skill 正文。body 为 3.1 转出的数组，一次 POST 全部省。

---

## 4. flow

唯一编排入口。人说「更新」加月份（省可省略）→ 本会话串起下载 → 解析 → 上传。只传参，不打开电价正文 / 覆盖 md / `template.md`，不写 js。

```
.opencode/skills/flow/SKILL.md   # 只有编排，无 scripts/
```

对人按项回复（有区就按区，显示 `label`；无分区用中文省）：下载失败，原因：xxx / 解析失败，原因：xxx / 更新成功 / 上传失败，原因：xxx。不贴电价 JSON。  
末尾空一行后再写汇总：`汇总：成功更新 N 项，分别为 …；未更新 M 项：…。`（范围 = 本次目标展开后的全部应报项）。  

（「本地已有原文」只影响是否跳过下载；本轮开始前「已有 JSON」的项直接视为更新成功，但不进入 `jsonMap`、不上传。）

### 人调用示例

对话年份为 2026 时：

```
更新：浙江、江苏 9 月          # 指定省
更新：2026-10                 # 不写省 = sources.json 已覆盖全省
```

指定省时整理成月份 `2026-09`、省 `zhejiang` / `jiangsu`；不写省时从 `sources.json` 取全省。然后：串行凑齐 `pathMap` → 补齐 / 解析出 `jsonMap` → 一次 `upload`。回复示例：

```
浙江：更新成功
江苏：下载失败，原因：栏目未找到当月公告
广东深圳：更新成功
广东惠州市：更新成功

汇总：成功更新 3 项，分别为浙江、广东深圳、广东惠州市；未更新 1 项：江苏。
```

### `SKILL.md` 草稿

以仓库内 `.opencode/skills/flow/SKILL.md` 为准。要点：

## 1. 下载 → pathMap

按省串行（有 `extraSources` 则 N+1 任务）：已有原文则跳过下载写入 pathMap；否则调 `fetch-download`。允许半份。

## 2. 解析 → jsonMap

- 无 `regions.md`：已有 `{中文省}.json` → 视为已完成且不进 jsonMap；否则 parse，本轮新终稿进 jsonMap
- 有配置：已有的 `{label}.json` 视为已完成且不进 jsonMap；仍缺 label 且 pathMap 非空 → parse（按分区分文件落盘，**不合并**），本轮新终稿按 `{省id}:{region}` 进 jsonMap
- 全部 label 已有 → 不调 parse

## 3. 上传

jsonMap 非空则一次 `upload`。`submitted` = jsonMap key（有区就按区）。

## 回复

按项终态（有区用 `label`）+ 空一行 + 汇总行；同时写 `data/report/{目标月}/{MM-DD}.txt`。

---

## 5. 定时任务：自动跑 flow

人手动说「更新」加月份（省可省略）仍然有效。定时任务只多做一件事：**到点无交互地触发同一条** `flow` **编排**

### 5.1 目标

- 每月**最后 3 个自然日**各跑 **1 次**（例如 9 月 → 28、29、30；2 月非闰年 → 26、27、28）。
- 目标月份固定为**下月** `YYYY-MM`。例：2026-09-28～30，目标月都是 `2026-10`。
- 省列表：不写省时 = `sources.json` 已覆盖全省。
- 连跑 3 天补晚发：已有原文跳过下载；已有终稿 JSON（无分区 `{中文省}.json` / 有分区各 `{label}.json`）视为已完成，跳过解析且不重复上传；仍缺的继续，本轮新生成终稿才进 jsonMap。允许半份入库。

非最后 3 天不调 `opencode run`，脚本直接退出 0。

### 5.2 怎么实现

1. 落盘 `scripts/monthly-flow.mjs`。
2. 系统定时器每天跑一次（工作目录 = 仓库根）。
3. 最后 3 天：`opencode run` 更新 `{目标月}`；读 `data/report/{目标月}/{MM-DD}.txt` 发短信。
4. 强制重解析并重新上传：无分区删 `{中文省}.json`；有分区删对应 `{label}.json`。

---

## 6. 南网（以广东为例）

入口：[95598.csg.cn](https://95598.csg.cn/#/gd/hall)。广东 6 个区域、两份原文（主表含 5 区，深圳单独）。

### 6.1 pathMap / jsonMap


| map     | 无分区 key | 有分区 key                                                  |
| ------- | ------- | -------------------------------------------------------- |
| pathMap | 省 id    | 主原文仍为省 id；另一份原文为 `extraSources[].id`（如 `shenzhen`） |
| jsonMap | 省 id    | 一律 `{provinceId}:{region}`（按实际写出的区；每区一份，**不**汇成一省一份） |


**无分区**（浙江、江苏；`regions.md` 无该省行）：

```js
// pathMap
{
  "zhejiang": "data/file/2026-09/浙江_电价表.pdf",
  "jiangsu": "data/file/2026-09/江苏_电价表.pdf"
}

// jsonMap
{
  "zhejiang": "data/json/2026-09/浙江.json",
  "jiangsu": "data/json/2026-09/江苏.json"
}
```

**有分区 · 一份原文多区**（河北；pathMap 一键，jsonMap 按区）：

```js
// pathMap
{ "hebei": "data/file/2026-09/河北_电价表.pdf" }

// jsonMap
{
  "hebei:HEBEI_SOUTH": "data/json/2026-09/河北南部地区.json",
  "hebei:HEBEI_JIBEI": "data/json/2026-09/河北冀北地区.json"
}
```

**有分区 · 多份原文**（广东；pathMap 主任务 + 深圳，jsonMap 六区）：

```js
// pathMap（额外原文 key = extraSources[].id；与 jsonMap 的 region 枚举无关）
{
  "guangdong": "data/file/2026-09/广东_电价表.pdf",
  "shenzhen": "data/file/2026-09/广东深圳_电价表.pdf"
}

// jsonMap（节选；完整六区见 §6.3；key 仍用 region 枚举）
{
  "guangdong:GD_HUIZHOU": "data/json/2026-09/广东惠州市.json",
  "guangdong:GD_SHENZHEN": "data/json/2026-09/广东深圳.json"
}
```

### 6.2 配置与下载任务

广东 `sources.json` 见 [§1.1](#11-sourcesjson各省规则)。带 `extraSources` → N+1 下载；读表规则：`provinces/guangdong.md`（主表）+ `provinces/shenzhen.md`（深圳）。主表四区映射见该省覆盖；江门同价复用珠三角。

### 6.3 端到端流转（更新：广东 2026-09）

```js
// pathMap
{
  "guangdong": "data/file/2026-09/广东_电价表.jpg",
  "shenzhen": "data/file/2026-09/广东深圳_电价表.pdf"
}

// parse（缺读表规则则该 key 失败，提示「还没有写…的读表规则」）
//   guangdong → provinces/guangdong.md → 各区 {label}.json（含江门）
//   shenzhen → provinces/shenzhen.md → 广东深圳.json

// jsonMap（有区按区；半份：只含本轮新生成的成功项）
{
  "guangdong:GD_PEARL_RIVER_DELTA_FIVE_CITIES": "data/json/2026-09/广东珠三角五市.json",
  "guangdong:GD_HUIZHOU": "data/json/2026-09/广东惠州市.json",
  "guangdong:GD_JIANGMEN": "data/json/2026-09/广东江门市.json",
  "guangdong:GD_EAST_WEST_WINGS": "data/json/2026-09/广东东西两翼地区.json",
  "guangdong:GD_NORTH_MOUNTAIN": "data/json/2026-09/广东粤北山区.json",
  "guangdong:GD_SHENZHEN": "data/json/2026-09/广东深圳.json"
}
```

对人汇报按 `label` 逐项；空一行后再写汇总。运行前已有 `{label}.json` 时，flow 跳过对应解析且不将该项加入 `jsonMap`，因此不会重复上传。
