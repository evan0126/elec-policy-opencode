# AGENTS.md

本仓库用 OpenCode 按省解析网上国网 / 南网代理购电文件，输出入库 JSON。细则以 `docs/skill方案设计.md` 与各 skill 的 `SKILL.md` 为准。

## 运行时

- 用 **OpenCode** 打开本仓库根目录。技能只从 `.opencode/` 发现。
- 主会话用 **Build**。人说「更新」加月份（省可省略，省略则跑 `sources.json` 已覆盖全省）加载 `flow`：**串行 `fetch-download`（有 `extraSources` 则 N+1 任务）→ 只把本轮新解析的终稿补进 `jsonMap`（已有终稿直接跳过）→ 一次 `upload`**。允许半份入库。
- 月末调度：`npm run monthly-flow`（最后 3 天跑下月 `{目标月}`；汇报落 `data/report/{目标月}/{MM-DD}.txt`；非窗口退出 0）。
- 落盘：原文 `data/file/{YYYY-MM}/{中文名}_电价表.{后缀}`；解析 JSON——无 `regions.json` 配置为 `data/json/{YYYY-MM}/{中文省}.json`，有配置为各 `data/json/{YYYY-MM}/{label}.json`（**不**汇成一省一份）；定时汇报 `data/report/{目标月}/{MM-DD}.txt`。本地已有原文则跳过下载；本轮开始前已有的对应终稿 JSON 视为已完成，跳过解析且不进 `jsonMap`，不再上传。
- `pathMap` key：标记电价来自哪份原文。省主原文用省 id；另一份原文用 `extraSources[].id`（如 `shenzhen`）。`jsonMap` key：无分区用省 id；有 `regions.json` 用 `{provinceId}:{region}`（按实际写出的区）。不要在会话里贴整份 JSON。解析读 `pathMap` 路径，不要扫目录猜文件。
- 取链下载脚本：`npm run fetch -- {id|sourceId} {YYYY-MM}`（Playwright）。不要用 Plan。
- 模型密钥用本机 `auth.json` 或环境变量；上传仅使用根目录 `upload.config.json`，不要将账密写入仓库。模型以 `opencode.json` 为准。

## 隔离

一省的表头、时段、枚举不能进入另一省。父会话禁止打开 `provinces/` 覆盖正文和电价 PDF/图。禁止读取 `data/file/`、`data/json/` 正文（只供人核对 / 按路径打开 / 上传脚本读盘）。只按路径判断覆盖文件 / 终稿是否存在。解析用内置 `@general`：**每个 pathMap key 一次**（空上下文）；有分区由该 `@general` 按认出的区分文件落盘，**不要**再合并。另一份原文的读表规则放 `provinces/{sourceId}.md`（如 `shenzhen.md`，与省主同级，pathMap key 同为 `shenzhen`），不要与省主表写进同一篇；出哪些区以该覆盖为准。

## 契约

JSON 以 `.opencode/skills/parse/template.md` 为准，须 2 空格缩进。`provinceId` 只抄 `province-ids.md`。`region` / 分区落盘名见 `regions.json`。`priceType` / `priceSource` / `dataGranularity` / `priceUnit` 一律为 `realTime` / `auto` / `1h` / `CNY`。覆盖文件路径与排版以 `rule.md` 为准。
