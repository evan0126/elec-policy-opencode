---
name: upload
description: >-
  按 jsonMap 路径读解析 JSON，转成接口数组并提交自有系统。由 flow 传入月份与 jsonMap。
  Use when flow has jsonMap ready, or user asks only to upload / 入库.
---

# 电价上传

不下载、不解析电价原文。只按 `jsonMap` 路径读盘，转成接口格式，登录后**一次** POST。禁止 `question`。

## 输入（flow 写入）

| 项 | 格式 |
| --- | --- |
| 月份 | `YYYY-MM` |
| jsonMap | key 为省 id，或有分区时 `{provinceId}:{regionId}`；value 为落盘路径（无分区 `{中文省}.json`，有分区 `{label}.json`）；失败项不进 map |

`jsonMap` 为空 → 不登录、不 POST，回复 `{ "status": "跳过", "submitted": [] }`。

解析一条档位对应接口一条；多省拼成**一个数组一次提交**。

## 脚本

```
.opencode/skills/upload/
  SKILL.md
  scripts/
    to-api.mjs    # 读 jsonMap 路径 → 接口数组
    post.mjs      # 先登录拿 token，再一次 POST
```

```bash
node .opencode/skills/upload/scripts/post.mjs YYYY-MM '<jsonMap>'
# 或 stdin
echo '<jsonMap>' | node .opencode/skills/upload/scripts/post.mjs YYYY-MM
```

## 接口

| 步骤 | 说明 |
| --- | --- |
| 登录 | `POST {BASE}/login`，body `{ "name", "password" }`；token 从响应取出 |
| 入库 | `POST {BASE}/electricity-policy/save`；带登录 token；body 为整表数组 |

接口地址、用户名、密码由脚本读取根目录 `upload.config.json` 的 `base`、`user`、`password`。不要读取或输出本地配置正文。参考 `upload.config.example.json`，`enabled: false`（缺省也是 false）时，在读电价 JSON、登录、POST 之前返回 `{ "status": "仅解析", "submitted": [] }`；`enabled: true` 才上传。登录失败不要调 save。

字段映射与枚举约束见设计文档 §3.1：`customerCategory` 只准三项；`voltageLevel` 只准规定 LEVEL_*；不满 1 千伏跳过；`touPeriods` 跳过价为 null 的时段。有区时 `name` 前缀用 `regions.md` 的 `label`，不用省名。不要改枚举大小写，不要把 `region` 缺省成全省名。

## 输出（回复 flow）

一次整表 POST，接口一次回整次结果。`submitted` 与 **jsonMap 的 key 一致**（有区就按区，不按省去重）：

```json
{
  "status": "更新成功",
  "submitted": ["zhejiang", "guangdong:GD_SHENZHEN", "guangdong:GD_HUIZHOU"]
}
```

失败：

```json
{
  "status": "上传失败",
  "error": "接口返回的具体错误信息",
  "submitted": ["zhejiang", "guangdong:GD_SHENZHEN", "guangdong:GD_HUIZHOU"]
}
```

| 字段 | 含义 |
| --- | --- |
| `status` | `更新成功` / `上传失败` / `跳过` |
| `error` | 整次失败原因；成功时可无 |
| `submitted` | 进入本次 POST 的 jsonMap key（省 id，或 `{provinceId}:{regionId}`） |

`flow` 投影给人：`submitted` 各项一律跟整次 `status`（失败带 `error`）；显示名无分区用中文省，有分区用 `regions.md` 的 `label`。
