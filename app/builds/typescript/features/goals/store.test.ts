import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GoalsStore } from "../contracts.js";
import { createGoalsStore } from "./index.js";
import { evidenceDraft, goalWrite, importText, sourceDraft } from "./test-helpers.js";

describe("goals store", () => {
  let memoryRoot: string;
  let store: GoalsStore;
  beforeEach(async () => {
    memoryRoot = await mkdtemp(path.join(os.tmpdir(), "goals-core-"));
    store = await createGoalsStore({ memoryRoot });
  });
  afterEach(async () => { await rm(memoryRoot, { recursive: true, force: true }); });

  it("creates revision 1, sets server confirmation and reloads it", async () => {
    const before = Date.now();
    const goal = await store.saveGoal("demo", goalWrite());
    expect(goal.revision).toBe(1);
    expect(Date.parse(goal.confirmedAt!)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(goal.confirmedAt!)).toBeLessThanOrEqual(Date.now());
    const reloaded = await createGoalsStore({ memoryRoot });
    expect(await reloaded.getGoal("demo")).toEqual(goal);
  });

  it("returns null internally and 404 errors for operations on absent objects", async () => {
    expect(await store.getGoal("absent")).toBeNull();
    expect(await store.getSource("absent")).toBeNull();
    for (const operation of [
      () => store.getConfirmedGoal("absent"), () => store.listEvidence("absent"),
      () => store.getProgress("absent"), () => store.findImport("absent", "a".repeat(64)),
      () => store.reviewEvidence("absent", { status: "confirmed", expectedRevision: 1 }),
    ]) await expect(operation()).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("requires explicit confirmation before import", async () => {
    await store.saveGoal("demo", goalWrite({ confirm: false }));
    await expect(store.getConfirmedGoal("demo")).rejects.toMatchObject({ code: "goal_unconfirmed" });
    const source = sourceDraft();
    await expect(store.commitImport({
      goalId: "demo", expectedGoalRevision: 1, source, evidence: [evidenceDraft(source)],
    })).rejects.toMatchObject({ code: "goal_unconfirmed" });
    expect(await store.findImport("demo", source.contentHash)).toBeNull();
    const goal = await store.saveGoal("demo", goalWrite({ expectedRevision: 1 }));
    expect(goal.revision).toBe(2);
    expect(goal.confirmedAt).not.toBeNull();
  });

  it("uses optimistic revisions for creation and editing", async () => {
    await expect(store.saveGoal("demo", goalWrite({ expectedRevision: 1 })))
      .rejects.toMatchObject({ code: "revision_conflict" });
    await store.saveGoal("demo", goalWrite());
    await expect(store.saveGoal("demo", goalWrite()))
      .rejects.toMatchObject({ code: "revision_conflict" });
    const changed = await store.saveGoal("demo", goalWrite({ expectedRevision: 1, title: "Новая цель" }));
    expect(changed.revision).toBe(2);
    await expect(store.saveGoal("demo", goalWrite({ expectedRevision: 1 })))
      .rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("allows exactly one of two concurrent edits with the same expected revision", async () => {
    await store.saveGoal("demo", goalWrite());
    const results = await Promise.allSettled([
      store.saveGoal("demo", goalWrite({ expectedRevision: 1, title: "Первый" })),
      store.saveGoal("demo", goalWrite({ expectedRevision: 1, title: "Второй" })),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(await store.getGoal("demo")).toMatchObject({ title: "Первый", revision: 2 });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])(
    "rejects unsafe or nonpositive targetCount %s", async (targetCount) => {
      const input = goalWrite();
      input.criteria[0].targetCount = targetCount;
      await expect(store.saveGoal("demo", input)).rejects.toMatchObject({ code: "invalid_request" });
      expect(await store.getGoal("demo")).toBeNull();
    },
  );

  it("accepts safe large counts and rejects duplicated criterion IDs", async () => {
    const input = goalWrite();
    input.criteria[0].targetCount = Number.MAX_SAFE_INTEGER;
    expect((await store.saveGoal("large", input)).criteria[0].targetCount).toBe(Number.MAX_SAFE_INTEGER);
    input.criteria[1].id = input.criteria[0].id;
    await expect(store.saveGoal("demo", input)).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("validates timestamps, confirmation flag, empty criteria, IDs and unknown fields", async () => {
    for (const input of [
      { ...goalWrite(), deadline: "2026-11-01" }, { ...goalWrite(), confirm: "true" },
      { ...goalWrite(), criteria: [] }, { ...goalWrite(), title: "   " },
      { ...goalWrite(), confirmedCount: 100 },
    ]) await expect(store.saveGoal("demo", input as never)).rejects.toMatchObject({ code: "invalid_request" });
    await expect(store.saveGoal(" ", goalWrite())).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("keeps IDs as data and returns defensive copies", async () => {
    const input = goalWrite();
    const goal = await store.saveGoal("../../escape", input);
    input.criteria[0].description = "mutated input";
    goal.criteria[0].description = "mutated response";
    expect((await store.getGoal("../../escape"))!.criteria[0].description).toBe("Отправить резюме");
    await store.saveGoal("__proto__", goalWrite());
    expect(await readdir(memoryRoot)).toEqual(["hackathon"]);
    expect(await readdir(path.join(memoryRoot, "hackathon"))).toEqual(["state.json"]);
  });

  it("persists source and proposed evidence together; progress needs confirmation", async () => {
    await store.saveGoal("demo", goalWrite());
    const result = await importText(store);
    expect(result).toMatchObject({ duplicate: false, evidence: [{ status: "proposed", revision: 1 }] });
    const entry = result.evidence[0];
    expect(entry.eventKey).toBe(createHash("sha256").update(JSON.stringify([
      result.source.id, entry.criterionId, entry.textStart, entry.textEnd,
    ])).digest("hex"));
    expect((await store.getProgress("demo")).criteria[0].confirmedCount).toBe(0);
    await store.reviewEvidence(entry.id, { status: "confirmed", expectedRevision: 1 });
    const reloaded = await createGoalsStore({ memoryRoot });
    expect(await reloaded.getSource(result.source.id)).toEqual(result.source);
    expect((await reloaded.getProgress("demo")).criteria[0].confirmedCount).toBe(1);
  });

  it.each(["intention", "obstacle", "uncertain"] as const)("cannot confirm %s", async (eventType) => {
    await store.saveGoal("demo", goalWrite());
    const result = await importText(store, "Завтра хочу отправить резюме.", { eventType });
    await expect(store.reviewEvidence(result.evidence[0].id, { status: "confirmed", expectedRevision: 1 }))
      .rejects.toMatchObject({ code: "invalid_evidence", statusCode: 422 });
    expect((await store.listEvidence("demo"))[0].revision).toBe(1);
  });

  it("decreases progress on rejection/dispute and rejects stale reviews", async () => {
    await store.saveGoal("demo", goalWrite());
    const { evidence: [entry] } = await importText(store);
    await store.reviewEvidence(entry.id, { status: "confirmed", expectedRevision: 1 });
    await expect(store.reviewEvidence(entry.id, { status: "rejected", expectedRevision: 1 }))
      .rejects.toMatchObject({ code: "revision_conflict" });
    await store.reviewEvidence(entry.id, { status: "disputed", expectedRevision: 2 });
    expect((await store.getProgress("demo")).criteria[0].confirmedCount).toBe(0);
    await store.reviewEvidence(entry.id, { status: "confirmed", expectedRevision: 3 });
    await store.reviewEvidence(entry.id, { status: "rejected", expectedRevision: 4 });
    expect((await store.getProgress("demo")).criteria[0].confirmedCount).toBe(0);
    const reloaded = await createGoalsStore({ memoryRoot });
    expect((await reloaded.listEvidence("demo"))[0]).toMatchObject({ status: "rejected", revision: 5 });
  });

  it.each(["confirmed", "rejected"] as const)("reimport preserves %s, IDs and first title", async (status) => {
    await store.saveGoal("demo", goalWrite());
    const first = await importText(store);
    await store.reviewEvidence(first.evidence[0].id, { status, expectedRevision: 1 });
    const source = sourceDraft(undefined, { title: "Другой заголовок", capturedAt: "2026-10-25T14:00:00+03:00" });
    const repeat = await store.commitImport({
      goalId: "demo", expectedGoalRevision: 1, source, evidence: [evidenceDraft(source)],
    });
    expect(repeat).toMatchObject({
      duplicate: true, source: first.source,
      evidence: [{ id: first.evidence[0].id, status, revision: 2 }],
    });
    expect(await store.findImport("demo", source.contentHash)).toEqual(repeat);
  });

  it("parallel imports produce one source and one set of IDs", async () => {
    await store.saveGoal("demo", goalWrite());
    const results = await Promise.all(Array.from({ length: 8 }, () => importText(store)));
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(new Set(results.map((result) => result.source.id)).size).toBe(1);
    expect(new Set(results.map((result) => result.evidence[0].id)).size).toBe(1);
    expect(await store.listEvidence("demo")).toHaveLength(1);
  });

  it("serializes confirmation and reimport without resetting review", async () => {
    await store.saveGoal("demo", goalWrite());
    const first = await importText(store);
    const [review, repeat] = await Promise.all([
      store.reviewEvidence(first.evidence[0].id, { status: "confirmed", expectedRevision: 1 }),
      importText(store),
    ]);
    expect(repeat.evidence).toEqual([review]);
    expect((await store.getProgress("demo")).criteria[0].confirmedCount).toBe(1);
  });

  it("goal revision changes invalidate in-flight extraction without committing its source", async () => {
    const goal = await store.saveGoal("demo", goalWrite());
    await store.saveGoal("demo", goalWrite({ title: "Уточнённая цель", expectedRevision: goal.revision }));
    const source = sourceDraft();
    await expect(store.commitImport({
      goalId: "demo", expectedGoalRevision: goal.revision, source, evidence: [evidenceDraft(source)],
    })).rejects.toMatchObject({ code: "goal_changed", statusCode: 409 });
    expect(await store.findImport("demo", source.contentHash)).toBeNull();
    expect(await store.listEvidence("demo")).toEqual([]);
  });

  it("locks the entire goal after even an import with no evidence; identical PUT is a no-op", async () => {
    await store.saveGoal("demo", goalWrite());
    const source = sourceDraft();
    await store.commitImport({ goalId: "demo", expectedGoalRevision: 1, source, evidence: [] });
    const identical = await store.saveGoal("demo", goalWrite({ expectedRevision: 1 }));
    expect(identical.revision).toBe(1);
    for (const change of [{ title: "Другая цель" }, { confirm: false }, { criteria: [goalWrite().criteria[0]] }]) {
      await expect(store.saveGoal("demo", goalWrite({ expectedRevision: 1, ...change })))
        .rejects.toMatchObject({ code: "goal_locked" });
    }
  });

  it("deduplicates identical proposals and rejects conflicting types for the same range", async () => {
    await store.saveGoal("demo", goalWrite());
    const source = sourceDraft();
    const draft = evidenceDraft(source);
    await expect(store.commitImport({
      goalId: "demo", expectedGoalRevision: 1, source,
      evidence: [draft, { ...draft, eventType: "intention" }],
    })).rejects.toMatchObject({ code: "invalid_evidence" });
    expect(await store.findImport("demo", source.contentHash)).toBeNull();
    const result = await store.commitImport({
      goalId: "demo", expectedGoalRevision: 1, source, evidence: [draft, draft],
    });
    expect(result.evidence).toHaveLength(1);
  });

  it("revalidates every quote and criterion without partial source commits", async () => {
    await store.saveGoal("demo", goalWrite());
    const source = sourceDraft();
    const draft = evidenceDraft(source);
    for (const invalid of [
      { quote: "Поддельная цитата" }, { criterionId: "unknown" }, { textStart: 0.5 },
      { textEnd: source.text.length + 1 }, { textStart: 2, textEnd: 1 },
      { startMs: 0, endMs: null }, { startMs: 0, endMs: 100 },
      { status: "confirmed" },
    ]) {
      await expect(store.commitImport({
        goalId: "demo", expectedGoalRevision: 1, source, evidence: [draft, { ...draft, ...invalid }],
      })).rejects.toMatchObject({ code: "invalid_evidence" });
      expect(await store.findImport("demo", source.contentHash)).toBeNull();
    }
  });

  it("checks text hashes without normalization and uses UTF-16 offsets", async () => {
    await store.saveGoal("demo", goalWrite());
    const source = sourceDraft("🙂 Резюме получил.  ");
    const quote = "Резюме получил.";
    const draft = evidenceDraft(source, { quote, textStart: 3, textEnd: 3 + quote.length });
    await expect(store.commitImport({
      goalId: "demo", expectedGoalRevision: 1, source: { ...source, contentHash: "a".repeat(64) }, evidence: [draft],
    })).rejects.toMatchObject({ code: "invalid_evidence" });
    const result = await store.commitImport({ goalId: "demo", expectedGoalRevision: 1, source, evidence: [draft] });
    expect(result.source.text).toBe(source.text);
    expect(result.evidence[0].quote).toBe(quote);
  });

  it("uses only supplied STT segment boundaries; missing timecodes remain null", async () => {
    await store.saveGoal("demo", goalWrite());
    const source = sourceDraft("Провели интервью.", {
      kind: "audio", contentHash: "a".repeat(64),
      segments: [{ startMs: 100, endMs: 1700, textStart: 0, textEnd: 17 }],
    });
    const draft = evidenceDraft(source, { criterionId: "mock", startMs: 100, endMs: 1700 });
    await expect(store.commitImport({
      goalId: "demo", expectedGoalRevision: 1, source, evidence: [{ ...draft, endMs: 1500 }],
    })).rejects.toMatchObject({ code: "invalid_evidence" });
    const result = await store.commitImport({ goalId: "demo", expectedGoalRevision: 1, source, evidence: [draft] });
    expect(result.evidence[0]).toMatchObject({ startMs: 100, endMs: 1700 });
    const plain = { ...source, contentHash: "b".repeat(64), segments: [] };
    const noSegments = await store.commitImport({
      goalId: "demo", expectedGoalRevision: 1, source: plain,
      evidence: [{ ...draft, startMs: null, endMs: null }],
    });
    expect(noSegments.evidence[0].startMs).toBeNull();
  });

  it("counts manually merged confirmed events only once, including after reload", async () => {
    await store.saveGoal("demo", goalWrite());
    const first = (await importText(store, "Резюме получил.")).evidence[0];
    const second = (await importText(store, "Подтверждаю получение резюме.")).evidence[0];
    await store.reviewEvidence(first.id, { status: "confirmed", expectedRevision: 1 });
    await store.reviewEvidence(second.id, { status: "confirmed", expectedRevision: 1 });
    expect((await store.getProgress("demo")).criteria[0].confirmedCount).toBe(2);
    const merged = await store.reviewEvidence(second.id, {
      status: "confirmed", expectedRevision: 2, duplicateOfEvidenceId: first.id,
    });
    expect(merged.eventKey).toBe(first.eventKey);
    expect((await store.getProgress("demo")).criteria[0].confirmedCount).toBe(1);
    const reloaded = await createGoalsStore({ memoryRoot });
    expect((await reloaded.getProgress("demo")).criteria[0].confirmedCount).toBe(1);
  });

  it("manual merge keeps requested review status and rejects cross-goal/criterion/self targets", async () => {
    await store.saveGoal("demo", goalWrite());
    await store.saveGoal("other", goalWrite());
    const first = (await importText(store)).evidence[0];
    const second = (await importText(store, "Повторное сообщение.")).evidence[0];
    const foreign = (await importText(store, "Другой проект.", {}, "other")).evidence[0];
    const differentCriterion = (await importText(store, "Интервью прошло.", { criterionId: "mock" })).evidence[0];
    for (const target of [first.id, foreign.id, differentCriterion.id]) {
      await expect(store.reviewEvidence(first.id, {
        status: "proposed", expectedRevision: 1, duplicateOfEvidenceId: target,
      })).rejects.toMatchObject({ code: "invalid_evidence" });
    }
    await expect(store.reviewEvidence(first.id, {
      status: "proposed", expectedRevision: 1, duplicateOfEvidenceId: "missing",
    })).rejects.toMatchObject({ code: "not_found" });
    const merged = await store.reviewEvidence(second.id, {
      status: "proposed", expectedRevision: 1, duplicateOfEvidenceId: first.id,
    });
    expect(merged).toMatchObject({ eventKey: first.eventKey, status: "proposed", revision: 2 });
    expect((await store.getProgress("demo")).criteria[0].confirmedCount).toBe(0);
  });

  it("the same content imported for another goal has its own source/evidence IDs", async () => {
    await store.saveGoal("demo", goalWrite());
    await store.saveGoal("other", goalWrite());
    const first = await importText(store);
    const other = await importText(store, undefined, {}, "other");
    expect(other.duplicate).toBe(false);
    expect(other.source.id).not.toBe(first.source.id);
    expect(other.evidence[0].id).not.toBe(first.evidence[0].id);
  });

  it("failed atomic rename publishes no source/evidence and the queue recovers", async () => {
    await store.saveGoal("demo", goalWrite());
    const directory = path.join(memoryRoot, "hackathon");
    const filename = path.join(directory, "state.json");
    const before = await readFile(filename, "utf8");
    await rename(filename, path.join(directory, "previous.json"));
    await mkdir(filename);
    await expect(importText(store)).rejects.toThrow();
    expect(await store.listEvidence("demo")).toEqual([]);
    expect(await store.findImport("demo", sourceDraft().contentHash)).toBeNull();
    expect(await readFile(path.join(directory, "previous.json"), "utf8")).toBe(before);
    expect((await readdir(directory)).some((name) => name.endsWith(".tmp"))).toBe(false);
    await rm(filename, { recursive: true });
    await rename(path.join(directory, "previous.json"), filename);
    expect(await (await createGoalsStore({ memoryRoot })).listEvidence("demo")).toEqual([]);
    const result = await importText(store);
    expect(result.duplicate).toBe(false);
  });

  it("rejects invalid JSON/schema/references at startup rather than resetting memory", async () => {
    const directory = path.join(memoryRoot, "hackathon");
    await mkdir(directory);
    for (const contents of ["broken", JSON.stringify({ version: 2 }), JSON.stringify({
      version: 1, goals: [], evidence: [], sources: [{
        ...sourceDraft(), id: "source", goalId: "absent", createdAt: "2026-10-25T13:00:00Z",
      }],
    })]) {
      await writeFile(path.join(directory, "state.json"), contents);
      await expect(createGoalsStore({ memoryRoot })).rejects.toThrow();
      expect(await readFile(path.join(directory, "state.json"), "utf8")).toBe(contents);
    }
  });
});
