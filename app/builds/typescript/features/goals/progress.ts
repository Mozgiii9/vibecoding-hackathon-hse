import type { Evidence, Goal, Progress } from "../contracts.js";

/** Recompute progress using one confirmed evidence representative per eventKey. */
export function computeProgress(goal: Goal, evidence: Evidence[]): Progress {
  const criteria = goal.criteria.map((criterion) => {
    const events = new Map<string, string>();
    for (const item of evidence) {
      if (
        item.goalId === goal.id
        && item.criterionId === criterion.id
        && item.status === "confirmed"
        && item.eventType === "completed_action"
        && !events.has(item.eventKey)
      ) {
        // Keep the first contributing ID so duplicate records do not imply extra progress.
        events.set(item.eventKey, item.id);
      }
    }

    return {
      criterionId: criterion.id,
      confirmedCount: events.size,
      targetCount: criterion.targetCount,
      complete: events.size >= criterion.targetCount,
      evidenceIds: [...events.values()],
    };
  });

  const nextIndex = criteria.findIndex((criterion) => !criterion.complete);
  const nextStep: Progress["nextStep"] = nextIndex === -1 ? null : {
    text: `Следующий шаг: ${goal.criteria[nextIndex].description}. Осталось: ${criteria[nextIndex].targetCount - criteria[nextIndex].confirmedCount} ${goal.criteria[nextIndex].unit}.`,
    evidenceIds: [...criteria[nextIndex].evidenceIds],
    kind: "rule",
  };

  return { goalId: goal.id, goalRevision: goal.revision, criteria, nextStep };
}
