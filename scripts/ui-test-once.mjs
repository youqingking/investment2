import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const runId = process.env.UI_TEST_RUN_ID || timestamp();
const reportDir = resolve(repoRoot, ".ui-test-reports", runId);
const logDir = join(reportDir, "logs");
const serverStdoutPath = join(logDir, "server.stdout.log");
const serverStderrPath = join(logDir, "server.stderr.log");
const runnerLogPath = join(logDir, "runner.log");
const consoleNetworkPath = join(reportDir, "console-network-summary.json");
const reportPath = join(reportDir, "report.md");

mkdirSync(logDir, { recursive: true });

const metadata = {
  runId,
  startedAt: new Date().toISOString(),
  reportDir,
  repoRoot,
  testCycle: process.env.UI_TEST_LOOP_CYCLE || "once",
  environment: "local sandbox/workspace",
  gitBranch: safeExec("git", ["branch", "--show-current"]) || "unavailable",
  gitCommit: safeExec("git", ["rev-parse", "--short", "HEAD"]) || "unavailable",
  packageManager: detectPackageManager(),
  baseURL: process.env.UI_TEST_BASE_URL || "",
  startCommand: "",
  status: "FAIL",
  playwrightExitCode: null,
  playwrightError: null,
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  failedTests: [],
  findings: [],
  startupError: null
};

let serverProcess;
let serverStopped = false;

process.on("SIGINT", async () => {
  log("received SIGINT; stopping local web service");
  await stopServer();
  process.exit(130);
});

process.on("SIGTERM", async () => {
  log("received SIGTERM; stopping local web service");
  await stopServer();
  process.exit(143);
});

try {
  const start = await resolveStartCommand();
  metadata.startCommand = commandToString(start.command, start.args);
  metadata.baseURL = process.env.UI_TEST_BASE_URL || `http://${start.host}:${start.port}`;
  process.env.UI_TEST_BASE_URL = metadata.baseURL;
  process.env.UI_TEST_RUN_ID = runId;
  process.env.UI_TEST_REPORT_DIR = reportDir;

  log(`run id: ${runId}`);
  log(`starting local web service: ${metadata.startCommand}`);
  serverProcess = spawn(start.command, start.args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: start.host,
      PORT: String(start.port)
    },
    shell: false,
    windowsHide: true
  });
  pipeProcessLogs(serverProcess, serverStdoutPath, serverStderrPath);

  await waitForHealthy(metadata.baseURL, 30000);
  log(`web service is reachable: ${metadata.baseURL}`);

  const testResult = await runPlaywright();
  metadata.playwrightExitCode = testResult.exitCode;
  metadata.playwrightError = testResult.error || null;
  Object.assign(metadata, await collectPlaywrightSummary());
  await collectConsoleNetworkSummary();
  metadata.status = testResult.exitCode === 0 && metadata.failed === 0 ? "PASS" : "FAIL";
  metadata.finishedAt = new Date().toISOString();
  writeMarkdownReport(metadata);
  log(`report: ${reportPath}`);
  await stopServer();
  process.exitCode = testResult.exitCode;
} catch (error) {
  metadata.startupError = serializeError(error);
  metadata.status = "FAIL";
  metadata.finishedAt = new Date().toISOString();
  await collectConsoleNetworkSummary().catch(() => {});
  writeMarkdownReport(metadata);
  log(`report: ${reportPath}`);
  await stopServer();
  process.exitCode = 1;
}

async function resolveStartCommand() {
  const explicitCommand = process.env.UI_TEST_START_COMMAND;
  const explicitPort = Number(process.env.UI_TEST_PORT || process.env.PORT || 0);
  const host = process.env.UI_TEST_HOST || "127.0.0.1";
  const port = Number.isFinite(explicitPort) && explicitPort > 0 ? explicitPort : await findFreePort([8765, 5173, 3000, 4173]);

  if (explicitCommand) {
    return shellCommand(explicitCommand, host, port);
  }

  const pkgPath = join(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const scripts = pkg.scripts || {};
    for (const scriptName of ["dev", "start", "preview"]) {
      if (scripts[scriptName]) {
        return {
          command: metadata.packageManager.command,
          args: metadata.packageManager.runArgs(scriptName),
          host,
          port
        };
      }
    }
  }

  const python = process.env.PYTHON || "python";
  return {
    command: python,
    args: ["analysis_web/server.py", "--host", host, "--port", String(port)],
    host,
    port
  };
}

function shellCommand(commandText, host, port) {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", commandText],
      host,
      port
    };
  }
  return {
    command: "sh",
    args: ["-lc", commandText],
    host,
    port
  };
}

async function runPlaywright() {
  const localPlaywrightCli = join(repoRoot, "node_modules", "@playwright", "test", "cli.js");
  const command = existsSync(localPlaywrightCli) ? process.execPath : metadata.packageManager.execCommand;
  const args = existsSync(localPlaywrightCli)
    ? [localPlaywrightCli, "test"]
    : metadata.packageManager.execArgs("playwright", ["test"]);
  log(`running Playwright: ${commandToString(command, args)}`);
  return runCommand(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdoutPath: join(logDir, "playwright.stdout.log"),
    stderrPath: join(logDir, "playwright.stderr.log")
  });
}

function detectPackageManager() {
  if (existsSync(join(repoRoot, "pnpm-lock.yaml"))) {
    return {
      name: "pnpm",
      command: bin("pnpm"),
      runArgs: (script) => ["run", script],
      execCommand: bin("pnpm"),
      execArgs: (binary, args) => ["exec", binary, ...args]
    };
  }
  if (existsSync(join(repoRoot, "yarn.lock"))) {
    return {
      name: "yarn",
      command: bin("yarn"),
      runArgs: (script) => [script],
      execCommand: bin("yarn"),
      execArgs: (binary, args) => [binary, ...args]
    };
  }
  if (existsSync(join(repoRoot, "bun.lockb")) || existsSync(join(repoRoot, "bun.lock"))) {
    return {
      name: "bun",
      command: bin("bun"),
      runArgs: (script) => ["run", script],
      execCommand: bin("bunx"),
      execArgs: (binary, args) => [binary, ...args]
    };
  }
  return {
    name: "npm",
    command: bin("npm"),
    runArgs: (script) => ["run", script],
    execCommand: bin("npx"),
    execArgs: (binary, args) => [binary, ...args]
  };
}

function bin(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

async function collectPlaywrightSummary() {
  const jsonPath = join(reportDir, "playwright-results.json");
  if (!existsSync(jsonPath)) {
    return { total: 0, passed: 0, failed: 0, skipped: 0 };
  }
  const payload = JSON.parse(readFileSync(jsonPath, "utf8"));
  const summary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    failedTests: [],
    fromStats: Boolean(payload.stats)
  };
  if (payload.stats) {
    summary.passed = Number(payload.stats.expected || 0);
    summary.failed = Number(payload.stats.unexpected || 0);
    summary.skipped = Number(payload.stats.skipped || 0);
    summary.total = summary.passed + summary.failed + summary.skipped + Number(payload.stats.flaky || 0);
  }
  for (const suite of payload.suites || []) {
    walkSuite(suite, summary);
  }
  if (payload.stats) {
    summary.total = summary.passed + summary.failed + summary.skipped + Number(payload.stats.flaky || 0);
  }
  delete summary.fromStats;
  return summary;
}

function walkSuite(suite, summary) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      if (!summary.fromStats) {
        summary.total += 1;
        if (test.outcome === "skipped" || test.status === "skipped") {
          summary.skipped += 1;
        } else if (test.outcome === "expected" || test.status === "expected") {
          summary.passed += 1;
        } else {
          summary.failed += 1;
        }
      }
      for (const result of test.results || []) {
        if (result.status !== "failed" && result.status !== "timedOut" && test.status !== "unexpected") {
          continue;
        }
        summary.failedTests.push({
          title: spec.title,
          project: test.projectName || test.projectId || "",
          file: spec.file,
          message: stripAnsi(result.error?.message || result.errors?.[0]?.message || ""),
          location: result.errorLocation || result.error?.location || null
        });
      }
    }
  }
  for (const child of suite.suites || []) {
    walkSuite(child, summary);
  }
}

async function collectConsoleNetworkSummary() {
  const records = [];
  const resultRoot = join(reportDir, "test-results");
  if (!existsSync(resultRoot)) {
    records.push(...collectEmbeddedJsonAttachments());
    writeFileSync(consoleNetworkPath, JSON.stringify(records, null, 2));
    return records;
  }
  const files = listFiles(resultRoot).filter((file) => file.endsWith(".json"));
  for (const file of files) {
    try {
      const payload = JSON.parse(readFileSync(file, "utf8"));
      if (payload.consoleErrors || payload.networkFailures) {
        records.push({
          path: toRelative(file),
          ...payload
        });
      } else if (payload.issue || payload.priority) {
        metadata.findings.push({
          path: toRelative(file),
          ...payload
        });
      }
    } catch {
      // Ignore non-JSON attachments from Playwright internals.
    }
  }
  records.push(...collectEmbeddedJsonAttachments());
  writeFileSync(consoleNetworkPath, JSON.stringify(records, null, 2));
  return records;
}

function collectEmbeddedJsonAttachments() {
  const jsonPath = join(reportDir, "playwright-results.json");
  if (!existsSync(jsonPath)) {
    return [];
  }
  const records = [];
  const payload = JSON.parse(readFileSync(jsonPath, "utf8"));
  for (const suite of payload.suites || []) {
    walkEmbeddedSuite(suite, records);
  }
  return records;
}

function walkEmbeddedSuite(suite, records) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      for (const result of test.results || []) {
        for (const attachment of result.attachments || []) {
          if (!attachment.body || attachment.contentType !== "application/json") {
            continue;
          }
          const payload = parseBase64Json(attachment.body);
          if (!payload) {
            continue;
          }
          if (attachment.name === "console-network-observation") {
            records.push({
              path: `${spec.file} / ${test.projectName || test.projectId || ""} / ${spec.title}`,
              ...payload
            });
          }
          if (attachment.name === "ui-finding") {
            metadata.findings.push({
              path: `${spec.file} / ${test.projectName || test.projectId || ""} / ${spec.title}`,
              ...payload
            });
          }
        }
      }
    }
  }
  for (const child of suite.suites || []) {
    walkEmbeddedSuite(child, records);
  }
}

function writeMarkdownReport(data) {
  const consoleNetwork = existsSync(consoleNetworkPath)
    ? JSON.parse(readFileSync(consoleNetworkPath, "utf8"))
    : [];
  const consoleErrors = consoleNetwork.flatMap((item) => item.consoleErrors || []);
  const networkFailures = consoleNetwork.flatMap((item) => item.networkFailures || []);
  const artifacts = listExistingArtifacts(reportDir).map(toRelative);
  const p0 = [];
  const p1 = [];
  const p2 = [];

  if (data.startupError) {
    p0.push({
      page: data.baseURL || "(startup)",
      issue: "应用无法启动或健康检查失败",
      actual: data.startupError.message || String(data.startupError),
      expected: "本地 Web 服务应在健康检查窗口内返回 2xx/3xx",
      suggestion: "检查启动命令、端口占用、Python/Node 运行时和服务日志。"
    });
  }
  if (data.failed > 0 && !data.startupError) {
    p1.push({
      page: data.baseURL,
      issue: "存在失败的 UI 自动化用例",
      actual: `${data.failed} failed tests`,
      expected: "核心 UI smoke/regression 用例通过",
      suggestion: "打开 HTML report、trace 和截图定位具体页面回归。"
    });
  }
  for (const failedTest of data.failedTests || []) {
    if (!failedTest.message) {
      continue;
    }
    p1.push({
      page: data.baseURL,
      issue: `失败用例：${failedTest.project ? `${failedTest.project} ` : ""}${failedTest.title}`,
      expected: "用例应通过并保持核心 UI 可用",
      actual: firstLine(failedTest.message),
      suggestion: `${failedTest.file}${failedTest.location?.line ? `:${failedTest.location.line}` : ""}`
    });
  }
  if (!data.startupError && data.playwrightExitCode !== 0 && data.total === 0) {
    p0.push({
      page: data.baseURL,
      issue: "Playwright 测试进程未成功执行",
      actual: data.playwrightError?.message || `exit code ${data.playwrightExitCode}`,
      expected: "Playwright 应完成用例发现并输出 JSON/HTML report",
      suggestion: "检查本地 Playwright 安装、浏览器 channel、runner 日志和 playwright stderr。"
    });
  }
  for (const finding of data.findings || []) {
    const bucket = finding.priority === "P0" ? p0 : finding.priority === "P1" ? p1 : p2;
    bucket.push({
      page: finding.page || data.baseURL,
      issue: finding.issue || "UI finding",
      expected: finding.expected || "",
      actual: finding.actual || "",
      suggestion: finding.suggestion || ""
    });
  }
  for (const item of networkFailures) {
    if (item.status >= 500) {
      p1.push({
        page: item.pageUrl || data.baseURL,
        issue: `接口返回 ${item.status}`,
        expected: "核心页面请求不应返回 5xx",
        actual: `${item.method} ${item.url}`,
        suggestion: "实现 Agent 检查对应本地 API 或静态资源路径。"
      });
    } else if (item.status >= 400 || item.failure) {
      p2.push({
        page: item.pageUrl || data.baseURL,
        issue: item.status ? `请求返回 ${item.status}` : "请求失败",
        expected: "核心页面请求不应失败",
        actual: `${item.method} ${item.url} ${item.failure || ""}`,
        suggestion: "确认资源路径、路由和本地数据是否存在。"
      });
    }
  }
  for (const item of consoleErrors) {
    p1.push({
      page: item.pageUrl || data.baseURL,
      issue: "Console/runtime error",
      expected: "页面运行时不应抛出 error",
      actual: item.text,
      suggestion: "实现 Agent 根据错误栈和复现路径定位前端异常。"
    });
  }

  const markdown = [
    "# UI 自动测试报告",
    "",
    "## 基本信息",
    "",
    `- Run ID: ${data.runId}`,
    `- 时间: ${data.startedAt} - ${data.finishedAt || ""}`,
    `- Git branch: ${data.gitBranch || "unavailable"}`,
    `- Git commit: ${data.gitCommit || "unavailable"}`,
    `- 启动命令: ${data.startCommand || "unavailable"}`,
    `- Base URL: ${data.baseURL || "unavailable"}`,
    `- 测试周期: ${data.testCycle || "once"}`,
    `- 测试环境: ${data.environment || "local sandbox/workspace"}`,
    "",
    "## 总结",
    "",
    `- 总用例数: ${data.total}`,
    `- 通过: ${data.passed}`,
    `- 失败: ${data.failed}`,
    `- 跳过: ${data.skipped}`,
    `- 状态: ${data.status}`,
    "",
    "## P0 阻塞问题",
    "",
    formatIssues(p0),
    "",
    "## P1 严重问题",
    "",
    formatIssues(p1),
    "",
    "## P2 普通问题",
    "",
    formatIssues(p2),
    "",
    "## Console Errors",
    "",
    formatConsoleErrors(consoleErrors),
    "",
    "## Network Failures",
    "",
    formatNetworkFailures(networkFailures),
    "",
    "## 截图和 Trace",
    "",
    artifacts.length ? artifacts.map((item) => `- ${item}`).join("\n") : "- 未发现截图、trace 或 HTML report 产物。",
    "",
    "## 给实现 Agent 的修复建议",
    "",
    formatSuggestions([...p0, ...p1, ...p2]),
    ""
  ].join("\n");
  writeFileSync(reportPath, markdown, "utf8");
}

function formatIssues(items) {
  if (!items.length) {
    return "- 暂无。";
  }
  return items.map((item, index) => [
    `${index + 1}. ${item.issue}`,
    `   - 页面: ${item.page || ""}`,
    `   - 预期: ${item.expected || ""}`,
    `   - 实际: ${item.actual || ""}`,
    `   - 建议: ${item.suggestion || ""}`
  ].join("\n")).join("\n");
}

function formatConsoleErrors(items) {
  if (!items.length) {
    return "- 暂无。";
  }
  return items.map((item) => [
    `- 页面 URL: ${item.pageUrl || ""}`,
    `  - 错误信息: ${item.text}`,
    `  - 复现路径: 打开 ${item.pageUrl || metadata.baseURL}`,
    `  - 截图/trace 路径: 见本报告“截图和 Trace”章节`
  ].join("\n")).join("\n");
}

function formatNetworkFailures(items) {
  if (!items.length) {
    return "- 暂无。";
  }
  return items.map((item) => [
    `- URL: ${item.url}`,
    `  - Method: ${item.method}`,
    `  - Status: ${item.status || item.failure || "failed"}`,
    `  - 页面: ${item.pageUrl || ""}`,
    `  - 影响: 可能导致页面数据、资源或交互不可用`
  ].join("\n")).join("\n");
}

function formatSuggestions(items) {
  if (!items.length) {
    return "- 当前未发现需要实现 Agent 修复的问题。";
  }
  return items.map((item, index) => [
    `${index + 1}. ${item.issue}`,
    `   - 相关页面: ${item.page || ""}`,
    `   - 复现步骤: 运行 \`npm run ui:test:once\`，打开报告和 trace，访问 ${item.page || metadata.baseURL}`,
    `   - 预期结果: ${item.expected || ""}`,
    `   - 实际结果: ${item.actual || ""}`,
    `   - 可能原因: ${item.suggestion || "需结合 trace、console 和 network 日志确认。"}`,
    `   - 优先级: ${priorityForIssue(item.issue)}`
  ].join("\n")).join("\n");
}

function priorityForIssue(issue) {
  if (/无法启动|白屏|不可访问/.test(issue)) {
    return "P0";
  }
  if (/失败|Console|runtime|5xx|接口|核心/.test(issue)) {
    return "P1";
  }
  return "P2";
}

function pipeProcessLogs(child, stdoutPath, stderrPath) {
  const stdout = createWriteStream(stdoutPath, { flags: "a" });
  const stderr = createWriteStream(stderrPath, { flags: "a" });
  child.stdout?.pipe(stdout);
  child.stderr?.pipe(stderr);
  child.on("exit", (code, signal) => {
    log(`web service exited with code=${code} signal=${signal || ""}`);
  });
}

async function stopServer() {
  if (!serverProcess || serverStopped) {
    return;
  }
  serverStopped = true;
  log("stopping local web service");
  const exited = waitForExit(serverProcess, 5000);
  serverProcess.kill("SIGTERM");
  const didExit = await exited;
  if (!didExit) {
    serverProcess.kill("SIGKILL");
    await waitForExit(serverProcess, 2000);
  }
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolveExit) => {
    if (child.exitCode !== null) {
      resolveExit(true);
      return;
    }
    const timer = setTimeout(() => resolveExit(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit(true);
    });
  });
}

async function waitForHealthy(baseURL, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null) {
      throw new Error(`web service exited early with code ${serverProcess.exitCode}`);
    }
    try {
      const response = await fetch(baseURL, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw lastError || new Error("health check timed out");
}

function runCommand(command, args, options) {
  return new Promise((resolveCommand) => {
    const stdout = createWriteStream(options.stdoutPath, { flags: "a" });
    const stderr = createWriteStream(options.stderrPath, { flags: "a" });
    const spawnSpec = commandSpawnSpec(command, args);
    let child;
    try {
      child = spawn(spawnSpec.command, spawnSpec.args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true
      });
    } catch (error) {
      stderr.write(`${error.stack || error.message}\n`);
      resolveCommand({ exitCode: 1, error: serializeError(error) });
      return;
    }
    child.stdout?.pipe(stdout);
    child.stderr?.pipe(stderr);
    child.on("error", (error) => {
      stderr.write(`${error.stack || error.message}\n`);
      resolveCommand({ exitCode: 1, error: serializeError(error) });
    });
    child.on("exit", (code) => {
      resolveCommand({ exitCode: code ?? 1 });
    });
  });
}

function commandSpawnSpec(command, args) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return {
      command: "cmd.exe",
      args: ["/d", "/c", [command, ...args].join(" ")]
    };
  }
  return { command, args };
}

function safeExec(command, args) {
  try {
    const result = spawnSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status !== 0) {
      return "";
    }
    return result.stdout.trim();
  } catch {
    return "";
  }
}

async function findFreePort(candidates) {
  for (const port of candidates) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  const server = await import("node:net").then((net) => net.createServer());
  return new Promise((resolvePort, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolvePort(address.port);
        } else {
          reject(new Error("failed to allocate free port"));
        }
      });
    });
    server.on("error", reject);
  });
}

async function isPortFree(port) {
  const net = await import("node:net");
  return new Promise((resolveFree) => {
    const server = net.createServer();
    server.once("error", () => resolveFree(false));
    server.once("listening", () => {
      server.close(() => resolveFree(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function listFiles(root) {
  const output = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      output.push(...listFiles(full));
    } else {
      output.push(full);
    }
  }
  return output;
}

function listExistingArtifacts(root) {
  if (!existsSync(root)) {
    return [];
  }
  return listFiles(root).filter((file) => {
    return /\.(png|webm|zip|html|json|log)$/i.test(file) && !file.endsWith("playwright-results.json");
  });
}

function commandToString(command, args) {
  return [command, ...args].map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(" ");
}

function serializeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    stack: error?.stack || ""
  };
}

function parseBase64Json(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/g, "");
}

function firstLine(value) {
  return String(value).split(/\r?\n/).find((line) => line.trim()) || "";
}

function toRelative(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function timestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ];
  return `${parts[0]}${parts[1]}${parts[2]}${parts[3]}${parts[4]}${parts[5]}${parts[6]}`;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  mkdirSync(dirname(runnerLogPath), { recursive: true });
  writeFileSync(runnerLogPath, `${line}\n`, { flag: "a" });
}
