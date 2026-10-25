/** Public contract for the personal-context chat. All citations are verified server-side. */
export interface ContextChatCitation {
  sourceId: string;
  sourceTitle: string;
  kind: "text" | "audio" | "goal" | "progress";
  quote: string;
  textStart: number;
  textEnd: number;
  startMs: number | null;
  endMs: number | null;
}

export interface ContextChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  citations: ContextChatCitation[];
  outcome?: "grounded" | "insufficient_context";
}

export interface ContextChatSummary {
  goalTitle: string | null;
  sourceCount: number;
  hasContext: boolean;
}

export interface ContextChatThread {
  messages: ContextChatMessage[];
  context: ContextChatSummary;
}

export interface ContextChatInput {
  message: string;
  requestId: string;
}

export interface ContextChatResult extends ContextChatThread {
  reply: ContextChatMessage;
}
