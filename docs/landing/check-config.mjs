import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Check CTA configuration boundaries without following any external link. */
export async function checkConfig(browser, { baseUrl, outputDir }) {
  const page = await browser.newPage();
  let appUrl = "";
  await page.route("**/config.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.RYADOM_CONFIG = { appUrl: ${JSON.stringify(appUrl)} };`,
    }),
  );
  const rejected = [
    "",
    "not-a-url",
    "javascript:alert(1)",
    "ftp://example.org/",
    "https://localhost/",
    "https://localhost./",
    "https://127.1/",
    "https://10.1.2.3/",
    "https://192.168.1.1/",
    "https://172.16.0.1/",
    "https://[::1]/",
    "https://[::ffff:7f00:1]/",
    "https://[::ffff:c0a8:101]/",
    "https://machine.internal/",
    "https://user:password@example.org/",
    "https://example.org/?token=synthetic",
    "https://example.org/#synthetic",
  ];
  for (const value of rejected) {
    appUrl = value;
    await page.goto(baseUrl);
    assert.equal(
      await page.locator("a.app-cta").count(),
      0,
      `Unsafe/unsupported URL activated CTA: ${value}`,
    );
    assert.equal(await page.locator("[data-app-cta]").count(), 2);
  }
  for (const valid of ["https://example.org/demo", "http://77.239.111.64/demo"]) {
    appUrl = valid;
    await page.goto(baseUrl);
    assert.equal(await page.locator("a.app-cta").count(), 2);
    assert.deepEqual(
      await page.locator("a.app-cta").evaluateAll((links) => links.map((link) => link.href)),
      [appUrl, appUrl],
    );
  }
  await page.close();
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  try {
    const fallback = await noScript.newPage();
    await fallback.goto(baseUrl);
    assert.equal(await fallback.locator("[data-app-cta]").count(), 2);
    assert.equal(await fallback.locator(".no-script").isVisible(), true);
    assert.equal(await fallback.locator("#demo-controls").isVisible(), false);
  } finally {
    await noScript.close();
  }
  const report = {
    checkedAt: new Date().toISOString(),
    rejectedCases: rejected.length,
    validPublicProtocols: ["https:", "http:"],
    ctasPerValidUrl: 2,
    externalNavigation: false,
    noJavaScriptFallback: "PASS",
  };
  await writeFile(
    join(outputDir, "config-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}
