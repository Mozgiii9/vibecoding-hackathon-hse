import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedFetch } from "../../api/auth-adapter";
import {
  getGoal, getProgress, getSource, GoalsApiError, importAudio, importText,
  listEvidence, MAX_AUDIO_BYTES, reviewEvidence, saveGoal,
} from "./api";
import type { Evidence, Goal, ImportResult, Progress, Source } from "./api";

vi.mock("../../api/auth-adapter", () => ({ authenticatedFetch: vi.fn() }));
const fetchMock = vi.mocked(authenticatedFetch);
const goal: Goal = {
  id: "demo", title: "Собеседование", deadline: null,
  criteria: [{ id: "cv", description: "Отправить резюме", targetCount: 1, unit: "резюме" }],
  confirmedAt: null, revision: 1,
};
const timestamp = "2026-10-25T13:00:00+03:00";
const source: Source = {
  id: "s1", goalId: "demo", kind: "text", title: "Чат", text: "Готово",
  contentHash: "a".repeat(64), capturedAt: null, createdAt: timestamp, segments: [],
};
const evidence: Evidence = {
  id: "e1", goalId: "demo", sourceId: source.id, criterionId: "cv", eventKey: "b".repeat(64),
  eventType: "completed_action", status: "proposed", revision: 1, createdAt: timestamp,
  summary: "Резюме отправлено", quote: source.text, textStart: 0, textEnd: source.text.length,
  startMs: null, endMs: null,
};
const progress: Progress = {
  goalId: "demo", goalRevision: 3,
  criteria: [{ criterionId: "cv", confirmedCount: 0, targetCount: 1, complete: false, evidenceIds: [] }],
  nextStep: { text: "Отправить резюме", evidenceIds: [evidence.id], kind: "rule" },
};
const result: ImportResult = { source, evidence: [evidence], duplicate: false };
const reply = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { "content-type": "application/json" },
});

describe("goal API adapter", () => {
  beforeEach(() => fetchMock.mockReset());

  it("encodes path IDs and passes cancellation through the existing authenticated client", async () => {
    fetchMock.mockResolvedValue(reply({ goal }));
    const controller = new AbortController();
    await expect(getGoal("team/demo?#", controller.signal)).resolves.toEqual(goal);
    expect(fetchMock).toHaveBeenCalledWith("/api/goals/team%2Fdemo%3F%23", {
      method: "GET", signal: controller.signal,
    });
  });

  it("only treats a domain goal-not-found response as an empty goal", async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: { code: "not_found", message: "Missing" } }, 404));
    await expect(getGoal("demo")).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(reply({ error: "Not Found", message: "Route not found" }, 404));
    await expect(getGoal("demo")).rejects.toMatchObject({ code: "http_error", status: 404 });
    fetchMock.mockResolvedValueOnce(reply({ error: { code: "not_found" } }, 404));
    await expect(getSource("missing")).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("keeps revisions and confirmation in JSON writes and unwraps server-owned progress", async () => {
    const write = { ...goal, confirm: true, expectedRevision: 3, deadline: "2026-11-01T17:30:00+03:00" };
    const { id: _id, revision: _revision, confirmedAt: _confirmedAt, ...input } = write;
    fetchMock.mockResolvedValueOnce(reply({ goal }));
    await saveGoal("demo", input);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/goals/demo", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
    const review = { status: "rejected" as const, expectedRevision: 2, duplicateOfEvidenceId: "other" };
    fetchMock.mockResolvedValueOnce(reply({ evidence: { ...evidence, status: review.status, revision: 3 } }));
    await reviewEvidence("e/1", review);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/evidence/e%2F1", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(review),
    });
    fetchMock.mockResolvedValueOnce(reply({ progress }));
    await expect(getProgress("demo")).resolves.toEqual(progress);
    fetchMock.mockResolvedValueOnce(reply({ evidence: [] }));
    await expect(listEvidence("demo")).resolves.toEqual([]);
  });

  it("preserves text exactly for quote offsets and returns the direct import envelope", async () => {
    fetchMock.mockResolvedValue(reply(result));
    const input = { goalId: "demo", title: "Чат", text: "  Привет 👋\nГотово  " };
    const controller = new AbortController();
    await expect(importText(input, controller.signal)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith("/api/context/import", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, capturedAt: null }), signal: controller.signal,
    });
  });

  it("uploads the original File as raw bytes and encodes timezone and reserved query characters", async () => {
    fetchMock.mockResolvedValue(reply(result));
    const file = new File([new Uint8Array([1, 2, 3])], "note.m4a", { type: "audio/mp4" });
    const controller = new AbortController();
    const input = { goalId: "a&b", title: "Интервью + запись", file, capturedAt: "2026-10-25T13:00:00+03:00" };
    await expect(importAudio(input, controller.signal)).resolves.toEqual(result);
    const [path, init] = fetchMock.mock.calls[0];
    const url = new URL(String(path), "http://localhost");
    expect(url.pathname).toBe("/api/context/audio");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      goalId: input.goalId, title: input.title, capturedAt: input.capturedAt,
    });
    expect(init).toEqual({ method: "POST", headers: { "content-type": "audio/mp4" }, body: file, signal: controller.signal });
    expect(init?.body).toBe(file);
  });

  it("accepts 10 MiB exactly and rejects larger files, empty files and unsupported MIME before sending", async () => {
    fetchMock.mockResolvedValue(reply(result));
    const file = new File([new Uint8Array(MAX_AUDIO_BYTES)], "audio.webm", { type: "audio/webm" });
    await importAudio({ goalId: "demo", title: "Audio", file });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const [invalid, code] of [
      [new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], "large.wav", { type: "audio/wav" }), "file_too_large"],
      [new File([], "empty.wav", { type: "audio/wav" }), "invalid_request"],
      [new File(["text"], "pretend.mp3", { type: "text/plain" }), "unsupported_media_type"],
    ] as const) {
      await expect(importAudio({ goalId: "demo", title: "Audio", file: invalid })).rejects.toMatchObject({ code });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects missing timezone, blank text and oversized input without dispatching", async () => {
    const input = { goalId: "demo", title: "Чат", text: "Готово" };
    for (const overrides of [{ capturedAt: "2026-10-25T13:00:00" }, { text: "\n " }, { text: "a".repeat(50_001) }]) {
      await expect(importText({ ...input, ...overrides })).rejects.toMatchObject({ code: "invalid_request" });
    }
    await expect(saveGoal("demo", {
      title: goal.title, criteria: goal.criteria, confirm: true, expectedRevision: null,
      deadline: "2026-11-01T17:30",
    })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["", " \n\t "])("rejects a blank source title before sending text or audio: %j", async (title) => {
    fetchMock.mockResolvedValue(reply(result));
    const file = new File(["synthetic audio"], "note.wav", { type: "audio/wav" });

    await expect(importText({ goalId: "demo", title, text: "Действие выполнено." }))
      .rejects.toMatchObject({ code: "invalid_request", status: 400 });
    await expect(importAudio({ goalId: "demo", title, file }))
      .rejects.toMatchObject({ code: "invalid_request", status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces provider/conflict codes without leaking upstream messages or stacks", async () => {
    for (const [code, status] of [["stt_unconfigured", 503], ["revision_conflict", 409], ["provider_failed", 502]] as const) {
      fetchMock.mockResolvedValueOnce(reply({ error: { code, message: "SECRET upstream trace", stack: "SECRET" } }, status));
      let thrown: unknown;
      try { await getProgress("demo"); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(GoalsApiError);
      expect(thrown).toMatchObject({ code, status });
      expect((thrown as Error).message).not.toContain("SECRET");
    }
  });

  it("handles an upstream 401 without bypassing auth or adding its own retry", async () => {
    fetchMock.mockResolvedValue(reply({ error: "unauthorized", message: "SECRET" }, 401));
    await expect(getGoal("demo")).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hides HTML error bodies and preserves cancellation", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>SECRET trace</html>", { status: 502 }));
    await expect(getGoal("demo")).rejects.toMatchObject({ code: "http_error", status: 502 });
    const controller = new AbortController();
    const abort = new DOMException("Cancelled", "AbortError");
    controller.abort();
    fetchMock.mockRejectedValueOnce(abort);
    await expect(getGoal("demo", controller.signal)).rejects.toBe(abort);
    fetchMock.mockRejectedValueOnce(new Error("SECRET transport details"));
    await expect(getGoal("demo")).rejects.toMatchObject({ code: "network_error", status: 0 });
  });

  it("preserves cancellation while reading a response body after headers arrive", async () => {
    const controller = new AbortController();
    const abort = new DOMException("Cancelled", "AbortError");
    const response = reply({ goal });
    vi.spyOn(response, "json").mockImplementation(() => new Promise((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(abort), { once: true });
      controller.abort();
    }));
    fetchMock.mockResolvedValueOnce(response);
    await expect(getGoal("demo", controller.signal)).rejects.toBe(abort);

    const responseWithoutSignal = reply({ goal });
    vi.spyOn(responseWithoutSignal, "json").mockRejectedValueOnce(abort);
    fetchMock.mockResolvedValueOnce(responseWithoutSignal);
    await expect(getGoal("demo")).rejects.toBe(abort);
  });

  it("accepts complete source, evidence and nullable progress responses", async () => {
    const audioSource: Source = {
      ...source, kind: "audio", capturedAt: timestamp,
      segments: [{ startMs: 0, endMs: 1200, textStart: 0, textEnd: source.text.length }],
    };
    fetchMock.mockResolvedValueOnce(reply({ source: audioSource }));
    await expect(getSource(source.id)).resolves.toEqual(audioSource);
    const timedEvidence = { ...evidence, startMs: 0, endMs: 1200 };
    fetchMock.mockResolvedValueOnce(reply({ evidence: [timedEvidence] }));
    await expect(listEvidence("demo")).resolves.toEqual([timedEvidence]);
    fetchMock.mockResolvedValueOnce(reply({ progress: { ...progress, nextStep: null } }));
    await expect(getProgress("demo")).resolves.toEqual({ ...progress, nextStep: null });
  });

  it.each([
    {}, { ...goal, revision: "1" }, { ...goal, deadline: undefined },
    { ...goal, confirmedAt: "2026-10-25T13:00:00" },
    { ...goal, criteria: [goal.criteria[0], null] },
    { ...goal, criteria: [{ ...goal.criteria[0], targetCount: "1" }] },
  ])("rejects malformed goal fields and every criterion: %j", async (invalidGoal) => {
    fetchMock.mockResolvedValueOnce(reply({ goal: invalidGoal }));
    await expect(getGoal("demo")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    {}, { ...source, contentHash: undefined }, { ...source, kind: "video" },
    { ...source, capturedAt: undefined }, { ...source, createdAt: "yesterday" },
    { ...source, segments: [null] },
    { ...source, segments: [{ startMs: 0, endMs: 1, textStart: 0, textEnd: "5" }] },
    { ...source, segments: [{ startMs: 20, endMs: 10, textStart: 0, textEnd: 5 }] },
  ])("rejects malformed source fields and transcript segments: %j", async (invalidSource) => {
    fetchMock.mockResolvedValueOnce(reply({ source: invalidSource }));
    await expect(getSource(source.id)).rejects.toMatchObject({ code: "invalid_response" });
    fetchMock.mockResolvedValueOnce(reply({ ...result, source: invalidSource }));
    await expect(importText({ goalId: "demo", title: "Чат", text: source.text }))
      .rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    null, {}, { ...evidence, sourceId: undefined }, { ...evidence, revision: 0 },
    { ...evidence, eventType: ["completed_action"] }, { ...evidence, status: "approved" },
    { ...evidence, quote: 5 }, { ...evidence, textStart: 0.5 },
    { ...evidence, startMs: undefined }, { ...evidence, endMs: "1200" },
  ])("rejects malformed evidence in lists, imports and review responses: %j", async (invalidEvidence) => {
    fetchMock.mockResolvedValueOnce(reply({ evidence: [evidence, invalidEvidence] }));
    await expect(listEvidence("demo")).rejects.toMatchObject({ code: "invalid_response" });
    fetchMock.mockResolvedValueOnce(reply({ ...result, evidence: [evidence, invalidEvidence] }));
    await expect(importText({ goalId: "demo", title: "Чат", text: source.text }))
      .rejects.toMatchObject({ code: "invalid_response" });
    fetchMock.mockResolvedValueOnce(reply({ evidence: invalidEvidence }));
    await expect(reviewEvidence(evidence.id, { status: "confirmed", expectedRevision: 1 }))
      .rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    {}, { ...progress, goalRevision: undefined }, { ...progress, criteria: [null] },
    { ...progress, criteria: [{ ...progress.criteria[0], confirmedCount: "0" }] },
    { ...progress, criteria: [{ ...progress.criteria[0], evidenceIds: ["e1", null] }] },
    { ...progress, nextStep: {} }, { ...progress, nextStep: { ...progress.nextStep, evidenceIds: [false] } },
    { ...progress, nextStep: { ...progress.nextStep, kind: "unknown" } },
  ])("rejects malformed progress rows, IDs and next steps: %j", async (invalidProgress) => {
    fetchMock.mockResolvedValueOnce(reply({ progress: invalidProgress }));
    await expect(getProgress("demo")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("rejects malformed success envelopes instead of treating them as an empty goal/import", async () => {
    fetchMock.mockResolvedValueOnce(reply({}));
    await expect(getGoal("demo")).rejects.toMatchObject({ code: "invalid_response" });
    fetchMock.mockResolvedValueOnce(reply({ evidence: {} }));
    await expect(listEvidence("demo")).rejects.toMatchObject({ code: "invalid_response" });
    fetchMock.mockResolvedValueOnce(reply({ result }));
    await expect(importText({ goalId: "demo", title: "Чат", text: "Готово" }))
      .rejects.toMatchObject({ code: "invalid_response" });
  });
});
