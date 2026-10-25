import type { ContextChatCitation, ContextChatMessage, ContextChatResult, ContextChatThread } from "./api";

export const citation: ContextChatCitation = { sourceId: "source-audio", sourceTitle: "После пробного интервью", kind: "audio", quote: "Провёл пробное интервью.", textStart: 0, textEnd: 23, startMs: 4000, endMs: 9200 };
citation.textEnd = citation.quote.length;
export const userMessage: ContextChatMessage = { id: "user-message", role: "user", text: "Что я уже сделал?", createdAt: "2026-10-25T10:00:00Z", citations: [] };
export const reply: ContextChatMessage = { id: "assistant-message", role: "assistant", text: "«Провёл пробное интервью.»", createdAt: "2026-10-25T10:00:01Z", outcome: "grounded", citations: [citation] };
export const thread: ContextChatThread = { messages: [], context: { goalTitle: "Подготовиться к собеседованию", sourceCount: 2, hasContext: true } };
export const result: ContextChatResult = { ...thread, messages: [userMessage, reply], reply };
