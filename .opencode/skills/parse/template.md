# 电价政策解析 JSON 模板

`parse` 的输出标准。一张表有多档「用户类别 × 电价制度 × 电压等级」时，输出 JSON 数组，每档一条。缺值填 `null`，不要省略字段。

输出必须是 **2 空格缩进** 的 JSON，不要压成一行。每条记录字段顺序固定：身份（含 `region`）→ 档位 → 固定元数据 → `prices` → `periods`。

## 空模板

```json
[
  {
    "name": "",
    "province": "",
    "provinceId": "",
    "region": null,
    "yearMonth": "YYYY-MM",
    "customerCategory": "",
    "tariffMode": "",
    "voltageLevel": "",
    "priceType": "realTime",
    "priceSource": "auto",
    "dataGranularity": "1h",
    "priceUnit": "CNY",
    "prices": {
      "tipPrice": null,
      "peakPrice": null,
      "flatPrice": null,
      "valleyPrice": null,
      "deepValleyPrice": null
    },
    "periods": [
      { "start": "00:00", "end": "24:00", "type": "flat" }
    ]
  }
]
```

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 政策名称。每档一条，用枚举**中文含义**拼接：`{省份}{用户类别}{电价制度}（{电压等级}）`。例：`浙江一般工商业用电单一制（1-10千伏）`、`陕西大工业用电两部制（35千伏）`。不要拼英文字段值。 |
| `province` | string | 是 | 省份中文名。只抄 [province-ids.md](province-ids.md) 当前省那一行的 `province`，不要写「北京市」这类后缀，也不要从文件另起一名。 |
| `provinceId` | string | 是 | 内部系统省份 id。只抄 [province-ids.md](province-ids.md) 当前省那一行的 `id`（如北京 `187`）。不要填 `sources.json` 的拼音节名。 |
| `region` | string \| null | 是 | 省内区域电网枚举。见 [regions.json](regions.json)：该省**无配置** → 必须 `null`；**有配置且能认出** → 抄枚举；**有配置却认不出** → 整省解析失败，不要用 `null` 顶上、不要自造。 |
| `yearMonth` | string | 是 | 生效年月，格式 `YYYY-MM`。 |
| `customerCategory` | string | 是 | 用户类别，仅表示用电分类，不含单一制/两部制。只准 `LARGE_INDUSTRY` / `GENERAL_COMMERCIAL`。 |
| `tariffMode` | string | 是 | 电价制度：单一制或两部制。 |
| `voltageLevel` | string | 是 | 电压等级枚举值。只准下表六档。不满 1 千伏不要出档、不要并入 `LEVEL_1_10`。不要 `LEVEL_BELOW_1` / `LEVEL_35_110`。 |
| `priceType` | string | 是 | 电价类型。**固定填 `realTime`（实时电价）**，不从文件推断。 |
| `priceSource` | string | 是 | 电价来源。**固定填 `auto`（自动）**，不从文件推断。 |
| `dataGranularity` | string | 是 | 数据粒度。**固定填 `1h`（1 小时）**，不从文件推断。 |
| `priceUnit` | string | 是 | 计价单位。**固定填 `CNY`（人民币）**，不从文件推断。 |
| `prices` | object | 是 | 该档当月各时段电度电价，单位元/kWh。表中「—」或不适用填 `null`。 |
| `prices.tipPrice` | number \| null | 是 | 尖时电价。无尖峰填 `null`。 |
| `prices.peakPrice` | number \| null | 是 | 峰时电价。 |
| `prices.flatPrice` | number \| null | 是 | 平时电价。 |
| `prices.valleyPrice` | number \| null | 是 | 谷时电价。 |
| `prices.deepValleyPrice` | number \| null | 是 | 深谷电价。无深谷填 `null`。 |
| `periods` | array | 是 | 当天 24 小时分时规则，按开始时间升序。必须覆盖 `00:00`–`24:00`，相邻衔接、不重叠、无缺口。 |
| `periods[].start` | string | 是 | 开始时刻，`HH:mm`。 |
| `periods[].end` | string | 是 | 结束时刻，`HH:mm`。跨日结束写 `24:00`，不要写 `00:00`。 |
| `periods[].type` | string | 是 | 时段类型：`tip` 尖 / `peak` 峰 / `flat` 平 / `valley` 谷 / `deepValley` 深谷。 |

## 枚举

### `province` / `provinceId`

取值以 [province-ids.md](province-ids.md) 为准，不要在本文件复制第二套。同一文件多档共用同一对 `province` + `provinceId`。

### `customerCategory`

| 值 | 含义 |
|---|---|
| `LARGE_INDUSTRY` | 大工业用电 |
| `GENERAL_COMMERCIAL` | 一般工商业用电 |

只允许三种组合：

| `customerCategory` | `tariffMode` | 入库 `customerCategory` |
|---|---|---|
| `LARGE_INDUSTRY` | `TWO_PART` | `TWO_PART_LARGE_INDUSTRY` |
| `GENERAL_COMMERCIAL` | `TWO_PART` | `TWO_PART_GENERAL_COMMERCIAL` |
| `GENERAL_COMMERCIAL` | `SINGLE_PART` | `SINGLE_PART_GENERAL_COMMERCIAL` |

`LARGE_INDUSTRY` + `SINGLE_PART` 禁止输出。

### `tariffMode`

| 值 | 含义 |
|---|---|
| `SINGLE_PART` | 单一制 |
| `TWO_PART` | 两部制 |

### `voltageLevel`

| 值 | 含义 |
|---|---|
| `LEVEL_1_10` | 1-10 千伏 |
| `LEVEL_20` | 20 千伏 |
| `LEVEL_35` | 35 千伏 |
| `LEVEL_110` | 110 千伏 |
| `LEVEL_220` | 220 千伏 |
| `LEVEL_220_PLUS` | 220 千伏及以上 |

### `priceType`

| 值 | 含义 |
|---|---|
| `dynamic` | 动态电价 |
| `fixedTou` | 固定分时 |
| `dayAheadMarket` | 日前市场 |
| `realTime` | 实时电价 |

### `priceSource`

| 值 | 含义 |
|---|---|
| `auto` | 自动 |
| `api` | 自动入库 |
| `manual` | 人工录入 |

### `dataGranularity`

| 值 | 含义 |
|---|---|
| `1h` | 1 小时 |
| `15m` | 15 分钟 |
| `30m` | 30 分钟 |

### `priceUnit`

| 值 | 含义 |
|---|---|
| `CNY` | 人民币 |

## 解析约束

- 只提取系统入库字段，不输出组成项、容需量、来源页码、注释原文。
- `province` / `provinceId` 从映射表抄当前省，不要从 PDF 猜测，也不要把 `sources.md` 拼音节名当成 `provinceId`。
- `priceType`、`priceSource`、`dataGranularity`、`priceUnit`：每条记录都输出键，固定为 `realTime` / `auto` / `1h` / `CNY`，不要从文件推断，也不要改成其他枚举或 `null`。
- 1.5 倍代理购电价格表不输出。
- `periods` 按当月文件中的实际执行时段生成，不要把全年季节规则堆在一条记录里，也不要套往年钟点。
