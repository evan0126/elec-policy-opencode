---
name: upload
description: >-
  按 jsonMap 路径读解析 JSON，转成接口数组并提交自有系统。由 flow 传入月份与 jsonMap。
  Use when flow has jsonMap ready, or user asks only to upload / 入库.
---

# 电价上传

不下载、不解析电价原文。只按 `jsonMap` 路径读盘，转成接口格式，每个启用环境独立登录后各**一次** POST。禁止 `question`。

## 输入（flow 写入）

| 项 | 格式 |
| --- | --- |
| 月份 | `YYYY-MM` |
| jsonMap | key 为省 id，或有分区时 `{provinceId}:{regionId}`；value 为落盘路径（无分区 `{中文省}.json`，有分区 `{label}.json`）；失败项不进 map |

`jsonMap` 为空 → 不登录、不 POST，回复 `{ "status": "跳过", "submitted": [] }`。

解析一条档位对应接口一条；多省拼成**一个数组，每个启用环境各提交一次**。

## 脚本

```
.opencode/skills/upload/
  SKILL.md
  scripts/
    to-api.mjs    # 读 jsonMap 路径 → 接口数组
    post.mjs      # 各启用环境独立登录拿 token，各一次 POST
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

接口地址、用户名、密码由脚本读取根目录 `upload.config.json` 的 `environments.test` / `environments.production` 下的 `base`、`user`、`password`。根级 `enabled` 是总开关，各环境 `enabled` 是独立开关，均默认 false。不要读取或输出本地配置正文。参考 `upload.config.example.json`，总开关关闭或无启用环境时，在读电价 JSON、登录、POST 之前返回 `{ "status": "仅解析", "submitted": [] }`。每个启用环境独立登录；某环境登录失败不调该环境 save，但继续其它环境。

字段映射与枚举约束见设计文档 §3.1：`customerCategory` 只准三项；`voltageLevel` 只准规定 LEVEL_*；不满 1 千伏跳过；`touPeriods` 跳过价为 null 的时段。有区时 `name` 前缀用 `regions.md` 的 `label`，不用省名。不要改枚举大小写，不要把 `region` 缺省成全省名。

## 输出（回复 flow）

执行后将脚本结果原样返回给 flow，保留 `environments` 中各环境状态和失败原因，不只回复整体成功或失败。每个启用环境各一次整表 POST，接口各回整次结果。`submitted` 与 **jsonMap 的 key 一致**（有区就按区，不按省去重），表示拟提交项，不保证所有环境均已成功入库。

### 所有启用环境均上传成功

```json
{
  "status": "更新成功",
  "submitted": ["zhejiang", "guangdong:GD_SHENZHEN", "guangdong:GD_HUIZHOU"],
  "environments": {
    "test": { "status": "更新成功", "submitted": ["zhejiang", "guangdong:GD_SHENZHEN", "guangdong:GD_HUIZHOU"] },
    "production": { "status": "更新成功", "submitted": ["zhejiang", "guangdong:GD_SHENZHEN", "guangdong:GD_HUIZHOU"] }
  }
}
```

### 部分环境上传失败

测试环境已成功、正式环境失败时，整体返回「上传失败」，同时保留测试环境成功结果：

```json
{
  "status": "上传失败",
  "error": "production: 接口返回的具体错误信息",
  "submitted": ["zhejiang"],
  "environments": {
    "test": { "status": "更新成功", "submitted": ["zhejiang"] },
    "production": { "status": "上传失败", "error": "接口返回的具体错误信息", "submitted": ["zhejiang"] }
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `status` | `更新成功` / `上传失败` / `跳过` / `仅解析`；所有启用环境成功才是更新成功 |
| `error` | 整次失败原因；成功时可无 |
| `submitted` | 进入本次 POST 的 jsonMap key（省 id，或 `{provinceId}:{regionId}`） |
| `environments` | 实际执行的环境结果，key 为 `test` / `production`，各含 `status`、`submitted`、失败时的 `error` |

`flow` 投影给人：只有一个启用环境时省略环境名称，如「浙江：更新成功」或「浙江：上传失败，原因：xxx」；多个启用环境时直接列出各环境状态，如「浙江：测试环境：更新成功；正式环境：上传失败，原因：xxx」，不重复整体上传状态、不加括号。整体 `status` 用于汇总计数。部分成功时必须写清哪个环境已成功，不能把两边都说成失败。显示名无分区用中文省，有分区用 `regions.md` 的 `label`。flow 不自动补传已有终稿；补传时显式调用本脚本，仅开启待补传环境。

用户直接调用本 skill 时，采用相同回复格式，见 flow 的「上传后回复示例」。只启用一个环境时省略环境名称，不把关闭的环境列为失败。
