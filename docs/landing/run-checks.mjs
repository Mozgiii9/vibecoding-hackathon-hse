import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { checkLanding } from "./check-browser.mjs";
import { checkConfig } from "./check-config.mjs";
import { checkSlideshow } from "./check-slideshow.mjs";
import { checkDemoCases } from "./check-demo-cases.mjs";

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
  const slideshowPage = await browser.newPage();
  const slideshow = await checkSlideshow(slideshowPage, options);
  await writeFile(
    `${options.outputDir}/slideshow-report.json`,
    `${JSON.stringify(slideshow, null, 2)}\n`,
  );
  await slideshowPage.close();
  const demoPage = await browser.newPage();
  const demoCases = await checkDemoCases(demoPage, options);
  await writeFile(
    `${options.outputDir}/demo-cases-report.json`,
    `${JSON.stringify(demoCases, null, 2)}\n`,
  );
  await demoPage.close();
  console.log(
    JSON.stringify({ ...report, config, slideshow, demoCases }, null, 2),
  );
} finally {
  await browser.close();
}
