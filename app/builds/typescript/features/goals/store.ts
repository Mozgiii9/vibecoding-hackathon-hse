import { randomUUID } from "node:crypto";
import {
  FeatureError,
  type Evidence,
  type GoalsStore,
  type Goal,
  type GoalWrite,
  type ImportResult,
} from "../contracts.js";
import { computeProgress } from "./progress.js";
import {
  goalWriteSchema, idSchema, importSchema, parseInput, reviewSchema, type Snapshot,
} from "./schemas.js";
import { readSnapshot, writeSnapshot } from "./storage.js";
import { eventKeyFor, uniqueDrafts, validateSource } from "./validation.js";

function notFound(): never {
  throw new FeatureError("not_found", 404, "Объект не найден");
}

function requireGoal(state: Snapshot, goalId: string): Goal {
  return state.goals.find((goal) => goal.id === goalId) ?? notFound();
}

function requireConfirmedGoal(state: Snapshot, goalId: string): Goal {
  const goal = requireGoal(state, goalId);
  if (!goal.confirmedAt) {
    throw new FeatureError("goal_unconfirmed", 409, "Сначала подтвердите цель");
  }
  return goal;
}

function findExistingImport(state: Snapshot, goalId: string, hash: string): ImportResult | null {
  const source = state.sources.find((entry) => entry.goalId === goalId && entry.contentHash === hash);
  if (!source) return null;
  return { source, evidence: state.evidence.filter((entry) => entry.sourceId === source.id), duplicate: true };
}

function sameGoal(goal: Goal, input: GoalWrite): boolean {
  return goal.title === input.title && goal.deadline === input.deadline
    && JSON.stringify(goal.criteria) === JSON.stringify(input.criteria)
    && Boolean(goal.confirmedAt) === input.confirm;
}

function assertRevision(actual: number, expected: number | null): void {
  if (actual !== expected) {
    throw new FeatureError("revision_conflict", 409, "Версия устарела, обновите данные");
  }
}

type Mutation<T> = { value: T; changed: boolean };

/** One store owns this memoryRoot in one gateway process; all mutations share a queue. */
export async function createGoalsStore(options: { memoryRoot: string }): Promise<GoalsStore> {
  let state = await readSnapshot(options.memoryRoot);
  let pending: Promise<void> = Promise.resolve();

  function mutate<T>(operation: (next: Snapshot) => Mutation<T>): Promise<T> {
    const result = pending.then(async () => {
      const next = structuredClone(state);
      const outcome = operation(next);
      if (outcome.changed) {
        await writeSnapshot(options.memoryRoot, next);
        state = next;
      }
      return structuredClone(outcome.value);
    });
    // A rejected mutation must not poison the queue or publish its draft state.
    pending = result.then(() => undefined, () => undefined);
    return result;
  }

  async function read<T>(operation: (current: Snapshot) => T): Promise<T> {
    await pending;
    return structuredClone(operation(state));
  }

  return {
    async getGoal(goalId) {
      const id = parseInput(idSchema, goalId);
      return read((current) => current.goals.find((goal) => goal.id === id) ?? null);
    },

    async getConfirmedGoal(goalId) {
      const id = parseInput(idSchema, goalId);
      return read((current) => requireConfirmedGoal(current, id));
    },

    async saveGoal(goalId, input) {
      const id = parseInput(idSchema, goalId);
      const write = parseInput(goalWriteSchema, input);
      return mutate((next) => {
        const previous = next.goals.find((goal) => goal.id === id);
        if (!previous) {
          if (write.expectedRevision !== null) {
            throw new FeatureError("revision_conflict", 409, "Для новой цели expectedRevision должен быть null");
          }
          const goal: Goal = {
            id, title: write.title, deadline: write.deadline, criteria: write.criteria,
            revision: 1, confirmedAt: write.confirm ? new Date().toISOString() : null,
          };
          next.goals.push(goal);
          return { value: goal, changed: true };
        }

        assertRevision(previous.revision, write.expectedRevision);
        if (sameGoal(previous, write)) return { value: previous, changed: false };
        if (next.sources.some((source) => source.goalId === id)) {
          throw new FeatureError("goal_locked", 409, "После импорта изменение цели недоступно");
        }
        const goal: Goal = {
          id, title: write.title, deadline: write.deadline, criteria: write.criteria,
          revision: previous.revision + 1,
          confirmedAt: write.confirm ? previous.confirmedAt ?? new Date().toISOString() : null,
        };
        next.goals[next.goals.indexOf(previous)] = goal;
        return { value: goal, changed: true };
      });
    },

    async getSource(sourceId) {
      const id = parseInput(idSchema, sourceId);
      return read((current) => current.sources.find((source) => source.id === id) ?? null);
    },

    async listEvidence(goalId) {
      const id = parseInput(idSchema, goalId);
      return read((current) => {
        requireGoal(current, id);
        return current.evidence.filter((entry) => entry.goalId === id);
      });
    },

    async findImport(goalId, contentHash) {
      const id = parseInput(idSchema, goalId);
      return read((current) => {
        requireGoal(current, id);
        return findExistingImport(current, id, contentHash);
      });
    },

    async commitImport(input) {
      const parsed = parseInput(importSchema, input, true);
      return mutate((next) => {
        const goal = requireConfirmedGoal(next, parsed.goalId);
        const existing = findExistingImport(next, goal.id, parsed.source.contentHash);
        // A repeat returns current review statuses, including when provider calls raced.
        if (existing) return { value: existing, changed: false };
        if (goal.revision !== parsed.expectedGoalRevision) {
          throw new FeatureError("goal_changed", 409, "Цель изменилась, повторите обработку");
        }
        validateSource(parsed.source);
        const drafts = uniqueDrafts(goal, parsed.source, parsed.evidence);
        const createdAt = new Date().toISOString();
        const source = { ...parsed.source, id: randomUUID(), goalId: goal.id, createdAt };
        const evidence: Evidence[] = drafts.map((draft) => ({
          ...draft, id: randomUUID(), goalId: goal.id, sourceId: source.id,
          eventKey: eventKeyFor(source.id, draft), status: "proposed", revision: 1, createdAt,
        }));
        next.sources.push(source);
        next.evidence.push(...evidence);
        return { value: { source, evidence, duplicate: false }, changed: true };
      });
    },

    async reviewEvidence(evidenceId, input) {
      const id = parseInput(idSchema, evidenceId);
      const review = parseInput(reviewSchema, input);
      return mutate((next) => {
        const evidence = next.evidence.find((entry) => entry.id === id) ?? notFound();
        assertRevision(evidence.revision, review.expectedRevision);
        if (review.status === "confirmed" && evidence.eventType !== "completed_action") {
          throw new FeatureError("invalid_evidence", 422, "Подтвердить можно только выполненное действие");
        }

        let eventKey = evidence.eventKey;
        if (review.duplicateOfEvidenceId !== undefined) {
          const target = next.evidence.find((entry) => entry.id === review.duplicateOfEvidenceId) ?? notFound();
          if (target.id === evidence.id || target.goalId !== evidence.goalId
              || target.criterionId !== evidence.criterionId) {
            throw new FeatureError("invalid_evidence", 422, "Дубликат должен относиться к той же цели и критерию");
          }
          eventKey = target.eventKey;
        }

        if (evidence.status === review.status && evidence.eventKey === eventKey) {
          return { value: evidence, changed: false };
        }
        evidence.status = review.status;
        evidence.eventKey = eventKey;
        evidence.revision += 1;
        return { value: evidence, changed: true };
      });
    },

    async getProgress(goalId) {
      const id = parseInput(idSchema, goalId);
      return read((current) => computeProgress(requireGoal(current, id), current.evidence));
    },
  };
}
