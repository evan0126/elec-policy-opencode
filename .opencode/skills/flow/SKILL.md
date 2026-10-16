---
name: flow
description: >-
  人说「更新」加月份（省可省略）：串行下载、按需解析、一次上传。
  Use when the user asks to 更新 (with month; provinces optional).
---

# 编排跑通

唯一编排入口。只分流与传参，不写 js。不打开电价正文、`provinces/*.md`、`data/file` / `data/json` 正文、`template.md`。禁止 `question`。可读 `regions.md` / `sources.json` 做编排。

从「更新」对话取出 `YYYY-MM`；省可多个，**未写省**则读 `fetch-download/sources.json` 的 `provinces` 全部 key（跳过 `unsupported`）。「9 月」用对话年份。

### 输入示例

| 人说 | 整理成 |
| --- | --- |
| 更新：江苏、浙江 9 月（对话年份是 2026） | 月份 `2026-09`，省 `jiangsu`、`zhejiang` |
| 更新：2026-10 | 月份 `2026-10`，省 = `sources.json` 已覆盖全省 |

本会话维护 `pathMap`、`jsonMap`（失败项和本轮开始前已有终稿的项不放进去；value 都是本轮新生成终稿的本地路径）。

- `pathMap` key：标记电价来自哪份原文。省主原文用省 id；另一份原文用 `extraSources[].id`（如 `shenzhen`）。`id` 自定，且**不得**与 `sources.json` 的省 key / 别名撞名
- `jsonMap` key：无 `regions.md` 配置用省 id；有配置用 `{provinceId}:{region}`（按实际写出的区；这里的 `:` 是分区，与 pathMap 无关）

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

**无** `regions.md` 配置：

- 本轮开始前已有 `data/json/{YYYY-MM}/{中文省}.json` → 该项记为「更新成功」，跳过解析且不进 `jsonMap`
- 否则：该省相关 pathMap 项交给 `parse`，仅将本轮成功写出的终稿加入 `jsonMap`

**有** `regions.md` 配置：

- 对每个 `{ region, label }`：本轮开始前已有 `data/json/{YYYY-MM}/{label}.json` → 该项记为「更新成功」，跳过解析且不进 `jsonMap`
- 若仍有缺失的 label，且该省相关 pathMap 非空 → 把这些 pathMap 项交给 `parse`（`parse` 按认出的分区分别落盘，不合并；子会话的 `provinceId` 仍用父省 id）
- 全部 label 都已有 → 不调 `parse`
- pathMap 空且没有任何既有分区 JSON → 不进 jsonMap（下载失败）
- 仅将本轮成功写出的缺失分区终稿按 `"{省id}:{region}"` 加入 `jsonMap`

需要解析的 pathMap 子集为空 → 可不加载 `parse`。本会话不在 flow 里起 `@general`。

## 3. 上传

必须通过 upload 脚本检查上传开关，不要读取本地账密配置正文。配置见根目录 `upload.config.example.json`；本地 `upload.config.json` 的根级 `enabled` 为总开关，`environments.test` / `environments.production` 的 `enabled` 为独立开关，默认均 false，仅使用该配置文件。一次调用 upload，各启用环境分别提交；按返回的 `environments` 列出测试 / 正式各自状态，部分成功须明确成功环境，整体仍计上传失败。脚本返回 `{ "status": "仅解析", "submitted": [] }` 时，按 jsonMap key 报告「解析成功（未上传）」，不要按空 submitted 丢失这些项。汇总另列「仅解析 N 项」，不计入上传成功或失败；定时报告同样使用该状态。已有终稿不会因开启上传或增加目标环境自动补传；失败环境补传需显式调用上传脚本且仅开启待补传环境。

`jsonMap` 空则不上报。否则加载 `upload`（月份 + jsonMap）。`jsonMap` 只含本轮新解析的终稿，运行前已有的 JSON 不得上传。
`upload` 回复 `{ status, error?, submitted, environments? }`（`submitted` = **jsonMap 的 key 列表**，有区就按区；各启用环境分别一次整表 POST）。
对人：`submitted` 各项依据 `environments` 展示实际结果。只有一个启用环境时省略环境名称，格式为「{显示名}：更新成功」或「{显示名}：上传失败，原因：xxx」；多个启用环境时格式为「{显示名}：测试环境：更新成功；正式环境：上传失败，原因：xxx」，不在环境结果前重复整体上传状态，不加括号。整体 `status` 仅用于汇总计数；没有 `environments` 时使用整体状态和失败原因。

## 回复

先按项列状态（有区就按区，不要把分区收成一行省）：

- 显示名：无分区 → 中文省；有分区 → `regions.md` 的 `label`（如 `广东深圳`）
- 状态：下载失败，原因：xxx / 解析失败，原因：xxx / 更新成功 / 上传失败，原因：xxx
- 不贴电价 JSON

「本地已有原文」只决定是否跳过下载，不是对人终态；「本轮开始前已有 JSON」直接记为「更新成功」，但不进入 `jsonMap`、不上传。

**末尾空一行后再写汇总**（显示名同上；范围 = 本次目标展开后的全部应报项：无分区一省一项，有 `regions.md` 则每个 label 一项）：

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

### 上传后回复示例

上传执行后，成功统一写「更新成功」，失败写「上传失败，原因：xxx」。以下均为本轮实际提交的项；只启用一个环境时省略环境名称，多个环境时分别列出结果。按省 / 分区计数，不按环境重复计数。

**仅启用一个环境（无论测试还是正式）：**

```text
浙江：更新成功
广东深圳：上传失败，原因：账号或密码错误
```

以上两行分别展示单环境成功与失败的回复格式，不表示同一次整表提交返回不同的逐省状态。

**测试、正式环境全部上传成功：**

```text
浙江：测试环境：更新成功；正式环境：更新成功
广东深圳：测试环境：更新成功；正式环境：更新成功

汇总：成功更新 2 项，分别为浙江、广东深圳；未更新 0 项。
```

**部分环境失败（测试环境成功、正式环境失败）：**

这里「部分失败」指启用环境中有失败环境；接口按整次提交返回状态，不能自造同一次提交内的逐省成功结果。

```text
浙江：测试环境：更新成功；正式环境：上传失败，原因：账号或密码错误
广东深圳：测试环境：更新成功；正式环境：上传失败，原因：账号或密码错误

汇总：成功更新 0 项；未更新 2 项：浙江、广东深圳（测试环境已成功，正式环境上传失败）。
```

部分失败时不能省略成功环境，汇总仍按整体上传失败计入「未更新」。正式环境成功、测试环境失败时按实际结果对调展示。

同时把**含汇总在内的**最终汇报全文写入 `data/report/{目标月}/{MM-DD}.txt`（已有则覆盖）。

强制重解析并重新上传：无分区删 `{中文省}.json`；有分区删对应 `{label}.json`（或该月该省全部 label 文件）。
