# analysis-result 美股分析结果 Web 展示 Feature Spec v0

状态：Implemented v0
日期：2026-07-01
范围：`D:\workspace\investment2` 根项目，不修改 `agno1` 目录

## 1. 核心目标

实现一个 Web 前端，用于读取 `analysis-result/<YYYY-MM-DD>/<TICKER>/` 下的每日美股静默吸筹公司分析结果，并以 ticker 为单位展示主分析链路内容。

第一版重点不是重新生成分析，也不是深度业务评分结构化，而是把已有 Markdown 阶段报告可靠展示出来，让用户可以快速判断：

- 当日有哪些 ticker。
- 每个 ticker 的四阶段报告是否齐全。
- 已有阶段报告的原文内容是什么。
- 哪些 ticker 已完成主分析，哪些 ticker 只是部分产物。

## 2. 已确认输入

根输入目录：

```text
analysis-result/
```

日期目录形态：

```text
analysis-result/<YYYY-MM-DD>/
```

ticker 目录形态：

```text
analysis-result/<YYYY-MM-DD>/<TICKER>/
```

主展示文件为 ticker 目录下结尾匹配以下 4 类的 Markdown 文件：

```text
*_analysis_filt.md
*_analysis_v1.md
*_analysis_v2.md
*_analysis_v3.md
```

四个文件都存在，表示该 ticker 完成主分析。并非每个 ticker 都一定有完整四阶段文件。

## 3. 完成状态定义

对每个 ticker 计算 `analysis_status`：

| 状态 | 条件 | 展示含义 |
| --- | --- | --- |
| `complete` | `analysis_filt`, `analysis_v1`, `analysis_v2`, `analysis_v3` 四个主阶段文件都存在 | 主分析完成 |
| `partial` | 至少存在一个主阶段文件，但四个不全 | 已有部分分析产物 |
| `empty` | ticker 目录存在，但四个主阶段文件都不存在 | 无主分析报告 |

每个阶段单独计算 `stage_status`：

| 阶段 | 文件匹配 | 状态 |
| --- | --- | --- |
| `filt` | `*_analysis_filt.md` | present/missing |
| `v1` | `*_analysis_v1.md` | present/missing |
| `v2` | `*_analysis_v2.md` | present/missing |
| `v3` | `*_analysis_v3.md` | present/missing |

## 4. 页面范围

### 4.1 日期列表页

展示 `analysis-result` 下所有日期目录。

每个日期展示：

- 日期。
- ticker 总数。
- `complete` 数量。
- `partial` 数量。
- `empty` 数量。

### 4.2 日期详情页 / ticker 列表

展示某日所有 ticker。

列表字段：

- ticker。
- `analysis_status`。
- 四阶段完成格：`filt`, `v1`, `v2`, `v3`。
- 已有主阶段数量，例如 `3/4`。
- 最近修改时间。
- 可进入详情页的入口。

列表需要支持：

- 按完成状态筛选：全部、完成、部分、无主报告。
- 按 ticker 搜索。
- 按已有阶段数量或 ticker 排序。

### 4.3 ticker 详情页

详情页以四个主阶段 Markdown 为主展示内容。

页面结构：

- 顶部状态卡：ticker、日期、`analysis_status`、阶段完成情况。
- 阶段标签页或分段导航：`filt -> v1 -> v2 -> v3`。
- 每个阶段显示对应 Markdown 渲染内容。
- 缺失阶段显示明确的缺失状态，不生成伪内容。

可作为附件区展示但不进入主链路的产物：

- `*_analysis_v4.md`
- `*_analysis_vfinal_*.md`
- `*_nld_*.md`
- `NLD_*.csv`
- `Kline_*.png`
- `Kline_log_*.png`
- `.manifest.json`
- `.pipeline.log`
- `.chatgpt_chat_url`
- `_debug/`

## 5. 最小结构化数据合同

日期级对象：

```json
{
  "date": "2026-06-08",
  "ticker_count": 33,
  "complete_count": 9,
  "partial_count": 24,
  "empty_count": 0
}
```

ticker 级对象：

```json
{
  "date": "2026-06-08",
  "ticker": "CIFR.OQ",
  "analysis_status": "complete",
  "stage_count": 4,
  "stages": {
    "filt": {
      "status": "present",
      "path": "analysis-result/2026-06-08/CIFR.OQ/CIFR.OQ_analysis_filt.md",
      "modified_at": "..."
    },
    "v1": {
      "status": "present",
      "path": "analysis-result/2026-06-08/CIFR.OQ/CIFR.OQ_analysis_v1.md",
      "modified_at": "..."
    },
    "v2": {
      "status": "present",
      "path": "analysis-result/2026-06-08/CIFR.OQ/CIFR.OQ_analysis_v2.md",
      "modified_at": "..."
    },
    "v3": {
      "status": "present",
      "path": "analysis-result/2026-06-08/CIFR.OQ/CIFR.OQ_analysis_v3.md",
      "modified_at": "..."
    }
  },
  "attachments": [
    {
      "name": "Kline_CIFR.OQ_20240501_20260609.png",
      "path": "analysis-result/2026-06-08/CIFR.OQ/Kline_CIFR.OQ_20240501_20260609.png",
      "url": "/asset/2026-06-08/CIFR.OQ/Kline_CIFR.OQ_20240501_20260609.png",
      "size_bytes": 630225,
      "modified_at": "..."
    }
  ]
}
```

## 6. 非目标

第一版不做以下事情：

- 不调用或修改 `agno1` 生成链路。
- 不重新跑分析任务。
- 不把 `company_state_daily_report.md` 作为主展示依据。
- 不强行从 Markdown 中抽取投资评级、目标价、建仓建议或期权策略。
- 不做交易执行、仓位管理或券商集成。
- 不修改 `agno1` 下任何代码。

## 7. 解析规则

- 文件发现以文件名后缀为准，不依赖 Markdown 标题。
- ticker 名来自目录名，不从文件正文猜测。
- 日期来自日期目录名，不从文件正文猜测。
- 缺失文件只记录 `missing`，不自动推断失败原因。
- Markdown 原文渲染必须保留标题、表格、列表和代码块。
- 附件文件只做链接或预览，不影响四阶段完成状态。

## 8. 风险与约束

- 原始 Markdown 可能包含交易语言，例如买入、建仓、仓位、做空、期权策略。第一版主界面只展示报告内容，不把这些文本提升为系统操作建议。
- 部分报告可能格式不一致，因此第一版只要求稳定识别文件存在性和渲染原文。
- `company_state_daily_report.md` 可作为未来汇总增强来源，但当前用户已确认主展示对象是 ticker 下四个阶段报告。
- 当前仓库规则禁止修改 `agno1`，因此后续实现应放在根项目新增展示层中。

## 9. Done Contract

本 Feature Spec 完成的证据：

- 文档落盘在根项目的 spec 目录。
- 文档明确冻结四阶段主链路、完成状态、页面范围、数据合同和非目标。
- 后续代码实现前必须基于本 spec 提交最小实现方案，并等待明确批准。

## 10. 待确认问题

1. 第一版是否只读取本地 `analysis-result`，不读取远端共享目录或数据库。
2. 附件区是否在第一版实现，还是先只做四个主阶段 Markdown。
3. Markdown 渲染是否需要支持目录锚点、全文搜索和阶段内关键字搜索。
4. `company_state_daily_report.md` 是否完全不展示，还是作为日期详情页的可选“日报原文”标签。

## 11. 实现记录

本次最小实现新增根项目独立展示层：

```text
analysis_web/server.py
analysis_web/static/index.html
analysis_web/static/app.js
analysis_web/static/styles.css
```

实现边界：

- 使用 Python 标准库 `http.server`，不新增依赖。
- 只读取本地 `analysis-result`。
- 不调用、不修改 `agno1`。
- 主功能只围绕四阶段 Markdown：`filt / v1 / v2 / v3`。
- 附件区已进入第一版 UI 主功能，作为只读链接与预览，不影响四阶段完成状态。

已验证：

- `python -B` AST 解析 `analysis_web/server.py` 通过。
- `node --check analysis_web/static/app.js` 通过。
- API 扫描 `2026-06-08` 返回 33 个 ticker。
- 四阶段完成统计为 `complete=9`、`partial=24`、`empty=0`。
- `CIFR.OQ` 返回 `complete / 4`。
- `AADX.N` 返回 `partial / 1`。
- 本地浏览器打开 `http://127.0.0.1:8765/` 后，日期、ticker 列表、阶段标签和 Markdown 内容可渲染。

## 12. v1 收敛更新

本次收敛任务只做两件事：

1. 修正 spec 中与实现结果不一致的日期统计示例。
2. 在 ticker 详情页底部增加只读附件区。

附件区规则：

- 附件来自 ticker 目录根部非四阶段主报告文件。
- 图片附件可在页面内预览。
- 文本类附件可在页面内只读预览。
- 其他类型保留“打开”链接。
- 附件存在与否不改变 `complete / partial / empty` 判定。
- `_debug/` 子目录暂不递归展示。

新增验证结论：

- API 中 `CIFR.OQ` 返回 14 个附件。
- `.chatgpt_chat_url` 通过 `/asset/...` 返回 `text/plain; charset=utf-8`，内容以 `https://chatgpt.com/g/g-` 开头。
- `Kline_CIFR.OQ_20240501_20260609.png` 通过 `/asset/...` 返回 `image/png`，大小为 630225 bytes。
- 浏览器中 `CIFR.OQ` 详情页显示附件区，附件行数为 14。
- PNG 附件可在页面内内嵌预览。
- 文本类附件可在页面内只读预览。
- 本地服务已在 `http://127.0.0.1:8765/` 验证，当前监听进程为 `21264`。

本地运行命令：

```powershell
python -B analysis_web/server.py --host 127.0.0.1 --port 8765
```

## 13. 阶段切换卡死修复计划

现象：

- 在 `ALOY.OQ` 从 `filt` 切换到 `v1` 后，页面停在 `加载中`，浏览器主线程无响应。

已定位：

- 后端 `/api/report/2026-06-08/ALOY.OQ/v1` 正常返回，`content_length` 为 15857。
- 同一份 `v1` Markdown 用当前 `renderMarkdown()` 在 Node 中渲染超过 10 秒未完成。
- 根因在 `flushTable()` 中用于识别 Markdown 表格分隔行的正则：
  `^(\s*\|?\s*:?-{3,}:?\s*)+\|?\s*$`
- 该正则会在部分普通表格行上发生灾难性回溯，阻塞前端主线程。
- 用 `split("|")` 后逐单元格判断 `:---:` / `---` 这类分隔单元，渲染同一 `v1` 内容约 1ms 完成。

最小修复范围：

- 只修改 `analysis_web/static/app.js`。
- 增加确定性的 `isTableSeparatorRow(row)`。
- 将 `flushTable()` 的 separator-row filter 从复杂正则替换为该函数。
- 不修改 `agno1`，不改后端 API，不调整附件逻辑。

Done Contract：

- `ALOY.OQ` 从 `filt` 切换到 `v1` 不再卡死。
- `reportMeta` 显示 `ALOY.OQ_analysis_v1.md`。
- Markdown 内容正常渲染，附件区保持可用。
- Node 对 `ALOY.OQ_analysis_v1.md` 的渲染对照测试在 1 秒内完成。

执行结果：

- 已将 `analysis_web/static/app.js` 的表格分隔行判断替换为确定性函数 `isTableSeparatorRow(row)`。
- `node --check analysis_web/static/app.js` 通过。
- Node 对 `ALOY.OQ_analysis_v1.md` 的渲染对照测试完成，输入 15857 chars，输出 17397 chars，用时 2ms。
- 独立 headless Chrome 使用新配置目录打开 `http://127.0.0.1:8765/` 后，页面确认 `hasFix=true`。
- headless Chrome 中 `ALOY.OQ` 从 `filt` 切到 `v1` 后：
  - `activeStage` 为 `v1`。
  - `reportMeta` 为 `analysis-result/2026-06-08/ALOY.OQ/ALOY.OQ_analysis_v1.md · 2026-06-09T04:32:02+00:00`。
  - `markdownLength` 为 13126。
  - `tableCount` 为 6。
  - `attachmentRows` 为 6。
  - `stillLoading=false`。

## 14. 阶段切换稳态 v2

目标：

- 让 `filt / v1 / v2 / v3` 在快速点击、旧请求返回、静态脚本缓存场景下保持显示状态一致。

最小范围：

- 修改 `analysis_web/static/app.js`：
  - 增加阶段加载请求序号，忽略过期请求结果。
  - 阶段切换时只更新阶段标签、元信息和正文区，不重复重绘附件区。
  - 当前阶段加载中时给阶段按钮明确 loading/disabled 状态。
- 修改 `analysis_web/server.py`：
  - 静态资源响应增加 `Cache-Control: no-store`，避免本地调试继续使用旧 `app.js`。
- 不修改 `agno1`。
- 不改变 `/api/dates`、`/api/dates/<date>/tickers`、`/api/report/<date>/<ticker>/<stage>` 的数据契约。

Done Contract：

- 快速点击 `filt -> v1 -> v2 -> v3` 不会卡死。
- 最终展示内容对应最后一次点击的阶段。
- 旧请求返回不能覆盖新阶段内容。
- 附件区不因阶段切换被反复重置。
- `/app.js` 响应包含 `Cache-Control: no-store`。

执行结果：

- 已在 `analysis_web/static/app.js` 中增加 `stageRequestId` 和 `loadingStage`。
- 阶段切换时旧请求返回会被忽略，只有最新请求允许更新 `reportMeta` 和正文区。
- 阶段加载中会显示如 `v1 加载中`，并禁用当前加载中的阶段按钮。
- 阶段切换时不再重绘附件区。
- 已在 `analysis_web/server.py` 的静态文件响应中增加 `Cache-Control: no-store`。
- `node --check analysis_web/static/app.js` 通过。
- `python -B` AST 解析 `analysis_web/server.py` 通过。
- `/app.js` 响应验证：
  - `Content-Type=text/javascript; charset=utf-8`
  - `Cache-Control=no-store`
  - 响应内容包含 `stageRequestId` 与 `loadingStage`
- 独立 headless Chrome 验证当前默认页为 `2026-06-30 / AHCO.OQ`。
- 在人为制造乱序返回的情况下快速点击 `v1 -> v2 -> v3`：
  - 点击 `v1` 后按钮显示 `v1 加载中` 且 `disabled=true`。
  - 最终 `activeStage=v3`。
  - 最终 `reportMeta=analysis-result/2026-06-30/AHCO.OQ/AHCO.OQ_analysis_v3.md · 2026-07-01T02:06:22.303923+00:00`。
  - `markdownLength=17920`。
  - `attachmentRows=6`。
  - `stillLoading=false`。

## 15. 月层级与日期控件选择

现状：

- `analysis-result` 已从根部日期目录变为月层级：
  - `analysis-result/2026-06/2026-06-30/<ticker>/...`
  - `analysis-result/2026-03/2026-03-30/<ticker>/...`
- 当前后端 `_date_dirs()` 只扫描 `analysis-result/<YYYY-MM-DD>`，无法识别新结构。
- 当前前端用日期按钮列表选择日期；下一步改为日期控件选择。

目标：

- 支持 `analysis-result/<YYYY-MM>/<YYYY-MM-DD>/<ticker>`。
- 对外 API 仍使用 `date=YYYY-MM-DD`，前端不需要知道物理月目录。
- 前端日期选择改为 `<input type="date">`。
- 不修改 `agno1`。

最小范围：

- 修改 `analysis_web/server.py`：
  - 增加 `MONTH_RE`。
  - `_date_dirs()` 扫描月目录下的日期目录，并保留旧的根部日期目录兼容。
  - 增加 `_date_dir(date)`，把 `YYYY-MM-DD` 映射到 `analysis-result/YYYY-MM/YYYY-MM-DD`，旧结构作为 fallback。
  - `_ticker_dirs()`、`list_tickers()`、`get_report()`、`get_attachment_path()` 统一使用 `_date_dir(date)`。
- 修改 `analysis_web/static/index.html`：
  - 日期面板使用日期输入控件。
  - 保留一个日期统计摘要区域。
- 修改 `analysis_web/static/app.js`：
  - `init()` 加载日期列表后设置 date input 的 `min/max/value`。
  - date input 变化时调用 `selectDate(value)`。
  - 如果选择无报告日期，显示明确空状态，不崩溃。
- 修改 `analysis_web/static/styles.css`：
  - 增加日期控件与摘要样式。

Done Contract：

- `/api/dates` 能列出月层级下的日期，例如 `2026-06-30`、`2026-06-08`、`2026-03-30`。
- `/api/dates/2026-06-30/tickers` 能返回 ticker 列表。
- `/api/report/2026-06-30/<ticker>/filt` 能返回报告正文。
- 前端用日期控件选择 `2026-06-30` 后能展示 ticker 和报告。
- 选择不存在的日期时显示“该日期没有分析结果”，不产生未捕获异常。
- 附件 `/asset/<date>/<ticker>/<name>` 在月层级下仍可打开。

执行结果：

- `analysis_web/server.py` 已支持 `analysis-result/<YYYY-MM>/<YYYY-MM-DD>/<ticker>`。
- 旧结构 `analysis-result/<YYYY-MM-DD>/<ticker>` 保留 fallback。
- `analysis_web/static/index.html` 已将日期列表按钮改为 `<input type="date">`。
- `analysis_web/static/app.js` 已使用日期控件驱动 `selectDate()`，并处理无结果日期。
- `analysis_web/static/styles.css` 已补充日期控件和日期摘要样式。
- `python -B` AST 解析 `analysis_web/server.py` 通过。
- `node --check analysis_web/static/app.js` 通过。
- `/api/dates` 验证：
  - `2026-06-30`：35 个 ticker，`complete=16`、`partial=19`、`empty=0`。
  - `2026-06-08`：33 个 ticker，`complete=9`、`partial=24`、`empty=0`。
  - `2026-03-30`：24 个 ticker，`complete=0`、`partial=0`、`empty=24`。
- `/api/dates/2026-06-30/tickers` 返回 35 个 ticker。
- `/api/report/2026-06-30/ACTG.OQ/filt` 返回 `present`，路径为 `analysis-result/2026-06/2026-06-30/ACTG.OQ/ACTG.OQ_analysis_filt.md`，正文长度为 6206。
- `/asset/2026-06-30/ACTG.OQ/.chatgpt_chat_url` 返回 200，`Content-Type=text/plain; charset=utf-8`。
- `/api/dates/2026-04-01/tickers` 返回 404。
- 独立 headless Chrome 验证：
  - 初始日期控件值为 `2026-06-30`，`min=2026-03-02`，`max=2026-06-30`，ticker 按钮数 35。
  - 切换到 `2026-06-08` 后，ticker 按钮数 33，报告路径包含 `analysis-result/2026-06/2026-06-08/...`。
  - 切换到 `2026-04-01` 后，显示“该日期没有分析结果。”，ticker 按钮数 0，报告区隐藏。

## 16. URL 状态恢复 v3

目标：

- 当前查看状态可通过 URL 恢复和分享。
- 刷新页面后保持指定日期、ticker、阶段。

URL 形态：

```text
/?date=2026-06-30&ticker=AHCO.OQ&stage=v3
```

最小范围：

- 只修改 `analysis_web/static/app.js`。
- 不修改后端 API。
- 不修改 `agno1`。

规则：

- `date` 使用 `YYYY-MM-DD`。
- `ticker` 使用 ticker 目录名，例如 `AHCO.OQ`。
- `stage` 只接受 `filt / v1 / v2 / v3`。
- URL 中 `date` 无效或没有结果时，fallback 到最新有结果日期。
- URL 中 `ticker` 无效时，fallback 到当前日期排序后的第一个 ticker。
- URL 中 `stage` 无效或该阶段缺失时，fallback 到该 ticker 第一个存在的阶段。
- 用户操作日期、ticker、stage 后，用 `history.replaceState` 更新 query，不触发页面跳转或重新加载。

Done Contract：

- 打开 `/?date=2026-06-08&ticker=CIFR.OQ&stage=v3` 后恢复到对应报告。
- 选择日期时 URL 更新 `date` 并清理无效 `ticker/stage` 到实际选择结果。
- 选择 ticker 时 URL 更新 `ticker`。
- 切换阶段时 URL 更新 `stage`。
- 刷新页面后恢复到 URL 指定状态。
- 无效 `ticker/stage` 不崩溃，并回落到有效状态。

执行结果：

- `analysis_web/static/app.js` 已增加 URL query 读写：
  - 初始化读取 `date/ticker/stage`。
  - 用户操作后用 `history.replaceState` 写回当前有效状态。
  - 无效 `date/ticker/stage` 按规则回退到有效状态。
- `node --check analysis_web/static/app.js` 通过。
- 本地服务已重新启动在 `http://127.0.0.1:8765/`，当前监听进程为 `20780`。
- 内置浏览器验证通过：
  - 打开 `/?date=2026-06-08&ticker=CIFR.OQ&stage=v3` 后，页面恢复到 `2026-06-08 / CIFR.OQ / v3`，报告路径为 `analysis-result/2026-06/2026-06-08/CIFR.OQ/CIFR.OQ_analysis_v3.md`。
  - 从 `v3` 点击切换到 `v1` 后，URL 更新为 `stage=v1`，报告路径为 `CIFR.OQ_analysis_v1.md`。
  - 从 `CIFR.OQ` 切换到 `ALOY.OQ` 后，URL 更新为 `ticker=ALOY.OQ&stage=filt`。
  - 打开 `/?date=2026-06-08&ticker=NOPE&stage=bad` 后，回退到 `2026-06-08 / ALOY.OQ / filt`，URL 同步为有效状态。
  - 打开 `/?date=2026-04-01&ticker=NOPE&stage=v3` 后，回退到 `2026-06-30 / AHCO.OQ / v3`，URL 同步为有效状态。
