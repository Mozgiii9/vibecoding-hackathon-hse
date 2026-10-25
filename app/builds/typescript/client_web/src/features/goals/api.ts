import { authenticatedFetch } from "../../api/auth-adapter";
import type {
  Evidence, FeatureErrorCode, Goal, GoalsStore, GoalWrite, ImportResult, Progress, Source,
} from "../../../../features/contracts";

export type { Evidence, Goal, GoalWrite, ImportResult, Progress, Source };
export type ReviewEvidenceInput = Parameters<GoalsStore["reviewEvidence"]>[1];
export interface TextImportInput {
  goalId: string;
  title: string;
  text: string;
  capturedAt?: string | null;
}
export interface AudioImportInput {
  goalId: string;
  title: string;
  file: File;
  capturedAt?: string | null;
}

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const AUDIO_MIME_TYPES = ["audio/wav", "audio/mpeg", "audio/mp4", "audio/webm"] as const;
type ApiErrorCode = FeatureErrorCode | "unauthorized" | "http_error" | "invalid_response" | "network_error";

const errorMessages: Record<ApiErrorCode, string> = {
  invalid_request: "Проверьте заполненные поля и дату с часовым поясом.",
  forbidden: "Недостаточно прав.",
  not_found: "Запись не найдена.",
  goal_unconfirmed: "Сначала подтвердите цель и критерии.",
  goal_changed: "Цель изменилась. Обновите данные и повторите обработку.",
  goal_locked: "После импорта контекста цель нельзя изменить.",
  revision_conflict: "Запись уже изменена. Обновите данные перед повтором.",
  invalid_evidence: "Это событие нельзя подтвердить в выбранном состоянии.",
  provider_unconfigured: "Модель ещё не настроена на сервере.",
  provider_timeout: "Модель не ответила вовремя. Попробуйте снова.",
  provider_failed: "Не удалось обработать источник. Попробуйте снова.",
  stt_unconfigured: "Распознавание речи ещё не настроено. Используйте текст.",
  file_too_large: "Размер аудио не должен превышать 10 МиБ.",
  unsupported_media_type: "Выберите аудио WAV, MP3, M4A или WebM.",
  unauthorized: "Сессия истекла. Войдите снова.",
  http_error: "Сервер не смог выполнить запрос.",
  invalid_response: "Сервер вернул неожиданный ответ.",
  network_error: "Не удалось связаться с сервером.",
};

/** Stable errors for UI states; raw upstream payloads and stack traces stay out of messages. */
export class GoalsApiError extends Error {
  constructor(public readonly code: ApiErrorCode, public readonly status: number) {
    super(errorMessages[code]);
    this.name = "GoalsApiError";
  }
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    && Number.isFinite(Date.parse(value));
}

function validateTimestamp(value: string | null | undefined): void {
  if (value != null && !isTimestamp(value)) throw new GoalsApiError("invalid_request", 400);
}

function encodedId(value: string): string {
  if (!value.trim()) throw new GoalsApiError("invalid_request", 400);
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCount(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isId);
}

function isGoal(value: unknown): value is Goal {
  return isRecord(value) && isId(value.id) && typeof value.title === "string"
    && (value.deadline === null || isTimestamp(value.deadline))
    && (value.confirmedAt === null || isTimestamp(value.confirmedAt)) && isCount(value.revision, 1)
    && Array.isArray(value.criteria) && value.criteria.every((criterion: unknown) =>
      isRecord(criterion) && isId(criterion.id) && typeof criterion.description === "string"
      && isCount(criterion.targetCount, 1) && typeof criterion.unit === "string");
}

function isSource(value: unknown): value is Source {
  return isRecord(value) && isId(value.id) && isId(value.goalId)
    && (value.kind === "text" || value.kind === "audio") && typeof value.title === "string"
    && isId(value.contentHash) && typeof value.text === "string" && isTimestamp(value.createdAt)
    && (value.capturedAt === null || isTimestamp(value.capturedAt))
    && Array.isArray(value.segments) && value.segments.every((segment: unknown) =>
      isRecord(segment) && isTime(segment.startMs) && isTime(segment.endMs) && segment.endMs >= segment.startMs
      && isCount(segment.textStart) && isCount(segment.textEnd) && segment.textEnd >= segment.textStart);
}

function isEvidence(value: unknown): value is Evidence {
  return isRecord(value) && isId(value.id) && isId(value.goalId) && isId(value.sourceId)
    && isId(value.criterionId) && isId(value.eventKey) && isCount(value.revision, 1)
    && isTimestamp(value.createdAt) && typeof value.summary === "string" && typeof value.quote === "string"
    && typeof value.eventType === "string" && ["completed_action", "intention", "obstacle", "uncertain"].includes(value.eventType)
    && typeof value.status === "string" && ["proposed", "confirmed", "rejected", "disputed"].includes(value.status)
    && isCount(value.textStart) && isCount(value.textEnd) && value.textEnd >= value.textStart
    && (value.startMs === null || isTime(value.startMs)) && (value.endMs === null || isTime(value.endMs));
}

function isEvidenceList(value: unknown): value is Evidence[] {
  return Array.isArray(value) && value.every(isEvidence);
}

function isProgress(value: unknown): value is Progress {
  return isRecord(value) && isId(value.goalId) && isCount(value.goalRevision, 1)
    && Array.isArray(value.criteria) && value.criteria.every((criterion: unknown) =>
      isRecord(criterion) && isId(criterion.criterionId) && isCount(criterion.confirmedCount)
      && isCount(criterion.targetCount, 1) && typeof criterion.complete === "boolean" && isIdList(criterion.evidenceIds))
    && (value.nextStep === null || (isRecord(value.nextStep) && typeof value.nextStep.text === "string"
      && isIdList(value.nextStep.evidenceIds) && (value.nextStep.kind === "rule" || value.nextStep.kind === "model")));
}

async function request(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await authenticatedFetch(`/api${path}`, init);
  } catch (error) {
    // Preserve cancellation for callers that intentionally replace or abandon a request.
    if (init.signal?.aborted || (isRecord(error) && error.name === "AbortError")) throw error;
    throw new GoalsApiError("network_error", 0);
  }
  let payload: unknown;
  try { payload = await response.json(); } catch (error) {
    if (init.signal?.aborted || (isRecord(error) && error.name === "AbortError")) throw error;
    payload = null;
  }
  if (!response.ok) {
    if (response.status === 401) throw new GoalsApiError("unauthorized", 401);
    const code = isRecord(payload) && isRecord(payload.error) ? payload.error.code : null;
    if (typeof code === "string" && Object.hasOwn(errorMessages, code)) {
      throw new GoalsApiError(code as ApiErrorCode, response.status);
    }
    throw new GoalsApiError(response.status === 403 ? "forbidden" : "http_error", response.status);
  }
  if (!isRecord(payload)) throw new GoalsApiError("invalid_response", response.status);
  return payload;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

async function requestEntity<T>(path: string, init: RequestInit, key: string, isValue: (value: unknown) => value is T): Promise<T> {
  const payload = await request(path, init);
  const value = payload[key];
  if (!isValue(value)) throw new GoalsApiError("invalid_response", 200);
  return value;
}

async function requestImport(path: string, init: RequestInit): Promise<ImportResult> {
  const payload = await request(path, init);
  if (!isSource(payload.source) || !isEvidenceList(payload.evidence) || typeof payload.duplicate !== "boolean") {
    throw new GoalsApiError("invalid_response", 200);
  }
  return { source: payload.source, evidence: payload.evidence, duplicate: payload.duplicate };
}

export async function getGoal(goalId: string, signal?: AbortSignal): Promise<Goal | null> {
  try {
    return await requestEntity(`/goals/${encodedId(goalId)}`, { method: "GET", signal }, "goal", isGoal);
  } catch (error) {
    if (error instanceof GoalsApiError && error.status === 404 && error.code === "not_found") return null;
    throw error;
  }
}

export async function saveGoal(goalId: string, input: GoalWrite): Promise<Goal> {
  validateTimestamp(input.deadline);
  return requestEntity(`/goals/${encodedId(goalId)}`, jsonRequest("PUT", input), "goal", isGoal);
}

export async function listEvidence(goalId: string, signal?: AbortSignal): Promise<Evidence[]> {
  return requestEntity(`/goals/${encodedId(goalId)}/evidence`, { method: "GET", signal }, "evidence", isEvidenceList);
}

export async function getProgress(goalId: string, signal?: AbortSignal): Promise<Progress> {
  return requestEntity(`/goals/${encodedId(goalId)}/progress`, { method: "GET", signal }, "progress", isProgress);
}

export async function getSource(sourceId: string, signal?: AbortSignal): Promise<Source> {
  return requestEntity(`/sources/${encodedId(sourceId)}`, { method: "GET", signal }, "source", isSource);
}

export async function reviewEvidence(evidenceId: string, input: ReviewEvidenceInput): Promise<Evidence> {
  return requestEntity(`/evidence/${encodedId(evidenceId)}`, jsonRequest("PATCH", input), "evidence", isEvidence);
}

export async function importText(input: TextImportInput, signal?: AbortSignal): Promise<ImportResult> {
  encodedId(input.goalId);
  validateTimestamp(input.capturedAt);
  if (!input.text.trim() || input.text.length > 50_000 || input.title.length > 200) {
    throw new GoalsApiError("invalid_request", 400);
  }
  return requestImport("/context/import", {
    ...jsonRequest("POST", { ...input, capturedAt: input.capturedAt ?? null }), signal,
  });
}

export async function importAudio(input: AudioImportInput, signal?: AbortSignal): Promise<ImportResult> {
  encodedId(input.goalId);
  validateTimestamp(input.capturedAt);
  if (input.title.length > 200 || input.file.size === 0) throw new GoalsApiError("invalid_request", 400);
  if (input.file.size > MAX_AUDIO_BYTES) throw new GoalsApiError("file_too_large", 413);
  if (!(AUDIO_MIME_TYPES as readonly string[]).includes(input.file.type)) {
    throw new GoalsApiError("unsupported_media_type", 415);
  }
  const query = new URLSearchParams({ goalId: input.goalId, title: input.title });
  if (input.capturedAt != null) query.set("capturedAt", input.capturedAt);
  return requestImport(`/context/audio?${query}`, {
    method: "POST", headers: { "content-type": input.file.type }, body: input.file, signal,
  });
}
