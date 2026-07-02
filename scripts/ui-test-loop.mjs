import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const intervalSeconds = Number.parseInt(process.env.UI_TEST_INTERVAL_SECONDS || "600", 10);
let stopping = false;
let currentChild = null;
let cycle = 0;

process.on("SIGINT", () => {
  stopping = true;
  console.log("[ui-test-loop] received Ctrl+C; stopping after current cleanup");
  if (currentChild) {
    currentChild.kill("SIGTERM");
  }
});

process.on("SIGTERM", () => {
  stopping = true;
  console.log("[ui-test-loop] received SIGTERM; stopping after current cleanup");
  if (currentChild) {
    currentChild.kill("SIGTERM");
  }
});

while (!stopping) {
  cycle += 1;
  const runId = timestamp();
  const reportDir = `.ui-test-reports/${runId}`;
  console.log(`[ui-test-loop] starting cycle ${cycle}, report dir: ${reportDir}`);

  const exitCode = await runOnce(runId, cycle);
  console.log(`[ui-test-loop] cycle ${cycle} finished with exit code ${exitCode}; report: ${reportDir}/report.md`);

  if (stopping) {
    break;
  }
  await sleepWithStop(intervalSeconds * 1000);
}

console.log("[ui-test-loop] stopped");

function runOnce(runId, cycleNumber) {
  return new Promise((resolveRun) => {
    currentChild = spawn(process.execPath, ["scripts/ui-test-once.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        UI_TEST_RUN_ID: runId,
        UI_TEST_LOOP_CYCLE: String(cycleNumber)
      },
      windowsHide: true,
      shell: false,
      stdio: "inherit"
    });
    currentChild.on("error", (error) => {
      console.error(`[ui-test-loop] failed to start once runner: ${error.message}`);
      currentChild = null;
      resolveRun(1);
    });
    currentChild.on("exit", (code) => {
      currentChild = null;
      resolveRun(code ?? 1);
    });
  });
}

async function sleepWithStop(ms) {
  const deadline = Date.now() + ms;
  while (!stopping && Date.now() < deadline) {
    const remaining = deadline - Date.now();
    await new Promise((resolveSleep) => setTimeout(resolveSleep, Math.min(remaining, 1000)));
  }
}

function timestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
}
