"use strict";

// Synthetic examples only; this illustration never reads the product demo or API.
(() => {
  const scene = document.querySelector(".hero-scene");
  if (!scene) return;
  const choices = [...scene.querySelectorAll(".case-choice[data-case]")];
  const byId = (id) => scene.querySelector(`#${id}`);
  const pause = byId("case-pause");
  const live = byId("case-live");
  const status = byId("case-status");
  const fields = {
    goal: byId("case-goal"),
    intro: byId("case-note-intro"),
    quote: byId("case-quote"),
    tail: byId("case-note-tail"),
    outcome: byId("case-outcome"),
    value: byId("case-count-value"),
    target: byId("case-count-target"),
    detail: byId("case-detail"),
  };
  if (
    choices.length !== 3 ||
    !pause ||
    !live ||
    !status ||
    Object.entries(fields).some(([key, node]) => key !== "detail" && !node)
  )
    return;

  const cases = [
    {
      goal: "Попасть на ML-стажировку",
      intro: "Немного волновался.",
      quote: "Сегодня отправил резюме",
      tail: "на ML-стажировку.",
      outcome: "Один отклик уже есть",
      value: "1",
      target: "/ 3",
      detail: "Считаем подтверждённые отклики по выбранному критерию.",
    },
    {
      goal: "Заработать 300 000 ₽",
      intro: "Завершил первый проект.",
      quote: "Получил оплату 100 000 ₽",
      tail: "за выполненный проект.",
      outcome: "Первая оплата подтверждена",
      value: "1",
      target: "/ 3",
      detail:
        "Считаем 3 подтверждённые оплаты по 100 000 ₽. Это не банковский учёт.",
    },
    {
      goal: "Добиться повышения на работе",
      intro: "Подвёл итоги квартала.",
      quote: "Обсудил рост с руководителем",
      tail: "и договорился о следующем шаге.",
      outcome: "Разговор состоялся",
      value: "1",
      target: "/ 1",
      detail:
        "Засчитан разговор о росте. Само повышение ещё зависит от работодателя.",
    },
  ];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;
  let autoplay = !motion.matches;
  let hovering = scene.matches(":hover");
  let focused = scene.contains(document.activeElement);
  let timer = null;

  function inViewport() {
    const rect = scene.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth
    );
  }

  function canAdvance() {
    return autoplay && !hovering && !focused && !document.hidden && inViewport();
  }

  function updateControl() {
    pause.textContent = autoplay
      ? "Остановить слайдшоу"
      : "Запустить слайдшоу";
    live.setAttribute("aria-live", autoplay ? "off" : "polite");
  }

  function render(manual = false) {
    updateControl();
    const example = cases[current];
    for (const [key, node] of Object.entries(fields)) {
      if (node) node.textContent = example[key];
    }
    if (!motion.matches && typeof live.animate === "function") {
      live.animate([{ opacity: 0.25, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" });
    }
    choices.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.case) === current),
      );
    });
    if (manual)
      status.textContent = `Пример ${current + 1} из ${cases.length}: ${example.goal}. ${example.outcome}.`;
  }

  // Restart a full interval after every suspension; never catch up hidden slides.
  function schedule() {
    window.clearTimeout(timer);
    timer = null;
    if (!canAdvance()) return;
    timer = window.setTimeout(() => {
      // Geometry also guards the interval before an observer callback arrives.
      if (!canAdvance()) {
        schedule();
        return;
      }
      current = (current + 1) % cases.length;
      render();
      schedule();
    }, 8000);
  }

  choices.forEach((button) => {
    button.disabled = false;
    button.addEventListener("click", () => {
      const index = Number(button.dataset.case);
      if (!Number.isInteger(index) || !cases[index]) return;
      autoplay = false;
      current = index;
      render(true);
      schedule();
    });
  });
  pause.addEventListener("click", () => {
    autoplay = !autoplay;
    updateControl();
    schedule();
  });
  scene.addEventListener("mouseenter", () => {
    hovering = true;
    schedule();
  });
  scene.addEventListener("mouseleave", () => {
    hovering = false;
    schedule();
  });
  scene.addEventListener("focusin", () => {
    focused = true;
    schedule();
  });
  scene.addEventListener("focusout", () => {
    queueMicrotask(() => {
      focused = scene.contains(document.activeElement);
      schedule();
    });
  });
  document.addEventListener("visibilitychange", schedule);
  motion.addEventListener("change", () => {
    // A new reduction preference needs a fresh explicit opt-in to autoplay.
    if (motion.matches) autoplay = false;
    updateControl();
    schedule();
  });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(schedule);
    observer.observe(scene);
  } else {
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
  }
  pause.hidden = false;
  render();
  schedule();
})();
