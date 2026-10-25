import assert from "node:assert/strict";

const examples = [
  {
    title: "Получить предложение ML-стажировки",
    targets: [3, 5, 1],
    intention: "Завтра отправлю резюме",
    action: "Сегодня отправил резюме",
    outcome: /Получил предложение ML-стажировки с датой выхода/,
  },
  {
    title: "Заработать 300 000 ₽ на проектах",
    targets: [3, 3, 3],
    intention: "Завтра попрошу оплатить проект",
    action: "Получил оплату 100 000 ₽ за первый проект",
    outcome:
      /Третья оплата 100 000 ₽ получена; вместе с двумя предыдущими — 300 000 ₽/,
  },
  {
    title: "Получить повышение",
    targets: [1, 3, 1],
    intention: "Завтра обсужу рост с руководителем",
    action: "Обсудил с руководителем мой рост и условия повышения",
    outcome: /Повышение оформлено: моя новая роль — ведущий ML-инженер/,
  },
];

/** Verify independent synthetic cases, outcome evidence and keyboard transitions. */
export async function checkDemoCases(page, { baseUrl }) {
  const requests = [];
  const errors = [];
  const onRequest = (request) =>
    requests.push({
      url: request.url(),
      type: request.resourceType(),
    });
  const onError = (error) => errors.push(error.message);
  page.on("request", onRequest);
  page.on("pageerror", onError);

  async function counts(example, values) {
    for (let index = 0; index < 3; index += 1) {
      const suffix = index === 0 ? "" : `-${index}`;
      const target = example.targets[index];
      assert.equal(
        await page.locator(`#criterion-count${suffix}`).innerText(),
        `${values[index]} из ${target}`,
      );
      const progress = page.locator(`#criterion-progress${suffix}`);
      assert.equal(await progress.getAttribute("role"), "progressbar");
      assert.equal(await progress.getAttribute("aria-valuemin"), "0");
      assert.equal(
        await progress.getAttribute("aria-valuemax"),
        String(target),
      );
      assert.equal(
        await progress.getAttribute("aria-valuenow"),
        String(values[index]),
      );
      assert.equal(
        await progress.getAttribute("aria-label"),
        await page.locator(`#criterion-label-${index}`).innerText(),
      );
      const percent = await progress
        .locator("span")
        .evaluate((element) => Number.parseFloat(element.style.width));
      assert(Math.abs(percent - (values[index] / target) * 100) < 0.01);
    }
  }

  async function focusIs(id) {
    assert.equal(await page.locator(":focus").getAttribute("id"), id);
  }

  async function activate(locator) {
    await locator.focus();
    await page.keyboard.press("Enter");
    assert(
      await locator.evaluate((element) => element === document.activeElement),
      "Selector should retain keyboard focus",
    );
  }

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(baseUrl);
    await page.waitForLoadState("networkidle");
    const initialRequests = requests.length;
    const choices = page.locator(".demo-case-choice[data-demo-case]");
    assert.equal(await choices.count(), 3);
    for (const button of [
      ...(await choices.all()),
      page.locator("#demo-view-process"),
      page.locator("#demo-view-complete"),
    ]) {
      assert.equal(
        await button.evaluate((element) => element.tagName),
        "BUTTON",
      );
      assert.equal(await button.getAttribute("type"), "button");
      assert(await button.isEnabled());
    }
    assert.equal(
      await page.locator("#demo-view-process").getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page.locator("#demo-view-complete").getAttribute("aria-pressed"),
      "false",
    );
    const flows = [];
    for (const [index, example] of examples.entries()) {
      const choice = page.locator(
        `.demo-case-choice[data-demo-case="${index}"]`,
      );
      await activate(choice);
      assert.equal(await choice.getAttribute("aria-pressed"), "true");
      assert.equal(
        await choices.filter({ hasText: /^$/ }).count(),
        0,
        "Case selectors need visible names",
      );
      assert.equal(
        await page.locator("#demo-goal-title").innerText(),
        example.title,
      );
      await counts(example, [0, 0, 0]);
      assert.equal(
        await page.locator("#step-label").innerText(),
        "01 / Намерение",
      );
      assert(
        (await page.locator("#demo-quote").innerText()).includes(
          example.intention,
        ),
      );
      assert(await page.locator("#demo-achievements").isHidden());

      await page.locator("#demo-next").focus();
      await page.keyboard.press("Enter");
      await counts(example, [0, 0, 0]);
      assert(
        (await page.locator("#demo-quote").innerText()).includes(
          example.action,
        ),
      );
      await focusIs("demo-next");
      await page.keyboard.press("Enter");
      await counts(example, [1, 0, 0]);
      await focusIs("demo-next");
      assert.notEqual(
        await page.locator("#demo-heading").innerText(),
        "Цель достигнута",
      );
      if (index === 2) {
        assert.match(
          await page.locator("#demo-heading").innerText(),
          /Повышение ещё не подтверждено/,
        );
      }

      // Viewing a completed example must not mutate the in-progress state.
      await activate(page.locator("#demo-view-complete"));
      await counts(example, example.targets);
      await activate(page.locator("#demo-view-process"));
      await counts(example, [1, 0, 0]);
      assert.equal(
        await page.locator("#step-label").innerText(),
        "03 / Подтверждение",
      );
      await page.locator("#demo-next").focus();
      await page.keyboard.press("Enter");
      await counts(example, [1, 0, 0]);
      assert.match(
        await page.locator("#quote-source").innerText(),
        /Та же синтетическая заметка/,
      );
      await focusIs("demo-reject");
      await page.keyboard.press("Space");
      await counts(example, [0, 0, 0]);
      await focusIs("demo-reset");
      await page.keyboard.press("Enter");
      await counts(example, [0, 0, 0]);
      await focusIs("demo-next");

      // Rejection is also possible immediately after confirmation.
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await page.locator("#demo-reject").focus();
      await page.keyboard.press("Enter");
      await counts(example, [0, 0, 0]);
      await page.keyboard.press("Enter");
      await counts(example, [0, 0, 0]);
      flows.push({
        title: example.title,
        flow: "0 → 0 → 1 → 1 → 0",
        directRejection: "PASS",
        reset: "PASS",
      });
    }

    // Changing a case clears its process step, even if the last one had progress.
    await page.locator("#demo-next").click();
    await page.locator("#demo-next").click();
    await activate(page.locator('.demo-case-choice[data-demo-case="0"]'));
    await counts(examples[0], [0, 0, 0]);
    await activate(page.locator('.demo-case-choice[data-demo-case="2"]'));
    await counts(examples[2], [0, 0, 0]);

    await activate(page.locator("#demo-view-complete"));
    const completed = [];
    for (const [index, example] of examples.entries()) {
      await activate(
        page.locator(`.demo-case-choice[data-demo-case="${index}"]`),
      );
      assert.equal(
        await page.locator("#demo-view-complete").getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        await page.locator("#demo-view-process").getAttribute("aria-pressed"),
        "false",
      );
      await counts(example, example.targets);
      assert.equal(
        await page.locator("#demo-heading").innerText(),
        "Цель достигнута",
      );
      assert.match(
        await page.locator("#demo-quote").innerText(),
        example.outcome,
      );
      assert.match(
        await page.locator("#demo-status").innerText(),
        /Синтетический пример/,
      );
      assert(await page.locator("#demo-controls").isHidden());
      assert(await page.locator(".demo-steps").isHidden());
      assert(await page.locator("#demo-achievements").isVisible());
      const evidence = page.locator("#demo-achievements li");
      assert.equal(await evidence.count(), 3);
      assert.equal(await evidence.locator("blockquote").count(), 3);
      const sources = await evidence.locator("p").allTextContents();
      assert.equal(
        new Set(sources).size,
        3,
        "Each completed criterion needs its own named evidence",
      );
      assert(
        sources.every((source) =>
          /Синтетическая заметка «.+» · точная цитата/.test(source),
        ),
      );
      const text = (await evidence.allTextContents()).join("\n");
      assert.match(text, example.outcome);
      if (index === 1) {
        for (const ordinal of ["первую", "вторую"]) {
          assert.match(text, new RegExp(`${ordinal} оплату 100 000 ₽`));
        }
        assert.match(text, /Третья оплата 100 000 ₽ получена/);
        assert.match(text, /300 000 ₽/);
      }
      completed.push({
        title: example.title,
        counters: example.targets,
        evidenceCount: 3,
        outcome: "PASS",
      });
    }
    await activate(page.locator("#demo-view-process"));
    await counts(examples[2], [0, 0, 0]);
    assert(await page.locator("#demo-achievements").isHidden());
    assert(await page.locator("#demo-controls").isVisible());
    assert(await page.locator(".demo-steps").isVisible());
    assert.equal(
      await page.locator("#demo-view-process").getAttribute("aria-pressed"),
      "true",
    );

    // Keyboard focus may scroll a lazy-loaded static image into view.
    assert.deepEqual(
      requests.slice(initialRequests).filter(({ type }) => type !== "image"),
      [],
      "Demo interactions must not make data requests",
    );
    assert.deepEqual(
      requests.filter(
        ({ type, url }) =>
          ["fetch", "xhr", "websocket"].includes(type) || /\/api\//.test(url),
      ),
      [],
    );
    assert.deepEqual(errors, []);
    return {
      flows,
      completed,
      keyboardFocus: "PASS",
      caseIsolation: "PASS",
      viewPreservation: "PASS",
      noApi: "PASS",
      errors,
    };
  } finally {
    page.off("request", onRequest);
    page.off("pageerror", onError);
  }
}
