import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Exercise the public page through an already running headless Playwright page. */
export async function checkLanding(page, { baseUrl, outputDir }) {
  await mkdir(outputDir, { recursive: true });
  const errors = [];
  const failedResources = [];
  const externalRequests = [];
  const origin = new URL(baseUrl).origin;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      failedResources.push({ url: response.url(), status: response.status() });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== origin)
      externalRequests.push(request.url());
  });
  const widths = [320, 390, 760, 1024, 1440, 1920];
  const layout = [];
  const flow = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(baseUrl);
    const size = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert(
      size.document <= size.viewport,
      `Horizontal overflow at ${width}: ${JSON.stringify(size)}`,
    );
    layout.push(size);
  }
  assert.equal(await page.locator("h1").count(), 1);
  assert.equal(await page.locator("[data-app-cta]").count(), 2);
  assert.equal(
    await page.locator("a.app-cta").count(),
    0,
    "Unconfigured MVP must not have an active CTA",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(baseUrl);
  await page.keyboard.press("Tab");
  assert.equal(
    await page.locator(":focus").textContent(),
    "Перейти к содержанию",
  );
  const focus = await page
    .locator(":focus")
    .evaluate((element) => ({
      outline: getComputedStyle(element).outlineStyle,
      width: getComputedStyle(element).outlineWidth,
      top: element.getBoundingClientRect().top,
    }));
  assert.notEqual(focus.outline, "none");
  assert(focus.top >= 0, "Skip link must be visible on focus");
  await page.keyboard.press("Enter");
  assert.equal(new URL(page.url()).hash, "#main");
  await page.getByRole("link", { name: "Посмотреть сценарий" }).click();
  assert.equal(new URL(page.url()).hash, "#how-it-works");
  await page.locator("#demo-next").focus();
  async function record(expected) {
    const count = await page.locator("#criterion-count").innerText();
    const aria = await page
      .locator("#criterion-progress")
      .getAttribute("aria-valuenow");
    assert.equal(count, `${expected} из 3`);
    assert.equal(aria, String(expected));
    flow.push({
      step: await page.locator("#step-label").innerText(),
      count,
      focused: await page.locator(":focus").getAttribute("id"),
    });
  }
  await record(0);
  await page.keyboard.press("Enter");
  await record(0);
  await page.keyboard.press("Enter");
  await record(1);
  await page.keyboard.press("Enter");
  await record(1);
  assert.equal(await page.locator(":focus").getAttribute("id"), "demo-reject");
  await page.keyboard.press("Space");
  await record(0);
  assert.equal(await page.locator(":focus").getAttribute("id"), "demo-reset");
  await page.keyboard.press("Enter");
  await record(0);
  assert.equal(await page.locator(":focus").getAttribute("id"), "demo-next");
  await page.locator("summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("details").getAttribute("open"), "");
  await page.keyboard.press("Enter");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
    "auto",
  );
  assert.equal(
    await page
      .locator(".progress-track span")
      .evaluate((element) => getComputedStyle(element).transitionDuration),
    "0s",
  );
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.goto(baseUrl);
  await page.locator(".vision-art img").scrollIntoViewIfNeeded();
  await page.locator(".vision-art img").evaluate((image) => image.decode());
  await page.locator(".product-figure img").scrollIntoViewIfNeeded();
  await page.locator(".product-figure img").evaluate(async (image) => {
    await image.decode();
    if (image.naturalWidth !== 1440 || image.naturalHeight !== 1100) throw new Error("Unexpected verified product screenshot");
  });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: join(outputDir, "desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(outputDir, "mobile-fold.png") });
  // Some installed Chrome builds repeat viewport tiles in a narrow full-page
  // capture. A tall viewport avoids that compositor artifact without CSS edits.
  const mobileHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  await page.setViewportSize({ width: 390, height: mobileHeight });
  await page.screenshot({ path: join(outputDir, "mobile.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#demo-next").click();
  await page.locator("#demo-next").click();
  await page.locator("#demo-next").click();
  await page.locator("#demo-reject").click();
  assert.equal(await page.locator("#criterion-count").innerText(), "0 из 3");
  const imageResponse = await page.request.get(
    new URL("assets/og-image.png", baseUrl).href,
  );
  assert.equal(imageResponse.status(), 200);
  assert.equal(imageResponse.headers()["content-type"], "image/png");
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResources, []);
  assert.deepEqual(externalRequests, []);
  const report = {
    checkedAt: new Date().toISOString(),
    baseUrl,
    browser: "headless Chrome",
    widths: layout,
    keyboardFocus: focus,
    flow,
    mobileFlow: "0 → 0 → 1 → 1 → 0 PASS",
    reducedMotion: "PASS",
    anchors: "PASS",
    errors,
    failedResources,
    externalRequests,
  };
  await writeFile(
    join(outputDir, "browser-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}
