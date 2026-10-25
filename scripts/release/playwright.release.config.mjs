import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "../../app/builds/typescript/client_web/node_modules/@playwright/test/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const external = process.env.RELEASE_BASE_URL;
const webPort = Number(process.env.RELEASE_WEB_PORT ?? 5091);
const mode = process.env.RELEASE_MODE ?? "fake";
const resume = process.env.RELEASE_RESUME === "1";
if (!["fake", "live"].includes(mode)) throw new Error("RELEASE_MODE must be fake or live");

// Separate from the upstream runner: never starts its dev/MCP runtime or uses 5073.
export default defineConfig({
  testDir: path.join(root, "app/builds/typescript/client_web/e2e"),
  testMatch: resume ? "release-resume.spec.ts" : "release-acceptance.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: process.env.RELEASE_OUTPUT_DIR ?? `/private/tmp/ryadom-release-browser-results-${mode}`,
  reporter: [["list"], ["json", { outputFile: process.env.RELEASE_RESULT_FILE ?? `/private/tmp/ryadom-release-browser-${mode}${resume ? "-resume" : ""}.json` }]],
  metadata: { providerMode: mode, candidateSha: process.env.RELEASE_CANDIDATE_SHA ?? "not supplied", runtime: external ? "external operator runtime" : "isolated source runtime, no MCP" },
  use: {
    baseURL: external ?? `http://127.0.0.1:${webPort}`,
    channel: process.env.RELEASE_BROWSER_CHANNEL ?? "chrome",
    viewport: { width: 1440, height: 1000 },
    // Auth tokens/provider configuration must never be saved into traces/HAR/video.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: external ? undefined : {
    command: `"${process.execPath}" "${path.join(root, "scripts/release/browser-runtime.mjs")}"`,
    url: `http://127.0.0.1:${webPort}/api/auth/bootstrap-status`,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
