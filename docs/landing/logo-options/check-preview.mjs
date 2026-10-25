import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Validate the concept page using an existing headless browser installation.
const directory = dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.PLAYWRIGHT_MODULE;
assert(modulePath, "Set PLAYWRIGHT_MODULE to an existing Playwright index.mjs");
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const files = ["01-sputnik.svg", "02-nit.svg", "03-monogram.svg"];
const html = await readFile(join(directory, "index.html"), "utf8");
for (const filename of files) {
  const svg = await readFile(join(directory, filename), "utf8");
  assert(svg.includes('viewBox="0 0 256 256"'), `${filename}: viewBox`);
  assert(!/<(?:image|text|script|filter|mask|clipPath)\b|data:|https?:\/\/(?!www.w3.org)/i.test(svg), `${filename}: vector-only structure`);
  const geometry = svg.match(/<(?:path|circle)\b[^>]*\/>/g);
  assert.equal(geometry?.length, 2, `${filename}: two filled shapes`);
  for (const shape of geometry) assert(html.includes(shape), `${filename}: preview matches source geometry`);
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(join(directory, "index.html")).href);
  await page.screenshot({ path: join(directory, "comparison.png"), fullPage: true });
  const layouts = [];
  for (const width of [320, 390, 900, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert(dimensions.document <= dimensions.viewport, `Overflow at ${width}`);
    layouts.push(dimensions);
  }
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 1200, height: 430 });
  await page.setContent(`<body style="margin:0;background:#f4eadf;display:flex;align-items:center;justify-content:space-evenly;height:430px">${await Promise.all(files.map(async (filename) => `<div style="display:grid;justify-items:center;gap:32px;font:16px system-ui;color:#24211f">${(await readFile(join(directory, filename), "utf8")).replace('<svg ', '<svg width="224" height="224" ')}<span>${filename.startsWith("01") ? "A · Спутник" : filename.startsWith("02") ? "B · Нить шагов" : "C · Р."}</span></div>`)).then((items) => items.join(""))}</body>`);
  await page.screenshot({ path: join(directory, "concepts-monochrome.png") });
  await writeFile(join(directory, "check-report.json"), `${JSON.stringify({ checkedAt: new Date().toISOString(), browser: "headless Chrome", svgStructure: "PASS: 3 SVGs, real paths/circles, no raster/live text/effects", sourcePreviewGeometry: "PASS", layouts, errors }, null, 2)}\n`);
} finally {
  await browser.close();
}
