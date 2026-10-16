# 省内分区

本表是分区枚举和落盘名称的唯一来源。无该省配置时，输出 JSON 的 `region` 为 `null`；有配置时只准使用本省列出的枚举。

- `provinceId`：省份 key，与 `sources.json` 的省 key 一致（不是入库数字编号）。
- `region`：入库分区枚举，保持原样。
- `label`：显示名和 JSON 落盘文件名（不含 `.json`）。

上传脚本直接读取下表。保持三列表头、列顺序和每行一条配置；单元格使用纯文本，不加反引号、不包含 `|`。

| provinceId | region | label |
| --- | --- | --- |
| guangdong | GD_HUIZHOU | 广东惠州市 |
| guangdong | GD_JIANGMEN | 广东江门市 |
| guangdong | GD_EAST_WEST_WINGS | 广东东西两翼地区 |
| guangdong | GD_NORTH_MOUNTAIN | 广东粤北山区 |
| guangdong | GD_PEARL_RIVER_DELTA_FIVE_CITIES | 广东珠三角五市 |
| guangdong | GD_SHENZHEN | 广东深圳 |
| hebei | HEBEI_SOUTH | 河北南部地区 |
| hebei | HEBEI_JIBEI | 河北冀北地区 |
| neimeng | NMG_EAST | 内蒙古蒙东地区 |
| neimeng | NMG_WEST | 内蒙古蒙西地区 |
| shaanxi | SHAANXI_EXCLUDE_YULIN | 陕西（不含榆林） |
| shaanxi | SHAANXI_YULIN | 陕西榆林 |
