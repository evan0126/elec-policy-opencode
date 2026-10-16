# 电价政策 Skill（OpenCode）

按省、按月从网上国网 / 南网取当月代理购电文件，解析成统一 JSON 并上传入库。源文件落到 `data/file` 给人核对。

本仓库按 **OpenCode** 组织：在仓库根目录说话。细则以各 skill 的 `SKILL.md` 与 [docs/skill方案设计.md](docs/skill方案设计.md) 为准。

## 环境

上传配置：复制根目录 `upload.config.example.json` 为 `upload.config.json`（已被 Git 忽略）。根级 `enabled` 为上传总开关；在 `environments.test`（测试）和 `environments.production`（正式）下分别填写 `enabled`、`base`、`user`、`password`，可只启用一个环境或同时启用两个。总开关默认关闭；全部目标关闭时也只下载、解析并保存 JSON。每个启用环境独立登录、提交并返回结果，一个失败不阻断另一个。配置示例及生产部署见 [部署文档](docs/部署文档.md#6-生产环境部署与上传配置)。

上传仅使用配置文件，固定从项目根目录读取 `upload.config.json`。

已有终稿仍按原规则跳过；开启上传不会自动补传只解析生成的文件。补传需直接调用 upload 并传入已有文件的 jsonMap，或删除对应终稿后重新更新。

1. 安装 [OpenCode](https://opencode.ai)。
2. 在本仓库**根目录**打开，否则扫不到 `.opencode/skills`。
3. 密钥不要写入仓库：`opencode auth login`，或环境变量；上传接口地址、账密及开关统一配置在根目录 `upload.config.json`。
4. 模型以 `opencode.json` 为准。
5. 取链下载：`npm run fetch -- {id|sourceId} {YYYY-MM}`（Playwright 无头；额外原文如 `shenzhen`）。
6. 使用 **Build**。不要用 Plan 出数。

## 流程

```
人说「更新」→ flow
      ├─ 串行 fetch-download（有 extraSources → N+1 任务）→ pathMap
      ├─ 按需 parse(pathMap) → 每 key @general（有分区按 label 分文件，不合并）→ 本轮新终稿进入 jsonMap
      └─ 一次 upload(jsonMap) → { status, submitted } → flow 按项投影（有区按区）
```

| skill | 做什么 | 产出 |
|---|---|---|
| `flow` | 编排入口（「更新」触发；省可省略） | 按项状态回复（有区用 label） |
| `fetch-download` | 取链并下载（一次一省 / 一额外原文） | `data/file/{YYYY-MM}/{中文名}_电价表.{后缀}` |
| `parse` | 按 pathMap **每个 key** `@general`；有 `regions.md` 则按 **label** 分文件 | 无分区 `{中文省}.json`；有分区各 `{label}.json` → `jsonMap` |
| `upload` | 按 jsonMap 路径读盘 → 各启用环境分别一次提交 | `{ status, error?, submitted, environments? }`（submitted = jsonMap key） |

人说示例：`更新：浙江、江苏 9 月` 或 `更新：2026-10`（不写省 = `sources.json` 已覆盖全省）。

本轮开始前已有对应终稿 JSON 时，该项视为已完成：跳过解析，不进入 `jsonMap`，也不重复上传。删除终稿后再次更新，才会重新解析并上传。

月末自动跑：系统定时器每天 `npm run monthly-flow`；仅在每月最后 3 天调用 `opencode run`（目标月为下月）。`flow` 把最终汇报写入 `data/report/{目标月}/{MM-DD}.txt`，脚本读该文件后发 1 条短信。

河北默认冀北；内蒙古默认蒙东。南网以广东为例已配；其余未覆盖省见 `sources.json` 的 `unsupported`。

## 目录

```
.opencode/skills/
  flow/SKILL.md
  fetch-download/          # sources.json + open-column / find-file / run
  parse/                   # template、common.md、regions.md、provinces/
  upload/scripts/          # to-api.mjs、post.mjs
scripts/
  monthly-flow.mjs         # 月末窗口触发 flow
data/file/{YYYY-MM}/       # 原文核对，不进 git
data/json/{YYYY-MM}/       # 解析 JSON，不进 git
data/report/{目标月}/      # flow 最终汇报 {MM-DD}.txt，不进 git
```

## 隔离

一省表头/时段/枚举不进另一省。父会话不打开电价正文与省覆盖 md。解析用 `@general`：**每个 pathMap key 一会话**；有分区由该会话按 label 分文件落盘，不要再合并。另一份原文：pathMap key / 覆盖 md 均为 `extraSources[].id`（如 `shenzhen` / `provinces/shenzhen.md`）。
