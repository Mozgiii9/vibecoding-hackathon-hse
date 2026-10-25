import { createHash } from "node:crypto";
import { FeatureError, type EvidenceDraft, type Goal, type SourceDraft } from "../contracts.js";
import type { Snapshot } from "./schemas.js";

function invalidEvidence(): never {
  throw new FeatureError("invalid_evidence", 422, "Свидетельство не соответствует цели или источнику");
}

export function eventKeyFor(sourceId: string, draft: EvidenceDraft): string {
  return createHash("sha256").update(JSON.stringify([
    sourceId, draft.criterionId, draft.textStart, draft.textEnd,
  ])).digest("hex");
}

export function validateSource(source: SourceDraft): void {
  if (source.kind === "text") {
    const contentHash = createHash("sha256").update("text\0").update(source.text, "utf8").digest("hex");
    // The shared demo fixture confirms a NUL separator. Never normalize source text.
    if (source.segments.length > 0 || source.contentHash !== contentHash) invalidEvidence();
  }
  for (const segment of source.segments) {
    if (segment.textEnd > source.text.length) invalidEvidence();
  }
}

export function validateDraft(goal: Goal, source: SourceDraft, evidence: EvidenceDraft): void {
  if (!goal.criteria.some((criterion) => criterion.id === evidence.criterionId)) invalidEvidence();
  if (evidence.textEnd <= evidence.textStart || evidence.textEnd > source.text.length
      || source.text.slice(evidence.textStart, evidence.textEnd) !== evidence.quote) invalidEvidence();

  if ((evidence.startMs === null) !== (evidence.endMs === null)) invalidEvidence();
  if (evidence.startMs !== null && evidence.endMs !== null) {
    if (source.kind !== "audio" || evidence.endMs <= evidence.startMs) invalidEvidence();
    // Only real STT segment boundaries may be used as evidence time references.
    const first = source.segments.find((segment) => segment.textStart <= evidence.textStart
      && segment.textEnd > evidence.textStart && segment.startMs === evidence.startMs);
    const last = source.segments.find((segment) => segment.textStart < evidence.textEnd
      && segment.textEnd >= evidence.textEnd && segment.endMs === evidence.endMs);
    if (!first || !last) invalidEvidence();
  }
}

export function uniqueDrafts(goal: Goal, source: SourceDraft, drafts: EvidenceDraft[]): EvidenceDraft[] {
  const byRange = new Map<string, EvidenceDraft>();
  for (const draft of drafts) {
    validateDraft(goal, source, draft);
    const key = JSON.stringify([draft.criterionId, draft.textStart, draft.textEnd]);
    const existing = byRange.get(key);
    if (existing && existing.eventType !== draft.eventType) invalidEvidence();
    if (!existing) byRange.set(key, draft);
  }
  return [...byRange.values()];
}

/** Reject damaged snapshots instead of silently dropping persisted domain data. */
export function validateSnapshot(state: Snapshot): void {
  const goals = new Map(state.goals.map((goal) => [goal.id, goal]));
  const sources = new Map(state.sources.map((source) => [source.id, source]));
  const evidenceIds = new Set(state.evidence.map((evidence) => evidence.id));
  if (goals.size !== state.goals.length || sources.size !== state.sources.length
      || evidenceIds.size !== state.evidence.length) invalidEvidence();

  const imports = new Set<string>();
  for (const source of state.sources) {
    const goal = goals.get(source.goalId);
    if (!goal || !goal.confirmedAt) invalidEvidence();
    const key = JSON.stringify([source.goalId, source.contentHash]);
    if (imports.has(key)) invalidEvidence();
    imports.add(key);
    validateSource(source);
  }

  const ranges = new Set<string>();
  const keyScopes = new Map<string, string>();
  for (const evidence of state.evidence) {
    const goal = goals.get(evidence.goalId);
    const source = sources.get(evidence.sourceId);
    if (!goal || !source || source.goalId !== goal.id) invalidEvidence();
    validateDraft(goal, source, evidence);
    if (evidence.status === "confirmed" && evidence.eventType !== "completed_action") invalidEvidence();
    const range = JSON.stringify([source.id, evidence.criterionId, evidence.textStart, evidence.textEnd]);
    if (ranges.has(range)) invalidEvidence();
    ranges.add(range);
    const scope = JSON.stringify([goal.id, evidence.criterionId]);
    if (keyScopes.has(evidence.eventKey) && keyScopes.get(evidence.eventKey) !== scope) invalidEvidence();
    keyScopes.set(evidence.eventKey, scope);
  }
}
