import { authenticatedFetch } from "../../api/auth-adapter";
import type { ContextChatCitation, ContextChatInput, ContextChatMessage, ContextChatResult, ContextChatThread } from "../../../../features/context-chat/contracts";

export type { ContextChatCitation, ContextChatInput, ContextChatMessage, ContextChatResult, ContextChatThread };
export const MAX_MESSAGE_LENGTH = 4000;

const messages: Record<string, string> = {
  unauthorized: "Сессия истекла. Войдите снова, чтобы продолжить разговор.",
  forbidden: "Этот разговор недоступен для вашей учётной записи.",
  invalid_request: "Сообщение должно содержать от 1 до 4 000 символов.",
  chat_busy: "Предыдущее сообщение ещё обрабатывается. Подождите немного и повторите.",
  request_conflict: "Не удалось отправить это сообщение. Измените его и попробуйте снова.",
  provider_timeout: "Ответ занял слишком много времени. Ваше сообщение сохранено — попробуйте ещё раз.",
  provider_unconfigured: "Чат пока недоступен. Ваше сообщение сохранено, можно вернуться позже.",
  provider_failed: "Не удалось получить ответ. Ваше сообщение сохранено — попробуйте ещё раз.",
  invalid_grounding: "Не удалось подтвердить ответ источниками. Попробуйте уточнить вопрос.",
  network_error: "Нет связи с приложением. Проверьте соединение и попробуйте ещё раз.",
  invalid_response: "Не удалось прочитать ответ. Попробуйте ещё раз.",
};

export class ContextChatApiError extends Error {
  constructor(readonly code: string) {
    super(messages[code] ?? messages.provider_failed);
    this.name = "ContextChatApiError";
  }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const offset = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const time = (value: unknown): value is number | null => value === null || offset(value);

function isCitation(value: unknown): value is ContextChatCitation {
  return record(value) && nonempty(value.sourceId) && typeof value.sourceTitle === "string"
    && ["text", "audio", "goal", "progress"].includes(String(value.kind)) && nonempty(value.quote)
    && offset(value.textStart) && offset(value.textEnd) && value.textEnd - value.textStart === value.quote.length
    && time(value.startMs) && time(value.endMs)
    && (value.startMs === null ? value.endMs === null : value.endMs === null || value.endMs >= value.startMs);
}

function isMessage(value: unknown): value is ContextChatMessage {
  if (!record(value) || !nonempty(value.id) || !["user", "assistant"].includes(String(value.role))
    || !nonempty(value.text) || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))
    || !Array.isArray(value.citations) || !value.citations.every(isCitation)) return false;
  return value.role === "user" ? value.citations.length === 0
    : value.outcome === "grounded" ? value.citations.length > 0
      : value.outcome === "insufficient_context" && value.citations.length === 0;
}

function isThread(value: unknown): value is ContextChatThread {
  return record(value) && Array.isArray(value.messages) && value.messages.every(isMessage)
    && record(value.context) && (value.context.goalTitle === null || typeof value.context.goalTitle === "string")
    && offset(value.context.sourceCount) && typeof value.context.hasContext === "boolean";
}

async function request(goalId: string, signal: AbortSignal, input?: ContextChatInput): Promise<ContextChatThread | ContextChatResult> {
  if (!goalId.trim()) throw new ContextChatApiError("invalid_request");
  let response: Response;
  try {
    response = await authenticatedFetch(`/api/goals/${encodeURIComponent(goalId)}/chat`, {
      method: input ? "POST" : "GET", signal,
      ...(input ? { headers: { "content-type": "application/json" }, body: JSON.stringify(input) } : {}),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ContextChatApiError("network_error");
  }
  if (response.status === 401) throw new ContextChatApiError("unauthorized");
  if (response.status === 403) throw new ContextChatApiError("forbidden");
  let payload: unknown;
  try { payload = await response.json(); } catch (error) {
    if (signal.aborted) throw error;
    throw new ContextChatApiError(response.ok ? "invalid_response" : "provider_failed");
  }
  if (!response.ok) {
    const code = record(payload) && record(payload.error) && typeof payload.error.code === "string" ? payload.error.code : "provider_failed";
    throw new ContextChatApiError(response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : code);
  }
  if (!isThread(payload)) throw new ContextChatApiError("invalid_response");
  if (input && (!record(payload) || !isMessage(payload.reply) || payload.reply.role !== "assistant"
    || !payload.messages.some((message) => message.id === (payload.reply as ContextChatMessage).id))) {
    throw new ContextChatApiError("invalid_response");
  }
  return payload as ContextChatThread | ContextChatResult;
}

export async function getContextChat(goalId: string, signal: AbortSignal): Promise<ContextChatThread> {
  return request(goalId, signal);
}

export async function sendContextChat(goalId: string, input: ContextChatInput, signal: AbortSignal): Promise<ContextChatResult> {
  if (!input.message.trim() || input.message.length > MAX_MESSAGE_LENGTH) throw new ContextChatApiError("invalid_request");
  return request(goalId, signal, input) as Promise<ContextChatResult>;
}
