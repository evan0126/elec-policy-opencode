---
name: fetch-download
description: >-
  按省份和月份用 Playwright 取当月代理购电直链并下载到 data/file/。一次一省（或一省一分区 key）。
  Use when flow needs a localPath, or the user asks to 取链并下载.
---

# 取链并下载

一次一省一月（南网多原文则为一次一 `pathMap` key）。**只跑脚本**，不要改选择器。禁止 `question`。

为什么一次一省：网上国网要先切省再进栏目；多省同时跑会抢浏览器或触发风控。失败只丢这一项，由 `flow` 继续。

```
node .opencode/skills/fetch-download/scripts/run.mjs {id|省|sourceId} {YYYY-MM}
```

## 输入（flow 写入）

| 字段 | 格式 | 说明 |
| --- | --- | --- |
| 月份 | `YYYY-MM` | 如 `2026-09` |
| 省 | 省 id、中文名、或 `extraSources[].id` | 如 `zhejiang` / `浙江` / `shenzhen` |

pathMap key 与 CLI 参数相同：主任务 = 省 id，额外原文 = `extraSources[].id`。

`portal` 缺省 → 网上国网；`portal: "csg"` → 南网。`unsupported` 与未配置省：直接失败。

## 输出（回复 flow）

| 结果 | 格式 | flow 怎么用 |
| --- | --- | --- |
| 成功 | **stdout 仅一行** `localPath` | 写入 `pathMap[key] = localPath` |
| 失败 | stderr 写原因，退出码 1 | 该项不进 `pathMap` |

调试 JSON 可写 stderr。不要在 stdout 混其它内容。

## 落盘

```
data/file/{YYYY-MM}/{中文名}_电价表.{后缀}
```

主任务用省 `name`；额外原文用 `extraSources[].saveName`（自定，如 `广东深圳_电价表`）。已有同名则覆盖。`data/file` 只供人核对。

## 脚本分工

```
.opencode/skills/fetch-download/
  SKILL.md
  sources.json              # 各省栏目文字、finder、标题规则（只配文字，不配选择器）
  scripts/
    open-column.mjs         # 打开栏目（国网 openColumn / 南网 openColumnCsg）
    find-file.mjs           # 找文件：finders.sgTable / sgImage / sgNotice / csgListImage
    run.mjs                 # 读配置 → 打开栏目 → 找文件 → 存盘 → 回路径
```

改栏目或标题只改 `sources.json`。国网 `finder`：`sgTable` / `sgImage` / `sgNotice`。南网广东等见设计 §6（`finder: csgListImage`、`extraSources`）。
