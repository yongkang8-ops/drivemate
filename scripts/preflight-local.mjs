import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const baseUrl = "http://127.0.0.1:3100";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const localDemoEnv = {
  DRIVEMATE_REPOSITORY: "memory",
  DRIVEMATE_ENABLE_DEMO_AUTH: "true",
  NEXT_PUBLIC_SHOW_INTERNAL_NAV: "true",
};

const sensitiveTerms = [
  "conservative",
  "scenario",
  "rebate",
  "price plus",
  "Southport",
  "Net 30",
  "credit limit",
  "Available credit",
  "Open balance",
  "Current rebate",
  "gross margin",
];

const publicScanFiles = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/globals.css",
  "app/catalogue/page.tsx",
  "app/open-account/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/trade-terms/page.tsx",
  "app/delivery-returns-warranty/page.tsx",
  "components/CatalogueBrowser.tsx",
  "components/TradeAccountApplicationForm.tsx",
  "components/LegalDocument.tsx",
];

function logStep(name) {
  console.log(`\n== ${name} ==`);
}

function quoteWindowsArg(value) {
  if (/^[A-Za-z0-9_./:\\=-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function createSpawnInput(command, args) {
  if (process.platform !== "win32") {
    return { command, args };
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArg).join(" ")],
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const input = createSpawnInput(command, args);
    const child = spawn(input.command, input.args, {
      cwd: process.cwd(),
      env: { ...process.env, ...(options.env ?? {}) },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function healthOk() {
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    return response.status === 200;
  } catch {
    return false;
  }
}

async function waitForHealth(timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await healthOk()) return;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`local server did not become ready at ${baseUrl}`);
}

async function withLocalServer(callback) {
  if (await healthOk()) {
    console.log(`Using existing local server at ${baseUrl}`);
    await callback();
    return;
  }

  console.log(`Starting local server at ${baseUrl}`);
  const serverInput = createSpawnInput(npmCommand, [
    "run",
    "dev",
    "--",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ]);
  const server = spawn(serverInput.command, serverInput.args, {
    cwd: process.cwd(),
    env: { ...process.env, ...localDemoEnv },
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });

  let serverExited = false;
  server.on("exit", () => {
    serverExited = true;
  });

  try {
    await waitForHealth();
    if (serverExited)
      throw new Error("local server exited before smoke checks could run");
    await callback();
  } finally {
    if (!serverExited) {
      if (process.platform === "win32" && server.pid) {
        spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        server.kill();
      }
    }
  }
}

async function runSensitiveScan() {
  const findings = [];
  for (const filePath of publicScanFiles) {
    const content = await readFile(filePath, "utf8");
    const lowerContent = content.toLowerCase();
    for (const term of sensitiveTerms) {
      if (lowerContent.includes(term.toLowerCase())) {
        findings.push(`${filePath}: ${term}`);
      }
    }
  }

  if (findings.length) {
    console.error("Sensitive public-code terms found:");
    for (const finding of findings) console.error(`- ${finding}`);
    throw new Error("sensitive term scan failed");
  }

  console.log("PASS sensitive public-code scan");
}

async function resetDemoData() {
  const response = await fetch(`${baseUrl}/api/test/reset`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`local demo reset failed with status ${response.status}`);
  }
  console.log("PASS local demo data reset");
}

async function main() {
  logStep("Script syntax checks");
  await run("node", ["--check", "scripts/verify-supabase-setup.mjs"]);
  await run("node", ["--check", "scripts/verify-staging-app.mjs"]);
  await run("node", ["--check", "scripts/verify-release-readiness.mjs"]);

  logStep("Typecheck");
  await run(npmCommand, ["run", "typecheck"]);

  logStep("Unit tests");
  await run(npmCommand, ["test"]);

  logStep("Production build");
  await run(npmCommand, ["run", "build"]);

  logStep("Browser tests");
  await run(npxCommand, ["playwright", "test"], { env: localDemoEnv });

  logStep("Sensitive public-code scan");
  await runSensitiveScan();

  logStep("Local staging smoke");
  await withLocalServer(async () => {
    await run(npmCommand, ["run", "verify:staging"], {
      env: {
        DRIVEMATE_BASE_URL: baseUrl,
        DRIVEMATE_SMOKE_USE_DEMO_HEADERS: "true",
        DRIVEMATE_SMOKE_E2E_CHECK: "true",
        DRIVEMATE_SMOKE_TRADE_TOKEN: "",
        DRIVEMATE_SMOKE_WAREHOUSE_TOKEN: "",
        DRIVEMATE_SMOKE_ADMIN_TOKEN: "",
        ...localDemoEnv,
      },
    });
    await resetDemoData();
  });

  console.log("\nPASS local preflight completed");
}

main().catch((error) => {
  console.error(`\nFAIL ${error.message}`);
  process.exitCode = 1;
});
