import { act, renderHook, waitFor } from "@testing-library/react";

import * as api from "./api";
import type { Evidence, Goal, GoalWrite, ImportResult, Progress, Source } from "./api";
import { useGoalWorkspace } from "./useGoalWorkspace";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    getGoal: vi.fn(), listEvidence: vi.fn(), getProgress: vi.fn(), getSource: vi.fn(),
    saveGoal: vi.fn(), importText: vi.fn(), importAudio: vi.fn(), reviewEvidence: vi.fn(),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const goal: Goal = {
  id: "demo", title: "Подготовить резюме", deadline: null, revision: 1,
  confirmedAt: "2026-10-25T10:00:00Z",
  criteria: [{ id: "cv", description: "Отправить резюме", targetCount: 1, unit: "отправка" }],
};
const goalWrite: GoalWrite = {
  title: goal.title, deadline: null, criteria: goal.criteria, confirm: true, expectedRevision: 1,
};
const evidence: Evidence = {
  id: "event-1", goalId: "demo", sourceId: "source-1", criterionId: "cv",
  eventType: "completed_action", summary: "Резюме отправлено", quote: "Отправил резюме.",
  textStart: 0, textEnd: 16, startMs: null, endMs: null, eventKey: "key-1",
  status: "proposed", revision: 1, createdAt: "2026-10-25T10:00:00Z",
};
const secondEvidence: Evidence = { ...evidence, id: "event-2", sourceId: "source-2", eventKey: "key-2" };
const source: Source = {
  id: "source-1", goalId: "demo", kind: "text", title: "Заметка", contentHash: "hash-1",
  text: evidence.quote, capturedAt: null, segments: [], createdAt: "2026-10-25T10:00:00Z",
};
const secondSource: Source = { ...source, id: "source-2", contentHash: "hash-2" };
const progress: Progress = {
  goalId: "demo", goalRevision: 1,
  criteria: [{ criterionId: "cv", confirmedCount: 0, targetCount: 1, complete: false, evidenceIds: [] }],
  nextStep: { text: "Отправить резюме", evidenceIds: [], kind: "rule" },
};
const importResult: ImportResult = { source, evidence: [evidence], duplicate: false };
const textInput: api.TextImportInput = { goalId: "demo", title: "Заметка", text: source.text };

describe("useGoalWorkspace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getGoal).mockResolvedValue(goal);
    vi.mocked(api.listEvidence).mockResolvedValue([evidence, secondEvidence]);
    vi.mocked(api.getProgress).mockResolvedValue(progress);
    vi.mocked(api.getSource).mockResolvedValue(source);
    vi.mocked(api.saveGoal).mockResolvedValue(goal);
    vi.mocked(api.importText).mockResolvedValue(importResult);
    vi.mocked(api.importAudio).mockResolvedValue(importResult);
    vi.mocked(api.reviewEvidence).mockResolvedValue({ ...evidence, status: "confirmed", revision: 2 });
  });

  it("returns an empty ready workspace for a missing goal without requesting dependent data", async () => {
    vi.mocked(api.getGoal).mockResolvedValue(null);
    const { result } = renderHook(() => useGoalWorkspace("demo"));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current).toMatchObject({
      goal: null, evidence: [], progress: null, source: null, selectedEvidenceId: null, error: null,
    });
    expect(api.listEvidence).not.toHaveBeenCalled();
    expect(api.getProgress).not.toHaveBeenCalled();
    expect(api.getSource).not.toHaveBeenCalled();
  });

  it("ignores a late source response after selection changes, even when the transport ignores abort", async () => {
    const first = deferred<Source>();
    const second = deferred<Source>();
    vi.mocked(api.getSource).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.selectEvidence(evidence.id));
    const firstSignal = vi.mocked(api.getSource).mock.calls[0]![1]!;
    act(() => result.current.selectEvidence(secondEvidence.id));
    expect(firstSignal.aborted).toBe(true);
    await act(async () => second.resolve(secondSource));
    expect(result.current.source).toEqual(secondSource);

    await act(async () => first.resolve(source));
    expect(result.current.source).toEqual(secondSource);
    act(() => result.current.selectEvidence(secondEvidence.id));
    expect(result.current.source).toEqual(secondSource);
    expect(api.getSource).toHaveBeenCalledTimes(2);
  });

  it("clears selection and ignores a pending source after deselection", async () => {
    const pending = deferred<Source>();
    vi.mocked(api.getSource).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.selectEvidence(evidence.id));
    act(() => result.current.selectEvidence(null));
    await act(async () => pending.resolve(source));
    expect(result.current.selectedEvidenceId).toBeNull();
    expect(result.current.source).toBeNull();
  });

  it("reloads the selected source on refresh and ignores its older request", async () => {
    const olderSource = deferred<Source>();
    const updatedSource = { ...source, title: "Актуальный источник" };
    vi.mocked(api.getSource).mockReturnValueOnce(olderSource.promise).mockResolvedValue(updatedSource);
    const { result } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.selectEvidence(evidence.id));
    const olderSignal = vi.mocked(api.getSource).mock.calls[0]![1]!;

    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.source).toEqual(updatedSource));
    expect(olderSignal.aborted).toBe(true);
    await act(async () => olderSource.resolve(source));
    expect(result.current.source).toEqual(updatedSource);
    expect(result.current.selectedEvidenceId).toBe(evidence.id);
  });

  it("uses fresh server counts and evidence after review, including counts larger than the target", async () => {
    const confirmed = { ...evidence, status: "confirmed" as const, revision: 2 };
    const serverProgress: Progress = {
      ...progress, nextStep: null,
      criteria: [{ ...progress.criteria[0]!, confirmedCount: 7, complete: true, evidenceIds: [confirmed.id] }],
    };
    const { result } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    vi.mocked(api.listEvidence).mockResolvedValue([confirmed]);
    vi.mocked(api.getProgress).mockResolvedValue(serverProgress);

    await act(async () => result.current.reviewEvidence(evidence.id, { status: "confirmed", expectedRevision: 1 }));

    expect(result.current.progress).toEqual(serverProgress);
    expect(result.current.evidence).toEqual([confirmed]);
    expect(api.getProgress).toHaveBeenCalledTimes(2);
    expect(api.getGoal).toHaveBeenCalledTimes(2);
    expect(result.current.busy).toBeNull();
  });

  it("shows safe mutation errors, resets the lock, and reloads after a successful retry", async () => {
    vi.mocked(api.importText).mockRejectedValueOnce(new Error("private upstream payload"));
    const { result } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => result.current.importText(textInput));
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Не удалось выполнить запрос. Попробуйте снова.");
    expect(result.current.notice).toBeNull();
    expect(result.current.busy).toBeNull();
    expect(api.getProgress).toHaveBeenCalledTimes(1);

    await act(async () => result.current.importText(textInput));
    expect(result.current.status).toBe("ready");
    expect(result.current.error).toBeNull();
    expect(api.importText).toHaveBeenCalledTimes(2);
    expect(api.getProgress).toHaveBeenCalledTimes(2);
  });

  it("preserves the safe API error for audio and allows retry", async () => {
    const error = new api.GoalsApiError("stt_unconfigured", 503);
    vi.mocked(api.importAudio).mockRejectedValueOnce(error);
    const input: api.AudioImportInput = {
      goalId: "demo", title: "Интервью", file: new File(["synthetic"], "test.wav", { type: "audio/wav" }),
    };
    const { result } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => result.current.importAudio(input));
    expect(result.current.error).toBe(error.message);
    expect(result.current.busy).toBeNull();
    await act(async () => result.current.importAudio(input));
    expect(result.current.status).toBe("ready");
    expect(api.getProgress).toHaveBeenCalledTimes(2);
  });

  it("serializes all mutations and prevents repeated clicks before React rerenders", async () => {
    const pending = deferred<Goal>();
    vi.mocked(api.saveGoal).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let saving!: Promise<void>;

    act(() => {
      saving = result.current.saveGoal(goalWrite);
      void result.current.saveGoal(goalWrite);
      void result.current.importText(textInput);
      void result.current.reviewEvidence(evidence.id, { status: "confirmed", expectedRevision: 1 });
    });
    expect(result.current.busy).toBe("saving");
    expect(api.saveGoal).toHaveBeenCalledTimes(1);
    expect(api.importText).not.toHaveBeenCalled();
    expect(api.reviewEvidence).not.toHaveBeenCalled();

    await act(async () => { pending.resolve(goal); await saving; });
    expect(result.current.busy).toBeNull();
    expect(api.getProgress).toHaveBeenCalledTimes(2);
  });

  it("reports an exact duplicate after reloading, without adding local evidence", async () => {
    vi.mocked(api.importText).mockResolvedValue({ ...importResult, duplicate: true });
    const { result } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => result.current.importText(textInput));
    expect(result.current.notice).toContain("уже импортирован");
    expect(result.current.evidence).toEqual([evidence, secondEvidence]);
    expect(result.current.progress).toEqual(progress);

    vi.mocked(api.getProgress).mockRejectedValueOnce(new api.GoalsApiError("network_error", 0));
    await act(async () => result.current.importText(textInput));
    expect(result.current.status).toBe("error");
    expect(result.current.notice).toBeNull();
    expect(result.current.busy).toBeNull();
  });

  it("reloads a review revision conflict and keeps it visible as an error", async () => {
    const conflict = new api.GoalsApiError("revision_conflict", 409);
    vi.mocked(api.reviewEvidence).mockRejectedValue(conflict);
    const { result } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const revised = { ...evidence, revision: 3, status: "rejected" as const };
    vi.mocked(api.listEvidence).mockResolvedValue([revised]);

    await act(async () => result.current.reviewEvidence(evidence.id, { status: "confirmed", expectedRevision: 1 }));
    expect(result.current.evidence).toEqual([revised]);
    expect(result.current.error).toContain(conflict.message);
    expect(result.current.error).toContain("Данные обновлены");
    expect(result.current.status).toBe("error");
    expect(result.current.busy).toBeNull();
    expect(api.getProgress).toHaveBeenCalledTimes(2);
  });

  it("discards an earlier refresh and aborts its goal request", async () => {
    const pending = deferred<Goal | null>();
    const { result } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    vi.mocked(api.getGoal).mockReturnValueOnce(pending.promise);
    let earlier!: Promise<void>;
    act(() => { earlier = result.current.refresh(); });
    const earlierSignal = vi.mocked(api.getGoal).mock.calls[1]![1]!;
    vi.mocked(api.getGoal).mockResolvedValue({ ...goal, title: "Актуальная цель", revision: 2 });
    await act(async () => result.current.refresh());
    expect(earlierSignal.aborted).toBe(true);

    await act(async () => { pending.resolve(goal); await earlier; });
    expect(result.current.goal?.title).toBe("Актуальная цель");
    expect(api.listEvidence).toHaveBeenCalledTimes(2);
  });

  it("does not replace a new goal with an old goal response", async () => {
    const pending = deferred<Goal | null>();
    vi.mocked(api.getGoal).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ id }) => useGoalWorkspace(id), { initialProps: { id: "demo" } });
    const oldSignal = vi.mocked(api.getGoal).mock.calls[0]![1]!;
    const nextGoal = { ...goal, id: "next", title: "Следующая цель" };
    vi.mocked(api.getGoal).mockResolvedValue(nextGoal);
    vi.mocked(api.listEvidence).mockResolvedValue([]);
    vi.mocked(api.getProgress).mockResolvedValue({ ...progress, goalId: "next" });
    rerender({ id: "next" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => pending.resolve(goal));
    expect(result.current.goal).toEqual(nextGoal);
    expect(api.listEvidence).toHaveBeenCalledTimes(1);
  });

  it("ignores a mutation completing after switching goals", async () => {
    const pending = deferred<Goal>();
    vi.mocked(api.saveGoal).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ id }) => useGoalWorkspace(id), { initialProps: { id: "demo" } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let saving!: Promise<void>;
    act(() => { saving = result.current.saveGoal(goalWrite); });
    vi.mocked(api.getGoal).mockResolvedValue(null);
    rerender({ id: "next" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => { pending.resolve(goal); await saving; });
    expect(result.current.goal).toBeNull();
    expect(result.current.busy).toBeNull();
    expect(api.getGoal).toHaveBeenCalledTimes(2);
  });

  it("aborts source and import requests on unmount and ignores their late failures", async () => {
    const pendingSource = deferred<Source>();
    const pendingImport = deferred<ImportResult>();
    vi.mocked(api.getSource).mockReturnValueOnce(pendingSource.promise);
    vi.mocked(api.importText).mockReturnValueOnce(pendingImport.promise);
    const { result, unmount } = renderHook(() => useGoalWorkspace("demo"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.selectEvidence(evidence.id));
    let importing!: Promise<void>;
    act(() => { importing = result.current.importText(textInput); });
    const sourceSignal = vi.mocked(api.getSource).mock.calls[0]![1]!;
    const importSignal = vi.mocked(api.importText).mock.calls[0]![1]!;
    unmount();
    expect(sourceSignal.aborted).toBe(true);
    expect(importSignal.aborted).toBe(true);
    await act(async () => {
      pendingSource.reject(new Error("private source failure"));
      pendingImport.reject(new Error("private import failure"));
      await importing;
    });
    expect(api.getGoal).toHaveBeenCalledTimes(1);
  });
});
