import { createHash } from "node:crypto";
import { FeatureError, type ContextProviders, type ContextStore, type ImportResult, type SourceDraft } from "../contracts.js";
import { audioQuerySchema, MAX_AUDIO_BYTES, textImportSchema, validateEvidence, validateTranscript } from "./validation.js";

export const AUDIO_MIME_TYPES = new Set(["audio/wav", "audio/mpeg", "audio/mp4", "audio/webm"]);
export type ContextDependencies = { store: ContextStore; providers: ContextProviders };

export function contentHash(kind: SourceDraft["kind"], bytes: Uint8Array): string {
  // NUL separator matches all canonical demo-fixture contentHash vectors.
  return createHash("sha256").update(kind).update("\0").update(bytes).digest("hex");
}

function parseInput<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success) throw new FeatureError("invalid_request", 400, "Некорректные данные импорта");
  return result.data;
}

async function providerCall<T>(call: () => Promise<T>): Promise<T> {
  try { return await call(); }
  catch (error) {
    if (error instanceof FeatureError) throw error;
    throw new FeatureError("provider_failed", 502, "Ошибка обработки у провайдера");
  }
}

function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new FeatureError("provider_timeout", 504, "Обработка прервана");
}

/** Providers run outside core's atomic commit; failed extraction never writes a source. */
export async function importText(deps: ContextDependencies, value: unknown, signal?: AbortSignal): Promise<ImportResult> {
  const input = parseInput(textImportSchema.safeParse(value));
  checkSignal(signal);
  const goal = await deps.store.getConfirmedGoal(input.goalId);
  const hash = contentHash("text", Buffer.from(input.text, "utf8"));
  const existing = await deps.store.findImport(goal.id, hash);
  if (existing) return { ...existing, duplicate: true };
  const source: SourceDraft = {
    kind: "text", title: input.title, text: input.text, capturedAt: input.capturedAt, contentHash: hash, segments: [],
  };
  const extracted = await providerCall(() => deps.providers.extract({ goal, source, signal }));
  checkSignal(signal);
  const evidence = validateEvidence(extracted, goal, source);
  return deps.store.commitImport({ goalId: goal.id, expectedGoalRevision: goal.revision, source, evidence });
}

export async function importAudio(
  deps: ContextDependencies, query: unknown, bytes: Uint8Array, mimeType: string, signal?: AbortSignal,
): Promise<ImportResult> {
  const input = parseInput(audioQuerySchema.safeParse(query));
  if (!AUDIO_MIME_TYPES.has(mimeType)) throw new FeatureError("unsupported_media_type", 415, "Неподдерживаемый формат аудио");
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new FeatureError("file_too_large", 413, "Аудио превышает 10 МиБ");
  if (!bytes.byteLength) throw new FeatureError("invalid_request", 400, "Пустой аудиофайл");
  checkSignal(signal);
  const goal = await deps.store.getConfirmedGoal(input.goalId);
  const hash = contentHash("audio", bytes);
  const existing = await deps.store.findImport(goal.id, hash);
  if (existing) return { ...existing, duplicate: true };
  if (!deps.providers.transcribe) throw new FeatureError("stt_unconfigured", 503, "Распознавание аудио не настроено");
  const transcript = validateTranscript(await providerCall(() => deps.providers.transcribe!({ bytes, mimeType, signal })));
  checkSignal(signal);
  const source: SourceDraft = {
    kind: "audio", title: input.title, capturedAt: input.capturedAt, contentHash: hash, ...transcript,
  };
  const extracted = await providerCall(() => deps.providers.extract({ goal, source, signal }));
  checkSignal(signal);
  const evidence = validateEvidence(extracted, goal, source);
  return deps.store.commitImport({ goalId: goal.id, expectedGoalRevision: goal.revision, source, evidence });
}
