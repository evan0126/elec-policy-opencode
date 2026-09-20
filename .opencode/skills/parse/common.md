# 通用解析

只服务 prompt 里的那一个 `id`。字段以同 skill 下 `template.md` 为准。prompt 给出的覆盖路径必存在：先读本文件再读该覆盖（`provinces/{pathMapKey}.md`；省主与额外原文同级，只读一份）。覆盖排版见 [rule.md](rule.md)，不要把本文件的枚举或 periods 约定抄进覆盖。


## 取哪张表

- 要：当月代理购电工商业用户电价 / 公示表 / 电价表中的 **分时电度电价**（尖/峰/平/谷/深谷）。
- 不要：1.5 倍表、组成项拆分、容（需）量电价、信息表、输配电价政策原文、全年 1–12 月汇总。

## 电价数字

- 单位元/kWh，按原文精度，不要四舍五入到更短小数。
- 分时电度价按**当月表头文字**识别，不要按第几列或固定列序。常见表头：尖峰/尖、高峰/峰、平段/平、低谷/谷、深谷。
- 「—」「/」「\」「不适用」→ 对应 `prices.*` 为 `null`。
- 无尖峰表头或当月不执行尖峰 → `tipPrice: null`，`periods` 里不要出现 `tip`。
- 无深谷表头或当月不执行深谷 → `deepValleyPrice: null`，`periods` 里不要出现 `deepValley`。
- 不要用非分时列冒充分时价。
- `priceType` / `priceSource` / `dataGranularity` / `priceUnit`：固定填 `realTime` / `auto` / `1h` / `CNY`，不要从文件读，也不要填 `null` 或其他枚举。

## 枚举映射（原文 → 模板）

`customerCategory`：

- 一般工商业 / 工商业 / 工商业用电 / 代理购电用户 → `GENERAL_COMMERCIAL`
- 明确写大工业、大工业用电（两部制）→ `LARGE_INDUSTRY`（必须配 `TWO_PART`）
- 表头同价写「大工业及一般工商业」→ 出两条：`LARGE_INDUSTRY`+`TWO_PART` 与 `GENERAL_COMMERCIAL`+`TWO_PART`
- 单一制只有一般工商业：`GENERAL_COMMERCIAL` + `SINGLE_PART`；不要出大工业单一制

`tariffMode`：

- 单一制 → `SINGLE_PART`
- 两部制 → `TWO_PART`

`voltageLevel`（一行一个电压，不要合并未同价的档；只准模板六档）：

- 不满 1 千伏 / <1kV → **不要出档**，不要并入 `LEVEL_1_10`，也不要写 `LEVEL_BELOW_1`
- 1–10 千伏、1~10 千伏、原文只写 10 千伏 → `LEVEL_1_10`
- 单独的 20 千伏且电价与 1–10 不同 → `LEVEL_20`；与 1–10 印在同一行（如 `1~10（20）千伏`）→ `LEVEL_1_10`，不要再复制一条 `LEVEL_20`
- 35 千伏 → `LEVEL_35`
- 35–110 千伏（合并档、同价）→ 拆成 `LEVEL_35` 与 `LEVEL_110` 两条，不要 `LEVEL_35_110`
- 66 千伏 → `LEVEL_110`
- 110 千伏（单独档）→ `LEVEL_110`
- 110–220 千伏（合并档、同价）→ 拆成 `LEVEL_110` 与 `LEVEL_220` 两条
- 220 千伏（单独档、不含「及以上」）→ `LEVEL_220`
- 220 千伏及以上 → `LEVEL_220_PLUS`

`province` / `provinceId`：只抄 [province-ids.md](province-ids.md)，用中文名匹配 `province` 列；`provinceId` 用该行 `id`。不要用「河北（南网）」等口头说法，也不要把 `fetch-download/sources.json` 拼音节名写入 `provinceId`。

`name`：每档用中文含义拼接，`{省份}{用户类别}{电价制度}（{电压等级}）`。省份用映射表短名（北京，不要「北京市」）。用户类别 / 电价制度 / 电压等级抄本文件枚举表「含义」列。例：`浙江一般工商业用电单一制（1-10千伏）`、`陕西大工业用电两部制（35千伏）`。不要拼英文字段值，不要年月。

## periods

- 从当月文件的表注、公告正文或附表提取该月实际执行时段，不要使用过往月份或写死的钟点。
- 只采用 **该 `yearMonth` 所在季节/月份** 的一套，不要输出多套季节。
- 节假日深谷等特殊日：默认输出工作日/常规日时段；除非用户点名节假日方案。
- `type`：`tip` / `peak` / `flat` / `valley` / `deepValley`。
- 结束跨日写 `24:00`。
- 文件完全没有时段说明：失败并写明缺时段，不要编造。
