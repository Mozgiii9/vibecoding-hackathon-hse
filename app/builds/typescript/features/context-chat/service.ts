import { randomUUID } from "node:crypto";
import { z } from "zod";
import { FeatureError } from "../contracts.js";
import type { ContextChatInput, ContextChatMessage, ContextChatResult, ContextChatThread } from "./contracts.js";
import { citationsStillCurrent, readChatContext, selectPassages, verifyQuotes } from "./context.js";
import { cancelled, checkAbort, ContextChatError } from "./errors.js";
import type { ContextChatProvider } from "./provider.js";
import { hashText, historyFilename, messagesForClient, readHistory, writeHistory } from "./storage.js";

const inputSchema = z.object({ message: z.string().trim().min(1).max(4000), requestId: z.string().uuid().transform((id) => id.toLowerCase()) }).strict();
const identifierSchema = z.string().min(1).max(500).refine((value) => value.trim().length > 0);
const inFlight = new Map<string, { requestId: string; message: string; operation: Promise<ContextChatResult> }>();
const INSUFFICIENT = "В сохранённом контексте недостаточно информации для ответа. Добавьте подходящую запись или уточните вопрос.";

function identifier(value: string): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throw new ContextChatError("invalid_request", 400, "Некорректный запрос.");
  return parsed.data;
}
function input(value: unknown): ContextChatInput {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) throw new ContextChatError("invalid_request", 400, "Введите сообщение до 4000 символов и корректный requestId.");
  return parsed.data;
}

async function withAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  checkAbort(signal);
  if (!signal) return operation;
  let abort: () => void = () => undefined;
  const cancellation = new Promise<never>((_resolve, reject) => { abort = () => reject(cancelled()); signal.addEventListener("abort", abort, { once: true }); });
  try { return await Promise.race([operation, cancellation]); }
  finally { signal.removeEventListener("abort", abort); }
}

export function createContextChatService(options: { memoryRoot: string; provider: ContextChatProvider }) {
  return {
    async getThread(actorId: string, goalId: string): Promise<ContextChatThread> {
      const filename = historyFilename(options.memoryRoot, identifier(actorId), identifier(goalId));
      const [history, context] = await Promise.all([readHistory(filename), readChatContext(options.memoryRoot, goalId)]);
      return { messages: messagesForClient(history), context: context.summary };
    },

    async postMessage(actorId: string, goalId: string, value: unknown, signal?: AbortSignal): Promise<ContextChatResult> {
      const filename = historyFilename(options.memoryRoot, identifier(actorId), identifier(goalId));
      const request = input(value);
      checkAbort(signal);
      const running = inFlight.get(filename);
      if (running) {
        if (running.requestId !== request.requestId) throw new ContextChatError("chat_busy", 409, "Предыдущий ответ ещё готовится.");
        if (running.message !== request.message) throw new ContextChatError("request_conflict", 409, "Этот requestId уже используется для другого сообщения.");
        return structuredClone(await withAbort(running.operation, signal));
      }
      const operation = (async (): Promise<ContextChatResult> => {
        const history = await readHistory(filename);
        const previous = history.requests.find((entry) => entry.requestId === request.requestId);
        if (previous) {
          if (previous.messageHash !== hashText(request.message)) throw new ContextChatError("request_conflict", 409, "Этот requestId уже использован для другого сообщения.");
          const reply = history.messages.find((message) => message.id === previous.replyId);
          if (!reply) throw new ContextChatError("request_conflict", 409, "Этот ответ уже вне сохранённой истории. Отправьте новый вопрос.");
          const context = await readChatContext(options.memoryRoot, goalId);
          return { messages: messagesForClient(history), context: context.summary, reply: structuredClone(reply) };
        }
        const context = await readChatContext(options.memoryRoot, goalId);
        checkAbort(signal);
        let citations: ContextChatMessage["citations"] = [];
        if (context.documents.length) {
          const passages = selectPassages(context, request.message, history.messages);
          let selection: unknown;
          try {
            selection = await withAbort(options.provider({ message: request.message,
              history: history.messages.slice(-6).map((message) => ({ role: message.role, text: message.text.slice(0, 1200) })),
              documents: passages, signal }), signal);
          } catch (error) {
            if (error instanceof ContextChatError) throw error;
            if (error instanceof FeatureError && error.code === "provider_timeout") throw new ContextChatError("provider_timeout", 504, "Модель не ответила вовремя. Ответ не сохранён.");
            throw new ContextChatError("provider_failed", 502, "Модель временно недоступна. Ответ не сохранён.");
          }
          checkAbort(signal);
          citations = verifyQuotes(selection, passages, context);
        }
        // Virtual goal/progress facts must still be current at the history commit.
        const latest = await readChatContext(options.memoryRoot, goalId);
        if (!citationsStillCurrent(citations, latest)) throw new ContextChatError("request_conflict", 409, "Контекст изменился. Повторите вопрос.");
        checkAbort(signal);
        const createdAt = new Date().toISOString();
        const user: ContextChatMessage = { id: randomUUID(), role: "user", text: request.message, createdAt, citations: [] };
        const reply: ContextChatMessage = { id: randomUUID(), role: "assistant", createdAt,
          text: citations.length ? `В твоих материалах есть записи:\n\n${citations.map((citation) => `«${citation.quote}»`).join("\n\n")}` : INSUFFICIENT,
          citations, outcome: citations.length ? "grounded" : "insufficient_context" };
        await writeHistory(filename, { version: 1, messages: [...history.messages, user, reply].slice(-40),
          requests: [...history.requests, { requestId: request.requestId, messageHash: hashText(request.message), replyId: reply.id }].slice(-64) }, signal);
        const messages = [...messagesForClient(history), user, reply].slice(-40);
        return { messages, context: latest.summary, reply };
      })();
      inFlight.set(filename, { requestId: request.requestId, message: request.message, operation });
      try { return structuredClone(await operation); }
      finally { if (inFlight.get(filename)?.operation === operation) inFlight.delete(filename); }
    },
  };
}
