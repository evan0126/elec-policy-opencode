# data

- `file/`：当次原文，给人核对。路径：`file/{YYYY-MM}/{中文名}_电价表.{后缀}`（如 `file/2026-09/浙江_电价表.pdf`；分区原文用 `regions.md` 的 `label`），不进版本库。同名已有则覆盖。
- `json/`：解析产出，2 空格缩进，不进版本库。无 `regions.md` 配置：`json/{YYYY-MM}/{中文省}.json`；有配置：各 `json/{YYYY-MM}/{label}.json`（如 `广东深圳.json`），**不**汇成一省一份。已有则覆盖。
- `report/`：flow 最终按项汇报（有区用 `label`，无分区用中文省）+ 末尾汇总行。路径：`report/{目标月}/{MM-DD}.txt`，由 `flow` 写入；定时脚本读此文件发短信。不进版本库，同日已有则覆盖。
- 解析输入是 `flow` 传入的 `pathMap` 路径；上传读 `jsonMap` 路径。Agent 不要扫目录猜文件，不要把正文读进父会话。
- 不要把文件写进 `.opencode/skills/`。
