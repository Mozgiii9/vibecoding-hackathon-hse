import { describe, expect, it } from "vitest";

import type { Evidence, Goal } from "../contracts.js";
import { computeProgress } from "./progress.js";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "demo",
    title: "Подготовиться к собеседованию",
    deadline: null,
    criteria: [
      { id: "cv", description: "Отправить резюме", targetCount: 1, unit: "отправка" },
      { id: "mock", description: "Пройти пробное интервью", targetCount: 2, unit: "интервью" },
    ],
    confirmedAt: "2026-10-25T10:00:00.000Z",
    revision: 3,
    ...overrides,
  };
}

function evidence(id: string, overrides: Partial<Evidence> = {}): Evidence {
  return {
    id,
    goalId: "demo",
    sourceId: "source-1",
    criterionId: "cv",
    eventType: "completed_action",
    eventKey: id,
    summary: "Резюме отправлено",
    quote: "Резюме отправлено",
    textStart: 0,
    textEnd: 17,
    startMs: null,
    endMs: null,
    status: "confirmed",
    revision: 1,
    createdAt: "2026-10-25T10:00:00.000Z",
    ...overrides,
  };
}

describe("computeProgress", () => {
  it("returns the current goal revision and zero progress without evidence", () => {
    const progress = computeProgress(goal(), []);

    expect(progress).toMatchObject({
      goalId: "demo",
      goalRevision: 3,
      criteria: [
        { criterionId: "cv", confirmedCount: 0, targetCount: 1, complete: false, evidenceIds: [] },
        { criterionId: "mock", confirmedCount: 0, targetCount: 2, complete: false, evidenceIds: [] },
      ],
      nextStep: { kind: "rule", evidenceIds: [] },
    });
    expect(progress.nextStep?.text).toContain("Отправить резюме");
    expect(progress.nextStep?.text).toContain("1 отправка");
  });

  it.each(["intention", "obstacle", "uncertain"] as const)(
    "does not count %s even when supplied as confirmed",
    (eventType) => {
      expect(computeProgress(goal(), [evidence("e-1", { eventType })]).criteria[0].confirmedCount).toBe(0);
    },
  );

  it.each(["proposed", "rejected", "disputed"] as const)(
    "does not count completed actions with status %s",
    (status) => {
      expect(computeProgress(goal(), [evidence("e-1", { status })]).criteria[0].confirmedCount).toBe(0);
    },
  );

  it("counts each confirmed eventKey once and exposes the first contributing evidence ID", () => {
    const progress = computeProgress(goal(), [
      evidence("unconfirmed", { status: "proposed", eventKey: "same" }),
      evidence("first", { eventKey: "same" }),
      evidence("duplicate", { eventKey: "same" }),
    ]);

    expect(progress.criteria[0]).toEqual({
      criterionId: "cv",
      confirmedCount: 1,
      targetCount: 1,
      complete: true,
      evidenceIds: ["first"],
    });
  });

  it("deduplicates within each criterion and ignores evidence from another goal or unknown criteria", () => {
    const progress = computeProgress(goal(), [
      evidence("cv", { eventKey: "same" }),
      evidence("mock", { criterionId: "mock", eventKey: "same" }),
      evidence("foreign", { goalId: "other" }),
      evidence("unknown", { criterionId: "missing" }),
    ]);

    expect(progress.criteria.map((criterion) => criterion.confirmedCount)).toEqual([1, 1]);
    expect(progress.criteria.map((criterion) => criterion.evidenceIds)).toEqual([["cv"], ["mock"]]);
  });

  it("preserves actual counts beyond target without capping them", () => {
    const progress = computeProgress(goal(), [evidence("one"), evidence("two"), evidence("three")]);

    expect(progress.criteria[0]).toMatchObject({
      confirmedCount: 3,
      targetCount: 1,
      complete: true,
      evidenceIds: ["one", "two", "three"],
    });
  });

  it("recalculates counts after confirmation, rejection and dispute", () => {
    const item = evidence("one", { status: "proposed" });
    expect(computeProgress(goal(), [item]).criteria[0].confirmedCount).toBe(0);
    item.status = "confirmed";
    expect(computeProgress(goal(), [item]).criteria[0].confirmedCount).toBe(1);
    item.status = "rejected";
    expect(computeProgress(goal(), [item]).criteria[0].confirmedCount).toBe(0);
    item.status = "confirmed";
    expect(computeProgress(goal(), [item]).criteria[0].confirmedCount).toBe(1);
    item.status = "disputed";
    expect(computeProgress(goal(), [item]).criteria[0].confirmedCount).toBe(0);
  });

  it("continues counting a duplicate when its first representative is rejected", () => {
    const first = evidence("first", { eventKey: "same", status: "rejected" });
    const duplicate = evidence("second", { eventKey: "same" });

    expect(computeProgress(goal(), [first, duplicate]).criteria[0]).toMatchObject({
      confirmedCount: 1,
      evidenceIds: ["second"],
    });
  });

  it("selects the first incomplete criterion in goal order with the remaining count", () => {
    const progress = computeProgress(goal(), [
      evidence("cv"),
      evidence("mock-one", { criterionId: "mock" }),
    ]);

    expect(progress.nextStep).toEqual({
      text: "Следующий шаг: Пройти пробное интервью. Осталось: 1 интервью.",
      evidenceIds: ["mock-one"],
      kind: "rule",
    });
  });

  it("selects an earlier incomplete criterion even when a later one has evidence", () => {
    const progress = computeProgress(goal(), [evidence("mock-one", { criterionId: "mock" })]);

    expect(progress.nextStep?.text).toContain("Отправить резюме");
    expect(progress.nextStep?.evidenceIds).toEqual([]);
  });

  it("returns no next step when all criteria are complete", () => {
    expect(computeProgress(goal(), [
      evidence("cv"),
      evidence("mock-one", { criterionId: "mock" }),
      evidence("mock-two", { criterionId: "mock" }),
    ]).nextStep).toBeNull();
    expect(computeProgress(goal({ criteria: [] }), []).nextStep).toBeNull();
  });

  it("does not mutate input or expose mutable input arrays in the result", () => {
    const inputGoal = goal();
    const inputEvidence = [evidence("cv"), evidence("mock", { criterionId: "mock" })];
    const snapshot = JSON.stringify({ inputGoal, inputEvidence });
    const progress = computeProgress(inputGoal, inputEvidence);

    expect(JSON.stringify({ inputGoal, inputEvidence })).toBe(snapshot);
    progress.criteria[1].evidenceIds.push("injected");
    expect(progress.nextStep?.evidenceIds).toEqual(["mock"]);
    expect(JSON.stringify({ inputGoal, inputEvidence })).toBe(snapshot);
  });
});
