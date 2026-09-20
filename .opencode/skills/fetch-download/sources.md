# 各省电价文件来源

程序读 [sources.json](sources.json)。改栏目、标题、别名改 JSON。点击步骤见 [scripts/open-column.mjs](scripts/open-column.mjs)。未覆盖的不要编造。

入口：https://www.95598.cn/osgweb/index

## 字段

根对象：

| 字段 | 含义 |
|---|---|
| `entry` | 网上国网首页 |
| `aliases` | 用户说法 → 省 `id` |
| `unsupported` | 未覆盖，脚本直接失败 |
| `excludeTitle` | 全国默认排除的标题片段 |
| `provinces` | 按 `id` 的省规则 |

各省（必填）：

| 字段 | 含义 |
|---|---|
| `name` | 中文短名 |
| `portalCity` | 顶栏切省用的文案（如「内蒙」） |
| `columnPath` | `[顶栏, 左侧, 右侧子栏目]`。第三段有才点 |
| `finder` | 找文件方式，见 [scripts/find-file.mjs](scripts/find-file.mjs) |
| `titlePattern` | 当月标题样例，`YYYY年M月` 会被替换。轻微差异仍可取 |

各省（可选）：

| 字段 | 含义 |
|---|---|
| `portal` | 缺省网上国网；`csg` 走南网 |
| `entry` | 覆盖根入口（南网省） |
| `extraSources` | 省主原文之外的下载槽；项含 `id`（pathMap key / CLI / 覆盖 md 名，勿与省 key 撞名）、`saveName`（落盘中文名）、`portalCity`、标题规则等 |
| `matchYearMonth` | 默认按年月匹配。`false` 时不看年月（西藏峰谷表） |
| `excludeTitle` | 该省额外排除 |
| `note` | 成功时写进说明 |

`finder`：

| 值 | 操作 |
|---|---|
| `sgTable` | `.el-table .cell` 点开即下载 |
| `sgImage` | 表格进详情，抄内嵌图 |
| `sgNotice` | `.fagui li.item-title` 进详情，点「预览」 |
| `csgListImage` | 南网列表点进详情，抄内嵌图或下附件 PDF |

## 缺口

| 状态 | 对象 |
|---|---|
| 待补充 | 冀北 |
| 不取 | 台湾、香港、澳门 |
| 默认 | 河北走国网南网口径；内蒙古走蒙东 |

## 例外

JSON 已有字段的不重复。只记核对时容易下错的：

| id | 备注 |
|---|---|
| hebei | 冀北 `jibei` 待补充。列表里有新能源电价信息表，不要取 |
| neimeng | 蒙东。同页有农业生产，第三段必须是「代理购电」 |
| liaoning | 同页还有农业生产、居民，目标只在「代理购电价格表」 |
| anhui | 同月常有周报/结算，JSON 已排除，只取月度公告 |
| xizang | 无按月代理购电。取峰谷分时表，排除农业生产、居民 |
| shanghai | 标题有时是「公示表」 |
| shanxi | 部分月份标题带「更新」 |
| sichuan | 部分月份是「工商业用户电价表」 |
| zhejiang | `sgNotice`：右侧公告列表，详情点「预览」 |
| tianjin / shanxi / shandong / hubei / gansu | `sgImage` |
| guangdong | 南网 `csgListImage`；主任务广州；深圳 `extraSources`，pathMap / CLI = `shenzhen` |
| guangxi | 南网 `csgListImage`；标题「YYYY年M月代理购电相关价格表」，排除目录销售等 |
| hainan | 南网 `csgListImage`；标题带括号月份 |
| guizhou | 南网 `csgListImage`；标题为「代理购电用户电价公告」 |
| yunnan | 南网 `csgListImage`；排除销售电价表 |
