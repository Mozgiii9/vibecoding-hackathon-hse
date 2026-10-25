import assert from "node:assert/strict";

/** Verify the isolated synthetic hero cases using an existing headless page. */
export async function checkSlideshow(page, { baseUrl }) {
  const errors = [];
  const recordError = (error) => errors.push(error.message);
  page.on("pageerror", recordError);
  const expected = [
    ["Попасть на ML-стажировку", "Сегодня отправил резюме", "/ 3"],
    ["Заработать 300 000 ₽", "Получил оплату 100 000 ₽", "/ 3"],
    ["Добиться повышения на работе", "Обсудил рост с руководителем", "/ 1"],
  ];
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  try {
    await page.goto(baseUrl);
    const scene = page.locator(".hero-scene");
    const pause = page.locator("#case-pause");
    const choices = page.locator(".case-choice");
    await scene.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.locator("h1").click();
    assert.equal(await choices.count(), 3);
    assert(await pause.isVisible());

    async function checkCase(index) {
      const [goal, quote, target] = expected[index];
      assert.equal(await page.locator("#case-goal").textContent(), goal);
      assert.equal(await page.locator("#case-quote").textContent(), quote);
      assert.equal(await page.locator("#case-count-target").textContent(), target);
      assert.equal(await page.locator("#case-count-value").textContent(), "1");
      assert.equal(await choices.nth(index).getAttribute("aria-pressed"), "true");
      assert.equal(await scene.locator('[aria-pressed="true"]').count(), 1);
    }

    await checkCase(0);
    assert.equal(await page.locator("#case-live").getAttribute("aria-live"), "off");
    await page.clock.runFor(8100);
    await checkCase(1);
    assert.equal(await page.locator("#case-status").textContent(), "");

    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
    );
    await page.waitForFunction(
      () => document.querySelector(".hero-scene").getBoundingClientRect().bottom <= 0,
    );
    await page.clock.runFor(16000);
    await checkCase(1);
    await scene.scrollIntoViewIfNeeded();

    // Hover and focus suspend cycling without losing the selected case.
    await scene.hover();
    await page.clock.runFor(16000);
    await checkCase(1);
    await choices.nth(0).focus();
    await page.mouse.move(0, 0);
    await page.clock.runFor(16000);
    await checkCase(1);

    // Native button keyboard behavior; manual selection remains selected.
    await choices.nth(2).focus();
    await page.keyboard.press("Enter");
    await checkCase(2);
    assert.match(await page.locator("#case-detail").textContent(), /зависит от работодателя/);
    assert.match(await page.locator("#case-status").textContent(), /Пример 3 из 3/);
    assert.equal(await page.locator("#case-live").getAttribute("aria-live"), "polite");
    await choices.nth(1).focus();
    await page.keyboard.press("Space");
    await checkCase(1);
    assert.match(await page.locator("#case-detail").textContent(), /не банковский учёт/);
    await page.locator("h1").click();
    await page.mouse.move(0, 0);
    await page.clock.runFor(16000);
    await checkCase(1);
    assert.equal(await pause.textContent(), "Запустить слайдшоу");

    await pause.click();
    await page.locator("h1").click();
    await page.mouse.move(0, 0);
    await page.clock.runFor(8100);
    await checkCase(2);
    await pause.click();
    await page.locator("h1").click();
    await page.mouse.move(0, 0);
    await page.clock.runFor(16000);
    await checkCase(2);

    // The independent ML interaction retains its own state and event handlers.
    assert.equal(await page.locator("#criterion-count").textContent(), "0 из 3");
    await page.locator("#demo-next").click();
    await page.locator("#demo-next").click();
    assert.equal(await page.locator("#criterion-count").textContent(), "1 из 3");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(baseUrl);
    await scene.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.locator("h1").click();
    await checkCase(0);
    assert.equal(await pause.textContent(), "Запустить слайдшоу");
    await page.clock.runFor(16000);
    await checkCase(0);
    await pause.click();
    await page.locator("h1").click();
    await page.mouse.move(0, 0);
    await page.clock.runFor(8100);
    await checkCase(1);

    assert.deepEqual(errors, []);
    return {
      cases: "ML / 300 000 ₽ / повышение PASS",
      keyboard: "Native Enter / Space PASS",
      autoplay: "8 seconds; offscreen / hover / focus / manual pause PASS",
      reducedMotion: "Starts paused; explicit opt-in PASS",
      independentDemo: "0 → 0 → 1 PASS",
      errors,
    };
  } finally {
    page.off("pageerror", recordError);
    await page.clock.resume();
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
}
