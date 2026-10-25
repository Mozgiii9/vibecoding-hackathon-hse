"use strict";

// A deterministic illustration, never a model response or a backend request.
(() => {
  const mlStates = [
    {
      label: "01 / Намерение",
      tag: "Ещё не действие",
      type: "intention",
      quote: "«Завтра отправлю резюме»",
      source: "Синтетическая заметка № 1 · точная цитата",
      heading: "План есть. Действия пока нет.",
      description:
        "Намерение остаётся в истории, но не прибавляет отклик к критерию. Счётчик по-прежнему на нуле.",
      count: 0,
      status: "Намерение не изменило прогресс: 0 из 3 откликов.",
      next: "Добавить выполненное действие",
    },
    {
      label: "02 / Предложение AI",
      tag: "Ждёт вашей проверки",
      type: "proposed",
      quote: "«Сегодня отправил резюме»",
      source: "Синтетическая заметка № 2 · точная цитата",
      heading: "Похоже на действие. Решение за вами.",
      description:
        "В приложении AI предлагает связать событие с критерием «Отправить 3 отклика». Проверьте исходные слова. До подтверждения счётчик не меняется.",
      count: 0,
      status:
        "Предложено действие с точной цитатой. Пока не подтверждено: 0 из 3.",
      next: "Подтвердить действие",
    },
    {
      label: "03 / Подтверждение",
      tag: "Вы подтвердили",
      type: "confirmed",
      quote: "«Сегодня отправил резюме»",
      source: "Синтетическая заметка № 2 · точная цитата",
      heading: "Теперь этот отклик учтён.",
      description:
        "Ваше подтверждение позволяет засчитать выполненное действие. В настоящем продукте новое значение критерия рассчитывает сервер.",
      count: 1,
      status: "Вы подтвердили действие. Критерий обновлён: 1 из 3 откликов.",
      next: "Повторить импорт источника",
    },
    {
      label: "04 / Повторный импорт",
      tag: "Уже учтено",
      type: "confirmed",
      quote: "«Сегодня отправил резюме»",
      source: "Та же синтетическая заметка № 2 · повтор источника",
      heading: "Та же запись. Тот же один отклик.",
      description:
        "Повтор источника не создаёт нового достижения. Если событие подтверждено ошибочно, его можно отклонить и пересчитать результат.",
      count: 1,
      status:
        "Повторный источник распознан. Прогресс не вырос: по-прежнему 1 из 3.",
      next: null,
    },
    {
      label: "05 / Пересмотр",
      tag: "Вы отклонили",
      type: "rejected",
      quote: "«Сегодня отправил резюме»",
      source: "Синтетическая заметка № 2 · точная цитата",
      heading: "Решение можно пересмотреть.",
      description:
        "Событие отклонено и больше не влияет на критерий. Счётчик возвращается к нулю. Важен проверенный результат, а не красивая цифра.",
      count: 0,
      status: "Событие отклонено. Прогресс пересчитан: 0 из 3 откликов.",
      next: null,
    },
  ];
  // Each case has its own evidence and counters. All examples are synthetic.
  const cases = [
    {
      title: "Получить предложение ML-стажировки",
      criteria: [
        { label: "Отправить 3 отклика", target: 3 },
        { label: "Решить 5 задач по ML", target: 5 },
        { label: "Получить предложение стажировки", target: 1 },
      ],
      note: "Отклик — шаг к цели. Цель достигнута, когда получено предложение стажировки.",
      states: mlStates,
      completedQuote: "«Получил предложение ML-стажировки с датой выхода»",
      completedSource:
        "Синтетическая заметка «Предложение стажировки» · точная цитата",
      completedDescription:
        "Подтверждены три отклика, пять решённых задач и полученное предложение стажировки. Последний критерий подтверждает результат цели.",
      achievements: [
        [
          "Дневник откликов",
          "Отправил три отклика на ML-стажировки в команды Альфа, Бета и Гамма",
        ],
        ["Учебная заметка", "Решил все пять запланированных задач по ML"],
        [
          "Предложение стажировки",
          "Получил предложение ML-стажировки с датой выхода",
        ],
      ],
    },
    {
      title: "Заработать 300 000 ₽ на проектах",
      criteria: [
        { label: "Получить 3 оплаты по 100 000 ₽", target: 3 },
        { label: "Завершить 3 проекта", target: 3 },
        { label: "Согласовать 3 условия работы", target: 3 },
      ],
      note: "В примере одна подтверждённая оплата — 100 000 ₽. Три отдельные оплаты дают 300 000 ₽; это синтетические записи, а не банковский учёт.",
      intention: "«Завтра попрошу оплатить проект»",
      action: "«Получил оплату 100 000 ₽ за первый проект»",
      unit: "оплат",
      confirmedHeading: "Первая оплата учтена: 100 000 ₽.",
      duplicateHeading: "Та же оплата. По-прежнему 100 000 ₽.",
      completedQuote:
        "«Третья оплата 100 000 ₽ получена; вместе с двумя предыдущими — 300 000 ₽»",
      completedSource: "Синтетическая заметка «Третий проект» · точная цитата",
      completedDescription:
        "Три отдельные оплаты по 100 000 ₽ дают итог 300 000 ₽. Цитаты также подтверждают завершение трёх проектов и согласование условий каждого. Это учебный пример, а не банковский учёт.",
      achievements: [
        [
          "Первый проект",
          "Условия первого проекта согласованы, проект завершён. Получил первую оплату 100 000 ₽",
        ],
        [
          "Второй проект",
          "Условия второго проекта согласованы, проект завершён. Получил вторую оплату 100 000 ₽",
        ],
        [
          "Третий проект",
          "Условия третьего проекта согласованы, проект завершён. Третья оплата 100 000 ₽ получена; вместе с двумя предыдущими — 300 000 ₽",
        ],
      ],
    },
    {
      title: "Получить повышение",
      criteria: [
        { label: "Обсудить рост с руководителем", target: 1 },
        { label: "Зафиксировать 3 результата", target: 3 },
        { label: "Получить подтверждение повышения", target: 1 },
      ],
      note: "Разговор с руководителем — первый шаг. Для достижения цели нужно подтверждение новой роли и оформленного повышения.",
      intention: "«Завтра обсужу рост с руководителем»",
      action: "«Обсудил с руководителем мой рост и условия повышения»",
      unit: "разговоров",
      confirmedHeading: "Разговор учтён. Повышение ещё не подтверждено.",
      duplicateHeading: "Тот же разговор. Повышение ещё впереди.",
      completedQuote:
        "«Повышение оформлено: моя новая роль — ведущий ML-инженер»",
      completedSource:
        "Синтетическая заметка «Подтверждение новой роли» · точная цитата",
      completedDescription:
        "Разговор состоялся, три результата зафиксированы, новая роль подтверждена и повышение оформлено. Цель подтверждает последний источник, а не сам разговор о росте.",
      achievements: [
        [
          "Разговор с руководителем",
          "Обсудил с руководителем мой рост и условия повышения",
        ],
        [
          "Итоги работы",
          "Зафиксировал три результата: запустил модель, сократил время расчёта и внедрил мониторинг",
        ],
        [
          "Подтверждение новой роли",
          "Повышение оформлено: моя новая роль — ведущий ML-инженер",
        ],
      ],
    },
  ];

  function processStates(example) {
    const target = example.criteria[0].target;
    const progress = (count) => `${count} из ${target} ${example.unit}`;
    return mlStates.map((state, index) => ({
      ...state,
      quote: index === 0 ? example.intention : example.action,
      source:
        index === 0
          ? "Синтетическая заметка № 1 · точная цитата"
          : index === 3
            ? "Та же синтетическая заметка № 2 · повтор источника"
            : "Синтетическая заметка № 2 · точная цитата",
      heading:
        index === 2
          ? example.confirmedHeading
          : index === 3
            ? example.duplicateHeading
            : state.heading,
      description: [
        "Намерение остаётся в истории, но не засчитывается как выполненное действие. Счётчик по-прежнему на нуле.",
        `AI предлагает связать точную цитату с критерием «${example.criteria[0].label}». Проверьте исходные слова. До подтверждения счётчик не меняется.`,
        "Ваше подтверждение позволяет учесть это действие в первом критерии. Остальные критерии пока не выполнены. В приложении значение рассчитывает сервер.",
        "Повтор того же источника не создаёт нового достижения. Ошибочное подтверждение можно пересмотреть и отклонить.",
        "Событие отклонено и больше не влияет на критерий. Счётчик возвращается к нулю.",
      ][index],
      status: [
        `Намерение не изменило прогресс: ${progress(0)}.`,
        `Предложено действие с точной цитатой. Пока не подтверждено: ${progress(0)}.`,
        `Вы подтвердили действие: ${progress(1)}. Цель пока не достигнута.`,
        `Повторный источник распознан. Прогресс не вырос: ${progress(1)}.`,
        `Событие отклонено. Прогресс пересчитан: ${progress(0)}.`,
      ][index],
    }));
  }

  let current = 0;
  let currentCase = 0;
  let completed = false;
  const byId = (id) => document.getElementById(id);
  const next = byId("demo-next");
  const reject = byId("demo-reject");
  const reset = byId("demo-reset");
  const caseChoices = document.querySelectorAll(
    ".demo-case-choice[data-demo-case]",
  );
  const processView = byId("demo-view-process");
  const completeView = byId("demo-view-complete");

  function renderAchievements(example) {
    const container = byId("demo-achievements");
    const list = container.matches("ul, ol")
      ? container
      : container.querySelector("ul, ol") ||
        container.appendChild(document.createElement("ul"));
    list.replaceChildren();
    example.achievements.forEach(([source, quote]) => {
      const item = document.createElement("li");
      const citation = document.createElement("blockquote");
      citation.textContent = `«${quote}»`;
      const label = document.createElement("p");
      label.textContent = `Синтетическая заметка «${source}» · точная цитата`;
      item.append(citation, label);
      list.appendChild(item);
    });
    container.hidden = !completed;
  }

  function render(moveFocus = false) {
    const example = cases[currentCase];
    const states = example.states || processStates(example);
    const state = states[current];
    byId("demo-goal-title").textContent = example.title;
    byId("demo-case-note").textContent = example.note;
    caseChoices.forEach((choice) => {
      choice.setAttribute(
        "aria-pressed",
        String(Number(choice.dataset.demoCase) === currentCase),
      );
    });
    processView.setAttribute("aria-pressed", String(!completed));
    completeView.setAttribute("aria-pressed", String(completed));
    byId("step-label").textContent = completed
      ? "Итог / Все критерии выполнены"
      : state.label;
    byId("state-tag").textContent = completed ? "Цель достигнута" : state.tag;
    byId("state-tag").className =
      `state-tag ${completed ? "confirmed" : state.type}`;
    byId("demo-quote").textContent = completed
      ? example.completedQuote
      : state.quote;
    byId("quote-source").textContent = completed
      ? example.completedSource
      : state.source;
    byId("demo-heading").textContent = completed
      ? "Цель достигнута"
      : state.heading;
    byId("demo-description").textContent = completed
      ? example.completedDescription
      : state.description;
    example.criteria.forEach((criterion, index) => {
      const suffix = index === 0 ? "" : `-${index}`;
      const count = completed
        ? criterion.target
        : index === 0
          ? state.count
          : 0;
      byId(`criterion-label-${index}`).textContent = criterion.label;
      byId(`criterion-label-${index}`)
        .closest("li")
        .classList.toggle("is-complete", count === criterion.target);
      byId(`criterion-count${suffix}`).textContent =
        `${count} из ${criterion.target}`;
      const bar = byId(`criterion-progress${suffix}`);
      bar.setAttribute("aria-label", criterion.label);
      bar.setAttribute("aria-valuemax", String(criterion.target));
      bar.setAttribute("aria-valuenow", String(count));
      bar.firstElementChild.style.width = `${(count / criterion.target) * 100}%`;
    });
    byId("demo-status").textContent = completed
      ? `Синтетический пример: цель «${example.title}» достигнута. Все три критерия подтверждены учебными цитатами.`
      : state.status;
    renderAchievements(example);
    byId("demo-controls").hidden = completed;
    document.querySelector(".demo-steps").hidden = completed;
    next.hidden = completed || !state.next;
    if (state.next) next.textContent = `${state.next} →`;
    reject.hidden = completed || (current !== 2 && current !== 3);
    reset.hidden = completed || current === 0;
    document
      .querySelectorAll(".demo-steps i")
      .forEach((dot, index) =>
        dot.classList.toggle("is-current", index === current),
      );
    if (moveFocus && !completed)
      (state.next ? next : current === 3 ? reject : reset).focus({
        preventScroll: true,
      });
  }
  next.addEventListener("click", () => {
    current = Math.min(current + 1, 3);
    render(true);
  });
  reject.addEventListener("click", () => {
    current = 4;
    render(true);
  });
  reset.addEventListener("click", () => {
    current = 0;
    render(true);
  });
  caseChoices.forEach((choice) => {
    choice.addEventListener("click", () => {
      const selected = Number(choice.dataset.demoCase);
      if (selected !== currentCase) {
        currentCase = selected;
        current = 0;
      }
      render();
    });
    choice.disabled = false;
  });
  processView.addEventListener("click", () => {
    completed = false;
    render();
  });
  completeView.addEventListener("click", () => {
    completed = true;
    render();
  });
  processView.disabled = false;
  completeView.disabled = false;
  render();

  // Fail closed: no URL means a readable status, not a broken navigation target.
  try {
    const raw = window.RYADOM_CONFIG?.appUrl;
    if (!raw || typeof raw !== "string") return;
    const url = new URL(raw);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    const privateHost =
      /^(localhost|.*\.localhost|.*\.local|.*\.internal|127(?:\.\d+){3}|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|169\.254(?:\.\d+){2}|0(?:\.\d+){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d+){2}|::1|::|f[cd][0-9a-f:]*|fe[89ab][0-9a-f:]*)$/.test(
        hostname,
      );
    // Only ordinary public DNS/IPv4 entry points are supported. This also
    // rejects IPv4-mapped IPv6 and single-label internal DNS names.
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      privateHost ||
      hostname.includes(":") ||
      !hostname.includes(".") ||
      url.search ||
      url.hash
    )
      return;
    document.querySelectorAll("[data-app-cta]").forEach((placeholder) => {
      const link = document.createElement("a");
      link.className = "app-cta";
      link.href = url.href;
      link.textContent = "Открыть приложение ↗";
      placeholder.replaceWith(link);
    });
    document.querySelectorAll("[data-cta-note]").forEach((note) => {
      note.textContent = "Хакатонная версия. Начните с синтетической записи.";
    });
  } catch {
    // Invalid public config preserves the same honest fallback.
  }
})();
