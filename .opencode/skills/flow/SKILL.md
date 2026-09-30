---
name: flow
description: >-
  人说「更新」加月份（省可省略）：串行下载、按需解析、一次上传。
  Use when the user asks to 更新 (with month; provinces optional).
---

# 编排跑通

唯一编排入口。只分流与传参，不写 js。不打开电价正文、`provinces/*.md`、`data/file` / `data/json` 正文、`template.md`。禁止 `question`。可读 `regions.json` / `sources.json` 做编排。

从「更新」对话取出 `YYYY-MM`；省可多个，**未写省**则读 `fetch-download/sources.json` 的 `provinces` 全部 key（跳过 `unsupported`）。「9 月」用对话年份。

### 输入示例

| 人说 | 整理成 |
| --- | --- |
| 更新：江苏、浙江 9 月（对话年份是 2026） | 月份 `2026-09`，省 `jiangsu`、`zhejiang` |
| 更新：2026-10 | 月份 `2026-10`，省 = `sources.json` 已覆盖全省 |

本会话维护 `pathMap`、`jsonMap`（失败项和本轮开始前已有终稿的项不放进去；value 都是本轮新生成终稿的本地路径）。

- `pathMap` key：标记电价来自哪份原文。省主原文用省 id；另一份原文用 `extraSources[].id`（如 `shenzhen`）。`id` 自定，且**不得**与 `sources.json` 的省 key / 别名撞名
- `jsonMap` key：无 `regions.json` 配置用省 id；有配置用 `{provinceId}:{region}`（按实际写出的区；这里的 `:` 是分区，与 pathMap 无关）

## 1. 下载 → pathMap

读 `fetch-download/sources.json`。对每个目标省展开下载任务后**串行**执行（不要并行）：

| 配置 | 任务 |
| --- | --- |
| 无 `extraSources` | 1 个：pathMap key / fetch = `{id}`；落盘 `{中文省}_电价表.*` |
| 有 `extraSources`（N 项） | N+1 个：主任务 pathMap key / fetch = `{id}`；每个额外原文 pathMap key / fetch = `{extraSources[].id}`，落盘名用 `saveName` |

每个任务：

- 已有对应 `data/file/{YYYY-MM}/{落盘名}.*` → 写入 `pathMap[key]`（只认路径，跳过下载）
- 否则加载 `fetch-download`（月份 + 上表参数，如主任务 `guangdong`、额外 `shenzhen`）
  - 成功：回复的 `localPath` 写入 `pathMap[key]`
  - 失败：该项不进 map，继续下一任务（主表与额外原文互不连带跳过）

`extraSources[].id` / `saveName` 只从 `sources.json` 抄。允许半份 pathMap。

## 2. 解析 → jsonMap

按**省**处理（只认路径，不读正文）。某省相关的 pathMap 项 = 省 id 主 key + 该省 `extraSources[].id`。

**无** `regions.json` 配置：

- 本轮开始前已有 `data/json/{YYYY-MM}/{中文省}.json` → 该项记为「更新成功」，跳过解析且不进 `jsonMap`
- 否则：该省相关 pathMap 项交给 `parse`，仅将本轮成功写出的终稿加入 `jsonMap`

**有** `regions.json` 配置：

- 对每个 `{ region, label }`：本轮开始前已有 `data/json/{YYYY-MM}/{label}.json` → 该项记为「更新成功」，跳过解析且不进 `jsonMap`
- 若仍有缺失的 label，且该省相关 pathMap 非空 → 把这些 pathMap 项交给 `parse`（`parse` 按认出的分区分别落盘，不合并；子会话的 `provinceId` 仍用父省 id）
- 全部 label 都已有 → 不调 `parse`
- pathMap 空且没有任何既有分区 JSON → 不进 jsonMap（下载失败）
- 仅将本轮成功写出的缺失分区终稿按 `"{省id}:{region}"` 加入 `jsonMap`

需要解析的 pathMap 子集为空 → 可不加载 `parse`。本会话不在 flow 里起 `@general`。

## 3. 上传

`jsonMap` 空则不上报。否则加载 `upload`（月份 + jsonMap）。`jsonMap` 只含本轮新解析的终稿，运行前已有的 JSON 不得上传。
`upload` 回复 `{ status, error?, submitted }`（`submitted` = **jsonMap 的 key 列表**，有区就按区；一次整表 POST）。
对人：`submitted` 各项一律跟整次 `status`（失败带 `error`）。

## 回复

先按项列状态（有区就按区，不要把分区收成一行省）：

- 显示名：无分区 → 中文省；有分区 → `regions.json` 的 `label`（如 `广东深圳`）
- 状态：下载失败，原因：xxx / 解析失败，原因：xxx / 更新成功 / 上传失败，原因：xxx
- 不贴电价 JSON

「本地已有原文」只决定是否跳过下载，不是对人终态；「本轮开始前已有 JSON」直接记为「更新成功」，但不进入 `jsonMap`、不上传。

**末尾空一行后再写汇总**（显示名同上；范围 = 本次目标展开后的全部应报项：无分区一省一项，有 `regions.json` 则每个 label 一项）：

```
汇总：成功更新 N 项，分别为 A、B、C；未更新 M 项：D、E。
```

- 「成功更新」= 终态为「更新成功」的项
- 「未更新」= 下载失败 / 解析失败 / 上传失败，以及应报但未出终态的项；若 M=0 写「未更新 0 项。」
- N、M 用阿拉伯数字；名称用顿号分隔

示例：

```
浙江：更新成功
江苏：下载失败，原因：栏目未找到当月公告
广东深圳：更新成功
广东惠州市：解析失败，原因：表头无法对齐

汇总：成功更新 2 项，分别为浙江、广东深圳；未更新 2 项：江苏、广东惠州市。
```

同时把**含汇总在内的**最终汇报全文写入 `data/report/{目标月}/{MM-DD}.txt`（已有则覆盖）。

强制重解析并重新上传：无分区删 `{中文省}.json`；有分区删对应 `{label}.json`（或该月该省全部 label 文件）。
