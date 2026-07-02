# Spec: UI Tester Agent

## Goal
- 要解决什么问题：为当前 Web 项目增加独立 UI 自动测试员，持续发现 UI 回归并输出可复现报告。
- 最终目标：UI Tester 只运行本地 UI 测试、截图、trace、console/network 采集和 Markdown 报告，不修改业务源码。
- 本轮核心目标：落地可执行的单次/周期测试 runner、Playwright 基础用例、Codex Agent 配置和报告产物目录。
- 验收结果：执行一次 `npm run ui:test:once` 并生成 `.ui-test-reports/<timestamp>/report.md`。

## Done Contract
- 完成定义：存在独立 `ui-tester` Agent 配置、单次/周期命令、每轮重启服务的 runner、基础 UI 测试与 Markdown 报告。
- 证明来源：文件变更清单、一次运行输出、最新报告路径与报告内问题摘要。
- 仍未完成：无法启动本地服务、无法执行 Playwright、未生成报告或改动越过用户限定范围。

## Scope
- In：`.codex/agents/ui-tester.toml`、根目录测试脚本、`tests/ui/**`、Playwright 配置、报告/trace/screenshot 忽略规则。
- Out：`src/**`、`app/**`、`pages/**`、`components/**`、`server/**`、`api/**`、`db/**`、`agno1/**` 和业务逻辑修复。
- 用户已切分的任务单元：UI Tester Agent + 自动化 UI 测试运行器。
- 轻量评估：standard；多文件测试基础设施，但边界明确。

## Facts / Constraints
- 已确认事实：根目录没有 `package.json`；当前可测 Web 入口是 `analysis_web/server.py`，默认端口 `8765`。
- 技术/业务约束：禁止修改 `agno1/**`；默认本地 sandbox/workspace；不访问生产环境或真实交易/资金/用户数据。
- 已知风险：根目录 `.git` 当前不能被 `git status` 识别，报告中的 git 信息需要 fail-soft。

## Restated Understanding
- 我理解当前任务是：创建一个与实现 Agent 分离的 UI Tester，周期性重启本地 Web 服务后测试 UI 回归。
- 当前核心目标是：测试基础设施可运行且报告可交给实现 Agent 修复。
- 当前边界是：只写测试/runner/报告/配置，不改业务源码。
- 暂不处理：业务页面 selector 补强、UI bug 修复、真实生产环境联通。

## Checkpoint Summary
- 当前任务理解：按用户指定范围落地独立 UI 测试员和自动测试 runner。
- 当前核心目标：一次运行能启动服务、执行测试、关闭服务、生成 Markdown 报告。
- 当前进度：已完成只读探查并获得用户执行批准。
- 下一步 1：新增 Agent 配置、Playwright 配置、runner 和基础测试。
- 下一步 2：执行一次 `npm run ui:test:once`，记录报告路径和问题摘要。
- 涉及文件 / 模块：`.codex/agents/`、`scripts/`、`tests/ui/`、`playwright.config.mjs`、`package.json`、`.gitignore`、`.ui-test-reports/`。
- 风险：Playwright 浏览器依赖可能缺失；当前 `.git` 信息可能不可用。
- 验证方式：单次 runner 生成报告并关闭本轮服务。
- Execution Approval: `Approved`

## Change Log
- 2026-07-01: 用户确认“按方案执行”。
- 2026-07-01: 新增 UI Tester Agent 配置、Playwright 配置、单次/周期 runner、基础 UI 测试用例、报告目录与忽略规则。
- 2026-07-01: 修正 Windows 下 Playwright CLI 调用、Playwright 1.61 JSON 汇总、嵌入 JSON 附件解析和应用加载等待逻辑。

## Validation
- Self-check: 已确认未修改 `agno1/**` 和业务源码目录；测试基础设施写入限定在用户允许范围内。
- Static checks: `node --check scripts\ui-test-once.mjs` 通过；`node --check scripts\ui-test-loop.mjs` 通过。
- Runtime / Test: `npm run ui:test:once` 通过，Run ID `20260701-215509`，10 passed / 0 failed / 0 skipped。
- Human confirmation: 已批准执行
- 结果汇总：最新报告为 `.ui-test-reports/20260701-215509/report.md`，状态 PASS，Console Errors / Network Failures 均为空。
- 核心目标是否已由证据证明完成：Yes
- 若未完成，当前剩余差距：无。
- 剩余风险：根目录 `.git` 当前不能被 git 识别，报告中 git branch/commit 为 unavailable；Playwright 使用本机系统 Chrome channel。

## Resume / Handoff
- 当前状态：UI Tester 测试基础设施已落地并通过一次完整运行。
- 当前卡点：无。
- 下一步唯一动作：如后续实现 Agent 修改 UI，运行 `npm run ui:test:once` 或 `npm run ui:test:loop` 查看新报告。
- 下一轮核心目标：基于新报告定位 UI 回归，不由 UI Tester 修改业务源码。

## Project Sync Candidates
- 是否发现可复用项目事实：Yes
- 候选事实：当前仓库根目录的可测轻量 Web UI 是 `analysis_web/server.py`，但 `agno1/**` 禁止修改。
- 建议同步位置：`mydocs/project/PROJECT_MEMORY.md`
- 同步状态：Not synced
