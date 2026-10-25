import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as api from "./api";
import type {
  AudioImportInput, Evidence, Goal, GoalWrite, ImportResult, Progress,
  ReviewEvidenceInput, Source, TextImportInput,
} from "./api";

export type GoalWorkspaceStatus = "loading" | "ready" | "error";
export type GoalWorkspaceBusy = "saving" | "importing" | "reviewing" | null;

export interface GoalWorkspace {
  goal: Goal | null;
  evidence: Evidence[];
  progress: Progress | null;
  source: Source | null;
  selectedEvidenceId: string | null;
  status: GoalWorkspaceStatus;
  busy: GoalWorkspaceBusy;
  error: string | null;
  notice: string | null;
  refresh: () => Promise<void>;
  saveGoal: (input: GoalWrite) => Promise<void>;
  importText: (input: TextImportInput) => Promise<void>;
  importAudio: (input: AudioImportInput) => Promise<void>;
  reviewEvidence: (evidenceId: string, input: ReviewEvidenceInput) => Promise<void>;
  selectEvidence: (id: string | null) => void;
}

interface WorkspaceState extends Omit<GoalWorkspace,
  "refresh" | "saveGoal" | "importText" | "importAudio" | "reviewEvidence" | "selectEvidence"> {
  goalId: string;
  version: number;
}

interface RequestScope {
  active: boolean;
  selectedEvidenceId: string | null;
  load: AbortController | null;
  source: AbortController | null;
  mutation: AbortController | null;
}

function emptyState(goalId: string): WorkspaceState {
  return {
    goalId, version: 0, goal: null, evidence: [], progress: null, source: null,
    selectedEvidenceId: null, status: "loading", busy: null, error: null, notice: null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof api.GoalsApiError
    ? error.message
    : "Не удалось выполнить запрос. Попробуйте снова.";
}

/** Loads server-owned goal state and serializes mutations without computing local progress. */
export function useGoalWorkspace(goalId: string): GoalWorkspace {
  const [state, setState] = useState<WorkspaceState>(() => emptyState(goalId));
  const scope = useMemo<RequestScope>(() => ({
    active: true, selectedEvidenceId: null, load: null, source: null, mutation: null,
  }), [goalId]);
  const latestScope = useRef(scope);
  latestScope.current = scope;
  const isCurrent = useCallback(() => scope.active && latestScope.current === scope, [scope]);

  const reload = useCallback(async (): Promise<boolean> => {
    if (!isCurrent()) return false;
    scope.load?.abort();
    scope.source?.abort();
    const controller = new AbortController();
    scope.load = controller;
    const isLatest = () => isCurrent() && scope.load === controller && !controller.signal.aborted;
    setState((previous) => ({
      ...(previous.goalId === goalId ? previous : emptyState(goalId)),
      status: "loading", error: null, source: null,
    }));
    try {
      const goal = await api.getGoal(goalId, controller.signal);
      if (!isLatest()) return false;
      let evidence: Evidence[] = [];
      let progress: Progress | null = null;
      if (goal !== null) {
        [evidence, progress] = await Promise.all([
          api.listEvidence(goalId, controller.signal),
          api.getProgress(goalId, controller.signal),
        ]);
      }
      if (!isLatest()) return false;
      scope.selectedEvidenceId = evidence.some((item) => item.id === scope.selectedEvidenceId)
        ? scope.selectedEvidenceId : null;
      setState((previous) => ({
        ...previous, goalId, goal, evidence, progress, status: "ready", error: null,
        source: null, version: previous.version + 1,
        selectedEvidenceId: scope.selectedEvidenceId,
      }));
      return true;
    } catch (error) {
      if (isLatest()) {
        setState((previous) => ({ ...previous, status: "error", error: errorMessage(error) }));
      }
      return false;
    }
  }, [goalId, isCurrent, scope]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!isCurrent()) return;
    setState((previous) => ({ ...previous, notice: null }));
    await reload();
  }, [isCurrent, reload]);

  useEffect(() => {
    scope.active = true;
    void refresh();
    return () => {
      scope.active = false;
      scope.load?.abort();
      scope.source?.abort();
      scope.mutation?.abort();
    };
  }, [scope, refresh]);

  // Hide the preceding goal immediately, before the new goal's effect has run.
  const current = state.goalId === goalId ? state : emptyState(goalId);
  const sourceId = current.evidence.find((item) => item.id === current.selectedEvidenceId)?.sourceId;

  useEffect(() => {
    if (!sourceId || !isCurrent()) return;
    const controller = new AbortController();
    scope.source = controller;
    void api.getSource(sourceId, controller.signal).then((source) => {
      if (isCurrent() && scope.source === controller && !controller.signal.aborted) {
        setState((previous) => ({ ...previous, source }));
      }
    }).catch((error: unknown) => {
      if (isCurrent() && scope.source === controller && !controller.signal.aborted) {
        setState((previous) => ({ ...previous, status: "error", error: errorMessage(error) }));
      }
    });
    return () => controller.abort();
  }, [sourceId, current.selectedEvidenceId, current.version, isCurrent, scope]);

  const selectEvidence = useCallback((id: string | null): void => {
    if (!isCurrent()) return;
    const selectedEvidenceId = current.evidence.some((item) => item.id === id) ? id : null;
    if (scope.selectedEvidenceId === selectedEvidenceId) return;
    scope.selectedEvidenceId = selectedEvidenceId;
    scope.source?.abort();
    setState((previous) => ({
      ...previous, source: null, selectedEvidenceId,
    }));
  }, [current.evidence, isCurrent, scope]);

  const mutate = useCallback(async (
    busy: Exclude<GoalWorkspaceBusy, null>,
    operation: (signal: AbortSignal) => Promise<ImportResult | void>,
  ): Promise<void> => {
    // The ref lock also protects multiple clicks within the same React render.
    if (!isCurrent() || scope.mutation !== null) return;
    const controller = new AbortController();
    scope.mutation = controller;
    setState((previous) => ({ ...previous, busy, error: null, notice: null }));
    try {
      const result = await operation(controller.signal);
      if (!isCurrent()) return;
      const refreshed = await reload();
      if (refreshed && isCurrent() && result?.duplicate) {
        setState((previous) => ({
          ...previous, notice: "Этот источник уже импортирован. Повторные события не добавлены.",
        }));
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (busy === "reviewing" && error instanceof api.GoalsApiError && error.code === "revision_conflict") {
        const refreshed = await reload();
        if (!isCurrent()) return;
        setState((previous) => ({
          ...previous, status: "error",
          error: `${error.message} ${refreshed ? "Данные обновлены." : "Не удалось обновить данные. Повторите обновление."}`,
        }));
      } else {
        setState((previous) => ({ ...previous, status: "error", error: errorMessage(error) }));
      }
    } finally {
      if (scope.mutation === controller) {
        scope.mutation = null;
        if (isCurrent()) setState((previous) => ({ ...previous, busy: null }));
      }
    }
  }, [isCurrent, reload, scope]);

  const saveGoal = useCallback((input: GoalWrite): Promise<void> => mutate("saving", async () => {
    await api.saveGoal(goalId, input);
  }), [goalId, mutate]);

  const importText = useCallback((input: TextImportInput): Promise<void> => mutate("importing", (signal) => {
    if (input.goalId !== goalId) throw new api.GoalsApiError("invalid_request", 400);
    return api.importText(input, signal);
  }), [goalId, mutate]);

  const importAudio = useCallback((input: AudioImportInput): Promise<void> => mutate("importing", (signal) => {
    if (input.goalId !== goalId) throw new api.GoalsApiError("invalid_request", 400);
    return api.importAudio(input, signal);
  }), [goalId, mutate]);

  const reviewEvidence = useCallback((evidenceId: string, input: ReviewEvidenceInput): Promise<void> =>
    mutate("reviewing", async () => { await api.reviewEvidence(evidenceId, input); }), [mutate]);

  return {
    goal: current.goal, evidence: current.evidence, progress: current.progress,
    source: current.source, selectedEvidenceId: current.selectedEvidenceId,
    status: current.status, busy: current.busy, error: current.error, notice: current.notice,
    refresh, saveGoal, importText, importAudio, reviewEvidence, selectEvidence,
  };
}
