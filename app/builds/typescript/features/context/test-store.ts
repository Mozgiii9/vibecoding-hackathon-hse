/** In-memory port fake used only by context tests, never by application wiring. */
import { FeatureError, type ContextStore, type Goal, type ImportResult } from "../contracts.js";

export const goal: Goal = {
  id: "demo", title: "Подготовиться к ML-собеседованию", deadline: null,
  confirmedAt: "2026-10-25T10:00:00Z", revision: 1,
  criteria: [
    { id: "cv", description: "Отправить резюме", targetCount: 1, unit: "отправка" },
    { id: "mock", description: "Пробные интервью", targetCount: 2, unit: "интервью" },
    { id: "feedback", description: "Внести правки", targetCount: 1, unit: "правка" },
  ],
};

export function createTestStore(): ContextStore {
  const imports = new Map<string, ImportResult>();
  let nextId = 1;
  return {
    async getConfirmedGoal(goalId) {
      if (goalId !== goal.id) throw new FeatureError("not_found", 404, "Цель не найдена");
      return structuredClone(goal);
    },
    async findImport(goalId, hash) {
      return imports.get(JSON.stringify([goalId, hash])) ?? null;
    },
    async commitImport(input) {
      const key = JSON.stringify([input.goalId, input.source.contentHash]);
      const existing = imports.get(key);
      if (existing) return { ...existing, duplicate: true };
      if (input.expectedGoalRevision !== goal.revision) throw new FeatureError("goal_changed", 409, "Цель изменилась");
      const sourceId = `source-${nextId++}`;
      const createdAt = "2026-10-25T10:00:00Z";
      const result: ImportResult = {
        source: { ...input.source, id: sourceId, goalId: input.goalId, createdAt },
        evidence: input.evidence.map((draft, index) => ({
          ...draft, id: `${sourceId}-evidence-${index}`, sourceId, goalId: input.goalId,
          eventKey: `${sourceId}-${index}`, status: "proposed", revision: 1, createdAt,
        })),
        duplicate: false,
      };
      imports.set(key, result);
      return result;
    },
  };
}
