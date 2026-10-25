export type ContextChatErrorCode = "invalid_request" | "forbidden" | "request_conflict" | "chat_busy"
  | "provider_failed" | "provider_unconfigured" | "provider_timeout" | "invalid_grounding";

export class ContextChatError extends Error {
  constructor(readonly code: ContextChatErrorCode, readonly statusCode: number, message: string) {
    super(message);
    this.name = "ContextChatError";
  }
}

export const invalidGrounding = () => new ContextChatError("invalid_grounding", 502, "Ответ модели не удалось подтвердить по контексту. Попробуйте уточнить вопрос.");
export const cancelled = () => new ContextChatError("provider_failed", 502, "Ответ не сохранён: запрос прерван.");
export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelled();
}
