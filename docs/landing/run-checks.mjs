import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { checkLanding } from "./check-browser.mjs";

// Reuse an installed Playwright module; no landing dependency installation.
const moduleUrl = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright";
const { chromium } = await import(moduleUrl);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const report = await checkLanding(page, {
    baseUrl: process.env.LANDING_BASE_URL || "http://127.0.0.1:4178/",
    outputDir: process.env.LANDING_EVIDENCE_DIR || "docs/landing/evidence",
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
