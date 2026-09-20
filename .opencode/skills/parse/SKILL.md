---
name: parse
description: >-
  按 pathMap 解析本地电价文件并落盘 JSON；每个 key 一次 @general。有分区则按 label 分文件，不合并。由 flow 调用。
  Use when flow has pathMap, or user has local files under data/file and asks to parse.
---

# 电价解析

按 `flow` 传入的 `pathMap` 打开磁盘上的电价文件，解析成分时电价 JSON 并落盘。把 `jsonMap` 回复 `flow`。

编排单位是 **pathMap 的每个 key**：每个 key 各起一次 `@general`，只开对应那一份文件；同省多 key 可并行。**不要**再起合并用 `@general`，**不要**汇成一省一份。

落盘：

| 本省 `regions.json` | 落盘 | `jsonMap` key |
| --- | --- | --- |
| **无**配置 | `data/json/{YYYY-MM}/{中文省}.json` | `{provinceId}` |
| **有**配置 | 解析完成后按 `region` 分组，每组写入 `data/json/{YYYY-MM}/{label}.json`（`label` 抄 `regions.json`，已有则覆盖） | `{provinceId}:{regionId}` |

**允许半份**：某 key 失败或某分区未认出，其它已落盘的分区仍进 `jsonMap`。

> 何时调用：由 `flow` 决定。某 key 的 JSON 已在盘上 → `flow` 直接写入 `jsonMap`，不调本 skill。只有还缺 JSON 的 key，才把对应原文路径放进传给本 skill 的 `pathMap`。

禁止 `question`。不要用合并脚本。父会话不打开电价正文、`data/file` 其它文件、`provinces/` 覆盖正文（可用路径判断是否存在）；可读 `regions.json` 做编排。

**子会话 `@general`**：空上下文；读表后自己写出 `data/json/...`（或回报失败），不要问父会话代写。

## 输入（flow 写入）

| 字段 | 格式 | 说明 |
| --- | --- | --- |
| 月份 | `YYYY-MM` | 与下载同一月 |
| `pathMap` | 见下 | 只含已有本地原文、需要解析的项 |

| key | 何时用 |
| --- | --- |
| `{provinceId}` | 省主原文（文件内仍可能有多区） |
| `{sourceId}` | 另一份独立原文；抄 `extraSources[].id`（如 `shenzhen`） |

```js
{ "zhejiang": "data/file/2026-09/浙江_电价表.pdf" }

{
  "guangdong": "data/file/2026-09/广东_电价表.pdf",
  "shenzhen": "data/file/2026-09/广东深圳_电价表.pdf"
}
```

path 缺失或不存在 → 该 key 失败。

## 规则文件

```
.opencode/skills/parse/
  template.md / common.md / rule.md / province-ids.md / regions.json
  provinces/
    zhejiang.md                         # 省主表覆盖
    guangdong.md                        # 广东主表（多区域在同一份原文）
    shenzhen.md                         # 另一份原文：文件名 = pathMap key = extraSources[].id
```

覆盖路径（只选一个，见 [rule.md](rule.md)）：

- 必须存在 `provinces/{pathMapKey}.md` → 用它（**不要**回退到别的 md 或只读 common）
- **不存在** → **不要**起 `@general`；该 key 直接失败，提示例如：`还没有写广东深圳的读表规则，请先补 .opencode/skills/parse/provinces/shenzhen.md`

对应 key 的覆盖均 **必填**；不要只靠 `common.md` 硬解。

- **pathMap 管来源文件，jsonMap 管区**：一份原文出几个区，由覆盖 md 写明；认出几个就按 label 写几个 JSON
- 多份原文 → 多个 pathMap key；同一区不要在两份原文里重复出
- 额外原文 key 的父省：从 `sources.json` 里找拥有该 `extraSources[].id` 的省；`@general` 的 `provinceId` / `regions.json` / jsonMap 分区前缀都用这个父省 id

本省无配置 → `region: null`，落 `{中文省}.json`。文件里无法映射的区名 → 本 key 失败。不是「配置枚举必须出齐」。

## `@general`（每 key 一次，可并行）

每次新会话。description：`解析{中文名}电价`（额外原文用 saveName）。prompt：

```
只解析这一份电价文件，不要读别省规则或别省文件。

【本省】
id：{provinceId}
中文名：{name}
月份：{yearMonth}
pathMapKey：{pathMapKey}
电价文件：{localPath}
  → 只打开这一路径；不要打开直链，不要打开 data/file 下其它文件

【落盘】
{landRule}
  → 失败不要写空文件

【region】
{regionRule}
  → 按 regions.json 本省项；无配置 → null；认出 → 抄枚举；文件里无法映射的区名 → 本 key 失败
  → pathMapKey 只表示来源文件，不限制只能出一个区；出哪些区以覆盖 md 为准
  → 额外原文的 provinceId 仍是父省（不是 sourceId）

【省差异】
{provinceOverridePath}
  → provinces/{pathMapKey}.md（缺则父会话已失败）
  → 先读 common.md，再读该覆盖

【必读】
.opencode/skills/parse/template.md
.opencode/skills/parse/common.md
.opencode/skills/parse/province-ids.md
.opencode/skills/parse/regions.json         → 只看当前省这一项
以及上面的省差异文件

【规则】
- 抽分时电度价；不要 1.5 倍表
- priceType / priceSource / dataGranularity / priceUnit 固定：realTime / auto / 1h / CNY
- periods 须铺满 00:00–24:00；每条记录都要有 region 字段

【回复】
{replyRule}
不要再调 skill。
```

占位：

- `{provinceOverridePath}`：`provinces/{pathMapKey}.md`（父会话已确认存在）
- `{provinceId}`：省主 key 即其本身；额外原文 key 则查 `sources.json` 父省 id
- `{landRule}`：
  - 本省**无** `regions.json` 项 → 写入 `data/json/{YYYY-MM}/{中文省}.json`（非空数组、2 空格；已有则覆盖）
  - 本省**有**配置 → 解析完按 `region` 分组；每组写入 `data/json/{YYYY-MM}/{label}.json`（`label` 必须抄本省 `regions.json` 对应项；已有则覆盖）。本 key 认出几个区就写几个文件
- `{replyRule}`：
  - 无分区：成功只交落盘路径一行；失败交 `{"ok":false,"provinceId":"...","pathMapKey":"...","error":"..."}`
  - 有分区：成功每行 `{regionId}\t{path}`（只列本 key 实际写出的文件）；失败同上 JSON；不要 markdown、不要贴 JSON 正文

## 收齐

1. 起 `@general` **之前**用路径判断覆盖是否存在：缺 `provinces/{pathMapKey}.md` → 该 key 失败，提示 `还没有写…的读表规则，请先补 …/provinces/{pathMapKey}.md`，不起子会话
2. 其余每个 key 各起一次 `@general`（可并行）。
3. 成功：
  - 无分区：一行路径且存在 → `jsonMap[provinceId] =` 该路径
  - 有分区：按行解析 `regionId` + path；path 存在 → `jsonMap["{provinceId}:{regionId}"] =` path（`regionId` 是写出的区；`provinceId` 是父省，与 pathMap 的 sourceId 无关）
4. 某 key 失败不影响其它 key 已写入的项（半份）。该省全部 key 都失败且未写出任何分区文件 → 该省无新项。

不要打开 JSON 正文、不要扫 `data/json` 猜文件、不要合并。禁止用 `[]` 冒充成功。

## 输出（回复 flow）

整份 `jsonMap`：value 为最终落盘路径。无分区 key 为省 id；有分区 key 为 `{provinceId}:{regionId}`（按区，不是按来源文件）。
