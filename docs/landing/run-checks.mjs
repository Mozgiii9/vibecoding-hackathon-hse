import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { checkLanding } from "./check-browser.mjs";
import { checkConfig } from "./check-config.mjs";

// Reuse an installed Playwright module; no landing dependency installation.
const moduleUrl = process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
  : "playwright";
const { chromium } = await import(moduleUrl);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const options = {
    baseUrl: process.env.LANDING_BASE_URL || "http://127.0.0.1:4178/",
    outputDir: process.env.LANDING_EVIDENCE_DIR || "docs/landing/evidence",
  };
  const report = await checkLanding(page, options);
  await page.close();
  const config = await checkConfig(browser, options);
  console.log(JSON.stringify({ ...report, config }, null, 2));
} finally {
  await browser.close();
}
