import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Evidence, Goal, Progress, Source } from "./api";
import GoalWorkspaceView from "./GoalWorkspaceView";
import type { GoalWorkspace } from "./useGoalWorkspace";

const goal: Goal = {
  id: "goal-current", title: "Подготовиться к собеседованию", deadline: null,
  confirmedAt: "2026-10-25T10:00:00Z", revision: 3,
  criteria: [
    { id: "cv", description: "Отправить резюме", targetCount: 1, unit: "отправка" },
    { id: "mock", description: "Провести пробные интервью", targetCount: 2, unit: "интервью" },
    { id: "feedback", description: "Внести правки", targetCount: 1, unit: "исправление" },
  ],
};
const quote = "Отправил резюме.";
const sourceText = `Начало заметки. ${quote} Конец заметки.`;
const completed: Evidence = {
  id: "event-completed", goalId: goal.id, sourceId: "source-note", criterionId: "cv",
  eventType: "completed_action", summary: "Резюме отправлено", quote,
  textStart: sourceText.indexOf(quote), textEnd: sourceText.indexOf(quote) + quote.length,
  startMs: null, endMs: null, eventKey: "completed-key", status: "proposed", revision: 7,
  createdAt: "2026-10-25T10:00:00Z",
};
const intention: Evidence = {
  ...completed, id: "event-intention", eventKey: "intention-key", eventType: "intention",
  summary: "Хочу пройти пробное интервью", criterionId: "mock", revision: 2,
};
const source: Source = {
  id: completed.sourceId, goalId: goal.id, kind: "text", title: "Заметка после встречи",
  contentHash: "a".repeat(64), text: sourceText, capturedAt: null, segments: [],
  createdAt: "2026-10-25T10:00:00Z",
};
const progress: Progress = {
  goalId: goal.id, goalRevision: goal.revision,
  criteria: goal.criteria.map((criterion) => ({
    criterionId: criterion.id, confirmedCount: 0, targetCount: criterion.targetCount,
    complete: false, evidenceIds: [],
  })),
  nextStep: { text: "Отправить резюме", evidenceIds: [], kind: "rule" },
};

function createWorkspace(overrides: Partial<GoalWorkspace> = {}): GoalWorkspace {
  return {
    goal, evidence: [completed, intention], progress, source: null, selectedEvidenceId: null,
    hasLoaded: true, status: "ready", busy: null, error: null, notice: null,
    refresh: vi.fn<GoalWorkspace["refresh"]>().mockResolvedValue(undefined),
    saveGoal: vi.fn<GoalWorkspace["saveGoal"]>().mockResolvedValue(undefined),
    importText: vi.fn<GoalWorkspace["importText"]>().mockResolvedValue(undefined),
    importAudio: vi.fn<GoalWorkspace["importAudio"]>().mockResolvedValue(undefined),
    reviewEvidence: vi.fn<GoalWorkspace["reviewEvidence"]>().mockResolvedValue(undefined),
    selectEvidence: vi.fn<GoalWorkspace["selectEvidence"]>(),
    ...overrides,
  };
}

function eventRow(summary: string): HTMLElement {
  const row = screen.getByRole("heading", { name: summary }).closest("li");
  if (!row) throw new Error(`Missing event row: ${summary}`);
  return row;
}

describe("GoalWorkspaceView", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn((query: string): MediaQueryList => ({
      matches: true, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn(() => true),
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps intentions out of confirmation while allowing a human to reject them", async () => {
    const user = userEvent.setup();
    const workspace = createWorkspace();
    render(<GoalWorkspaceView workspace={workspace} onLogout={vi.fn()} />);

    const row = within(eventRow(intention.summary));
    expect(row.getByText("Намерение")).toBeVisible();
    expect(row.getByText("Пока это план. В прогрессе не учитывается.")).toBeVisible();
    expect(row.queryByRole("button", { name: "Подтвердить" })).not.toBeInTheDocument();

    await user.click(row.getByRole("button", { name: "Отклонить" }));
    expect(workspace.reviewEvidence).toHaveBeenCalledExactlyOnceWith(intention.id, {
      status: "rejected", expectedRevision: intention.revision,
    });
  });

  it("submits the exact completed action ID and current revision without optimistic progress", async () => {
    const user = userEvent.setup();
    const workspace = createWorkspace();
    render(<GoalWorkspaceView workspace={workspace} onLogout={vi.fn()} />);

    await user.click(within(eventRow(completed.summary)).getByRole("button", { name: "Подтвердить" }));
    expect(workspace.reviewEvidence).toHaveBeenCalledExactlyOnceWith(completed.id, {
      status: "confirmed", expectedRevision: 7,
    });
    expect(screen.getByRole("progressbar", { name: "Отправить резюме" })).toHaveAttribute("aria-valuenow", "0");
    expect(within(eventRow(completed.summary)).getByText("На проверке")).toBeVisible();
  });

  it("selects an event source and moves focus to the source region", async () => {
    const user = userEvent.setup();
    const workspace = createWorkspace();
    render(<GoalWorkspaceView workspace={workspace} onLogout={vi.fn()} />);

    await user.click(within(eventRow(completed.summary)).getByRole("button", { name: "Посмотреть источник" }));

    expect(workspace.selectEvidence).toHaveBeenCalledExactlyOnceWith(completed.id);
    const region = screen.getByRole("complementary", { name: /За каждым шагом/ });
    await waitFor(() => expect(region).toHaveFocus());
    expect(region).toHaveAttribute("id", "gw-source");
  });

  it("highlights only the exact source range and refuses a mismatching quote", () => {
    const workspace = createWorkspace({ selectedEvidenceId: completed.id, source });
    const { container, rerender } = render(<GoalWorkspaceView workspace={workspace} onLogout={vi.fn()} />);

    expect(container.querySelectorAll("mark")).toHaveLength(1);
    expect(container.querySelector("mark")).toHaveTextContent(quote);
    const document = container.querySelector(".gw-source-document");
    expect(document).toHaveTextContent(sourceText);
    expect(within(screen.getByRole("complementary", { name: /За каждым шагом/ })).queryByText(/Фрагмент \d/)).not.toBeInTheDocument();

    rerender(<GoalWorkspaceView workspace={{ ...workspace, source: { ...source, text: "Здесь совсем другой исходный текст." } }} onLogout={vi.fn()} />);
    expect(container.querySelector("mark")).not.toBeInTheDocument();
    expect(screen.getByText(/Не удалось сопоставить цитату/)).toBeVisible();
    expect(screen.getByText("Здесь совсем другой исходный текст.")).toBeVisible();
  });

  it("fills a sample draft without saving and creates a confirmed goal only on submit", async () => {
    const user = userEvent.setup();
    const workspace = createWorkspace({ goal: null, evidence: [], progress: null });
    render(<GoalWorkspaceView workspace={workspace} onLogout={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Заполнить пример/ }));
    expect(screen.getByLabelText("Моя цель")).toHaveValue("Подготовиться к ML-собеседованию");
    expect(workspace.saveGoal).not.toHaveBeenCalled();
    const localDeadline = "2026-11-01T17:30";
    await user.type(screen.getByLabelText(/К какому сроку/), localDeadline);
    await user.click(screen.getByRole("button", { name: "Подтвердить цель и критерии" }));

    expect(workspace.saveGoal).toHaveBeenCalledExactlyOnceWith({
      title: "Подготовиться к ML-собеседованию", deadline: new Date(localDeadline).toISOString(),
      criteria: [
        { id: "cv", description: "Отправить резюме", targetCount: 1, unit: "отправка" },
        { id: "mock", description: "Пройти пробные интервью", targetCount: 2, unit: "интервью" },
        { id: "feedback", description: "Внести исправления по обратной связи", targetCount: 1, unit: "исправление" },
      ],
      confirm: true, expectedRevision: null,
    });
  });

  it("offers retry without exposing goal creation after a failed initial load", async () => {
    const user = userEvent.setup();
    const workspace = createWorkspace({
      goal: null, evidence: [], progress: null, hasLoaded: false,
      status: "error", error: "Не удалось связаться с сервером.",
    });
    const { rerender } = render(<GoalWorkspaceView workspace={workspace} onLogout={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(workspace.error!);
    expect(screen.queryByLabelText("Моя цель")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Подтвердить цель и критерии" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Обновить данные" }));
    expect(workspace.refresh).toHaveBeenCalledOnce();
    expect(workspace.saveGoal).not.toHaveBeenCalled();

    rerender(<GoalWorkspaceView workspace={{ ...workspace, hasLoaded: true, status: "ready", error: null }} onLogout={vi.fn()} />);
    expect(screen.getByLabelText("Моя цель")).toBeVisible();
  });

  it("keeps the goal draft mounted after a failed save and during retry", async () => {
    const user = userEvent.setup();
    const workspace = createWorkspace({ goal: null, evidence: [], progress: null });
    const { rerender } = render(<GoalWorkspaceView workspace={workspace} onLogout={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Заполнить пример/ }));
    const title = screen.getByLabelText("Моя цель");
    await user.clear(title);
    await user.type(title, "Мой сохранённый черновик");
    await user.click(screen.getByRole("button", { name: "Подтвердить цель и критерии" }));

    rerender(<GoalWorkspaceView workspace={{ ...workspace, status: "error", error: "Не удалось связаться с сервером." }} onLogout={vi.fn()} />);
    expect(screen.getByLabelText("Моя цель")).toBe(title);
    expect(title).toHaveValue("Мой сохранённый черновик");
    expect(title).toBeEnabled();

    rerender(<GoalWorkspaceView workspace={{ ...workspace, status: "loading" }} onLogout={vi.fn()} />);
    expect(screen.getByLabelText("Моя цель")).toBe(title);
    expect(title).toHaveValue("Мой сохранённый черновик");
    expect(title).toBeDisabled();

    rerender(<GoalWorkspaceView workspace={workspace} onLogout={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Подтвердить цель и критерии" }));
    expect(workspace.saveGoal).toHaveBeenCalledTimes(2);
    expect(workspace.saveGoal).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Мой сохранённый черновик" }));
  });

  it("imports the raw draft with the real goal ID and preserves it after a provider error", async () => {
    const user = userEvent.setup();
    const workspace = createWorkspace();
    const { rerender } = render(<GoalWorkspaceView workspace={workspace} onLogout={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Добавить контекст" }));
    await user.type(screen.getByLabelText("Название источника"), "После интервью");
    const rawText = "  Отправил резюме.\nЗавтра хочу позвонить.  ";
    await user.type(screen.getByLabelText(/^Текст источника/), rawText);
    await user.click(screen.getByRole("button", { name: "Найти события" }));

    expect(workspace.importText).toHaveBeenCalledExactlyOnceWith({
      goalId: goal.id, title: "После интервью", text: rawText,
    });
    rerender(<GoalWorkspaceView workspace={{ ...workspace, status: "error", error: "Модель не ответила вовремя. Попробуйте снова." }} onLogout={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Модель не ответила вовремя.");
    expect(screen.getByLabelText("Название источника")).toHaveValue("После интервью");
    expect(screen.getByLabelText(/^Текст источника/)).toHaveValue(rawText);
    await user.click(screen.getByRole("button", { name: "Обновить данные" }));
    expect(workspace.refresh).toHaveBeenCalledOnce();
  });

  it("labels the synthetic preview and blocks mutation controls while keeping source selection", async () => {
    const user = userEvent.setup();
    const workspace = createWorkspace();
    render(<GoalWorkspaceView preview workspace={workspace} onLogout={vi.fn()} />);

    expect(screen.getByText("Демо-макет · синтетические данные")).toBeVisible();
    expect(screen.getByRole("button", { name: "Добавить контекст" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Подтвердить" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отклонить" })).not.toBeInTheDocument();
    await user.click(within(eventRow(completed.summary)).getByRole("button", { name: "Посмотреть источник" }));
    expect(workspace.selectEvidence).toHaveBeenCalledWith(completed.id);
    expect(workspace.saveGoal).not.toHaveBeenCalled();
    expect(workspace.importText).not.toHaveBeenCalled();
    expect(workspace.importAudio).not.toHaveBeenCalled();
    expect(workspace.reviewEvidence).not.toHaveBeenCalled();
  });

  it("filters proposed and disputed events without mutating server state", async () => {
    const user = userEvent.setup();
    const confirmed = { ...completed, status: "confirmed" as const };
    const disputed = { ...completed, id: "event-disputed", status: "disputed" as const, summary: "Нужна повторная проверка" };
    const workspace = createWorkspace({ evidence: [confirmed, intention, disputed] });
    render(<GoalWorkspaceView workspace={workspace} onLogout={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "На проверке 2" }));
    expect(screen.queryByRole("heading", { name: completed.summary })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: intention.summary })).toBeVisible();
    expect(screen.getByRole("heading", { name: disputed.summary })).toBeVisible();
    expect(screen.getByRole("button", { name: "На проверке 2" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Все события" }));
    expect(screen.getByRole("heading", { name: completed.summary })).toBeVisible();
    expect(workspace.reviewEvidence).not.toHaveBeenCalled();
  });
});
