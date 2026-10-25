"use strict";

// A deterministic illustration, never a model response or a backend request.
(() => {
  const states = [
    { label: "01 / Намерение", tag: "Ещё не действие", type: "intention", quote: "«Завтра отправлю резюме»", source: "Синтетическая заметка № 1 · точная цитата", heading: "План есть. Действия пока нет.", description: "Намерение остаётся в истории, но не прибавляет отклик к критерию. Счётчик по-прежнему на нуле.", count: 0, status: "Намерение не изменило прогресс: 0 из 3 откликов.", next: "Добавить выполненное действие" },
    { label: "02 / Предложение AI", tag: "Ждёт вашей проверки", type: "proposed", quote: "«Сегодня отправил резюме»", source: "Синтетическая заметка № 2 · точная цитата", heading: "Похоже на действие. Решение за вами.", description: "В приложении AI предлагает связать событие с критерием «Отправить 3 отклика». Проверьте исходные слова. До подтверждения счётчик не меняется.", count: 0, status: "Предложено действие с точной цитатой. Пока не подтверждено: 0 из 3.", next: "Подтвердить действие" },
    { label: "03 / Подтверждение", tag: "Вы подтвердили", type: "confirmed", quote: "«Сегодня отправил резюме»", source: "Синтетическая заметка № 2 · точная цитата", heading: "Теперь этот отклик учтён.", description: "Ваше подтверждение позволяет засчитать выполненное действие. В настоящем продукте новое значение критерия рассчитывает сервер.", count: 1, status: "Вы подтвердили действие. Критерий обновлён: 1 из 3 откликов.", next: "Повторить импорт источника" },
    { label: "04 / Повторный импорт", tag: "Уже учтено", type: "confirmed", quote: "«Сегодня отправил резюме»", source: "Та же синтетическая заметка № 2 · повтор источника", heading: "Та же запись. Тот же один отклик.", description: "Повтор источника не создаёт нового достижения. Если событие подтверждено ошибочно, его можно отклонить и пересчитать результат.", count: 1, status: "Повторный источник распознан. Прогресс не вырос: по-прежнему 1 из 3.", next: null },
    { label: "05 / Пересмотр", tag: "Вы отклонили", type: "rejected", quote: "«Сегодня отправил резюме»", source: "Синтетическая заметка № 2 · точная цитата", heading: "Решение можно пересмотреть.", description: "Событие отклонено и больше не влияет на критерий. Счётчик возвращается к нулю. Важен проверенный результат, а не красивая цифра.", count: 0, status: "Событие отклонено. Прогресс пересчитан: 0 из 3 откликов.", next: null }
  ];
  let current = 0;
  const byId = (id) => document.getElementById(id);
  const next = byId("demo-next");
  const reject = byId("demo-reject");
  const reset = byId("demo-reset");

  function render(moveFocus = false) {
    const state = states[current];
    byId("step-label").textContent = state.label;
    byId("state-tag").textContent = state.tag;
    byId("state-tag").className = `state-tag ${state.type}`;
    byId("demo-quote").textContent = state.quote;
    byId("quote-source").textContent = state.source;
    byId("demo-heading").textContent = state.heading;
    byId("demo-description").textContent = state.description;
    byId("criterion-count").textContent = `${state.count} из 3`;
    byId("criterion-progress").setAttribute("aria-valuenow", String(state.count));
    byId("criterion-progress").firstElementChild.style.width = `${state.count / 3 * 100}%`;
    byId("demo-status").textContent = state.status;
    next.hidden = !state.next;
    if (state.next) next.textContent = `${state.next} →`;
    reject.hidden = current !== 2 && current !== 3;
    reset.hidden = current === 0;
    document.querySelectorAll(".demo-steps i").forEach((dot, index) => dot.classList.toggle("is-current", index === current));
    if (moveFocus) (state.next ? next : current === 3 ? reject : reset).focus({ preventScroll: true });
  }
  next.addEventListener("click", () => { current = Math.min(current + 1, 3); render(true); });
  reject.addEventListener("click", () => { current = 4; render(true); });
  reset.addEventListener("click", () => { current = 0; render(true); });
  byId("demo-controls").hidden = false;
  render();

  // Fail closed: no URL means a readable status, not a broken navigation target.
  try {
    const raw = window.RYADOM_CONFIG?.appUrl;
    if (!raw || typeof raw !== "string") return;
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    const privateHost = /^(localhost|.*\.localhost|.*\.local|.*\.internal|127(?:\.\d+){3}|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|169\.254(?:\.\d+){2}|0(?:\.\d+){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d+){2}|::1|::|f[cd][0-9a-f:]*|fe[89ab][0-9a-f:]*)$/.test(hostname);
    // Only ordinary public DNS/IPv4 entry points are supported. This also
    // rejects IPv4-mapped IPv6 and single-label internal DNS names.
    if (url.protocol !== "https:" || url.username || url.password || privateHost || hostname.includes(":") || !hostname.includes(".") || url.search || url.hash) return;
    document.querySelectorAll("[data-app-cta]").forEach((placeholder) => {
      const link = document.createElement("a");
      link.className = "app-cta";
      link.href = url.href;
      link.textContent = "Открыть приложение ↗";
      placeholder.replaceWith(link);
    });
    document.querySelectorAll("[data-cta-note]").forEach((note) => { note.textContent = "Хакатонная версия. Начните с синтетической записи."; });
  } catch {
    // Invalid public config preserves the same honest fallback.
  }
})();
