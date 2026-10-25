import { useState } from "react";

import fixture from "../../../../../../../docs/contracts/demo-fixture.json";
import type { Evidence, Goal, Progress, Source } from "./api";
import GoalWorkspaceView from "./GoalWorkspaceView";
import type { GoalWorkspace } from "./useGoalWorkspace";

const goal = fixture.goal as Goal;
const note = "После интервью повторил precision и recall и исправил ответы в конспекте.";
const reviewSource: Source = {
  id: "preview-source", goalId: goal.id, kind: "text", title: "Заметка после интервью",
  contentHash: "c".repeat(64), text: note, capturedAt: "2026-10-25T13:20:00+03:00",
  createdAt: "2026-10-25T13:20:00+03:00", segments: [],
};
const reviewEvidence: Evidence = {
  id: "preview-evidence", goalId: goal.id, sourceId: reviewSource.id, criterionId: "feedback",
  eventKey: "d".repeat(64), eventType: "completed_action", status: "proposed", revision: 1,
  createdAt: reviewSource.createdAt, summary: "Разобрал обратную связь после интервью",
  quote: note, textStart: 0, textEnd: note.length, startMs: null, endMs: null,
};
const evidence: Evidence[] = [reviewEvidence, ...fixture.evidence as Evidence[]];
const sources: Source[] = [reviewSource, ...fixture.sources as Source[]];

/** Development-only visual review, with synthetic data and no backend or model requests. */
export default function GoalDesignPreview() {
  const [selectedId, setSelectedId] = useState<string | null>(reviewEvidence.id);
  const selectedEvidence = evidence.find((item) => item.id === selectedId);
  const readOnly = async () => {};
  const workspace: GoalWorkspace = {
    goal, evidence, progress: fixture.progress as Progress,
    source: sources.find((source) => source.id === selectedEvidence?.sourceId) ?? null,
    selectedEvidenceId: selectedId, status: "ready", busy: null, error: null,
    notice: null, refresh: readOnly, saveGoal: readOnly, importText: readOnly,
    importAudio: readOnly, reviewEvidence: readOnly, selectEvidence: setSelectedId,
  };
  return <GoalWorkspaceView preview workspace={workspace} onLogout={() => window.location.assign("/")} />;
}
