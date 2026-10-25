import { createHash } from "node:crypto";
import type { EvidenceDraft, GoalWrite, GoalsStore, SourceDraft } from "../contracts.js";

export function goalWrite(overrides: Partial<GoalWrite> = {}): GoalWrite {
  return {
    title: "Подготовиться к собеседованию", deadline: "2026-11-01T17:30:00+03:00",
    criteria: [
      { id: "cv", description: "Отправить резюме", targetCount: 1, unit: "отправка" },
      { id: "mock", description: "Пройти интервью", targetCount: 2, unit: "интервью" },
    ],
    confirm: true, expectedRevision: null, ...overrides,
  };
}

export function sourceDraft(text = "Резюме получил.", overrides: Partial<SourceDraft> = {}): SourceDraft {
  return {
    kind: "text", title: "Синтетический источник", text, capturedAt: null, segments: [],
    contentHash: createHash("sha256").update("text\0").update(text).digest("hex"), ...overrides,
  };
}

export function evidenceDraft(source: SourceDraft, overrides: Partial<EvidenceDraft> = {}): EvidenceDraft {
  return {
    criterionId: "cv", eventType: "completed_action", summary: "Резюме отправлено",
    quote: source.text, textStart: 0, textEnd: source.text.length,
    startMs: null, endMs: null, ...overrides,
  };
}

export async function importText(
  store: GoalsStore, text = "Резюме получил.", overrides: Partial<EvidenceDraft> = {}, goalId = "demo",
) {
  const goal = await store.getConfirmedGoal(goalId);
  const source = sourceDraft(text);
  return store.commitImport({
    goalId, expectedGoalRevision: goal.revision, source,
    evidence: [evidenceDraft(source, overrides)],
  });
}
