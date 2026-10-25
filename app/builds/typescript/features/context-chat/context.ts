import type { Goal, Source } from "../contracts.js";
import { computeProgress } from "../goals/progress.js";
import { readSnapshot } from "../goals/storage.js";
import type { ContextChatCitation, ContextChatMessage, ContextChatSummary } from "./contracts.js";
import { invalidGrounding } from "./errors.js";

export interface ContextDocument {
  sourceId: string;
  title: string;
  kind: ContextChatCitation["kind"];
  text: string;
  source?: Source;
}
export interface ChatPassage {
  sourceId: string;
  title: string;
  kind: ContextChatCitation["kind"];
  text: string;
  textStart: number;
}
export interface ChatContext {
  summary: ContextChatSummary;
  documents: ContextDocument[];
}

function goalText(goal: Goal): string {
  return [`Цель: ${goal.title}.`, `Срок: ${goal.deadline ?? "не указан"}.`,
    `Статус цели: ${goal.confirmedAt ? "подтверждена" : "черновик"}.`,
    ...goal.criteria.map((criterion) => `Критерий: ${criterion.description}. Цель: ${criterion.targetCount} ${criterion.unit}.`),
  ].join("\n");
}

/** Only the atomic domain snapshot is read; no arbitrary memory or credential files. */
export async function readChatContext(memoryRoot: string, goalId: string): Promise<ChatContext> {
  const state = await readSnapshot(memoryRoot);
  const goal = state.goals.find((entry) => entry.id === goalId);
  if (!goal) return { summary: { goalTitle: null, sourceCount: 0, hasContext: false }, documents: [] };
  const sources = state.sources.filter((source) => source.goalId === goalId);
  const evidence = state.evidence.filter((entry) => entry.goalId === goalId);
  const progress = computeProgress(goal, evidence);
  const progressText = progress.criteria.map((criterion, index) =>
    `${goal.criteria[index].description}: подтверждено ${criterion.confirmedCount} из ${criterion.targetCount} ${goal.criteria[index].unit}.`,
  ).join("\n");
  const documents: ContextDocument[] = [
    { sourceId: `goal:${goalId}`, title: "Сохранённая цель", kind: "goal", text: goalText(goal) },
    { sourceId: `progress:${goalId}`, title: "Подтверждённый прогресс", kind: "progress", text: progressText },
    // Sources without extracted evidence remain first-class user context.
    ...sources.map((source) => ({ sourceId: source.id, title: source.title, kind: source.kind, text: source.text, source })),
  ];
  if (new Set(documents.map((document) => document.sourceId)).size !== documents.length) throw invalidGrounding();
  return { summary: { goalTitle: goal.title, sourceCount: sources.length, hasContext: true }, documents };
}

function tokens(text: string): string[] {
  return [...new Set((text.toLocaleLowerCase("ru").match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter((word) => !["что", "как", "это", "мне", "мой", "мои", "меня", "про", "для", "или", "есть", "ещё", "еще", "какие", "какой", "расскажи"].includes(word))
    .map((word) => word.length > 6 ? word.slice(0, -2) : word))];
}

/** Consider every saved source, then bound the relevant passages sent to the model. */
export function selectPassages(context: ChatContext, message: string, history: ContextChatMessage[]): ChatPassage[] {
  const query = tokens(message);
  const followup = tokens(history.slice(-4).map((entry) => entry.text).join(" "));
  const chunks: Array<ChatPassage & { score: number; order: number }> = [];
  context.documents.forEach((document, order) => {
    for (let start = 0; start < document.text.length; start += 1600) {
      const text = document.text.slice(start, start + 2400);
      const normalized = text.toLocaleLowerCase("ru");
      const score = query.reduce((sum, word) => sum + (normalized.includes(word) ? 4 : 0), 0)
        + followup.reduce((sum, word) => sum + (normalized.includes(word) ? 1 : 0), 0);
      chunks.push({ sourceId: document.sourceId, title: document.title, kind: document.kind, text, textStart: start,
        score: score + (document.kind === "goal" || document.kind === "progress" ? 1 : 0), order });
    }
  });
  chunks.sort((a, b) => b.score - a.score || b.order - a.order || a.textStart - b.textStart);
  const chosen: ChatPassage[] = [];
  let size = 0;
  for (const chunk of chunks) {
    if (chosen.length === 12) break;
    if (size + chunk.text.length > 24_000) continue;
    const { score: _score, order: _order, ...passage } = chunk;
    chosen.push(passage); size += passage.text.length;
  }
  return chosen;
}

/** Include the whole sentence so a selected substring cannot remove a preceding negation. */
function completeExcerpt(text: string, start: number, end: number, lineDelimited: boolean): { start: number; end: number } {
  const boundary = lineDelimited ? /[.!?…\n]/u : /[.!?…]/u;
  // Imported text/audio can contain soft line wraps immediately after a negation.
  while (start > 0 && !boundary.test(text[start - 1])) start--;
  while (end < text.length && !boundary.test(text[end - 1])) end++;
  while (start < end && /\s/u.test(text[start])) start++;
  while (end > start && /\s/u.test(text[end - 1])) end--;
  if (end - start > 2000) throw invalidGrounding();
  return { start, end };
}

export function verifyQuotes(selection: unknown, passages: ChatPassage[], context: ChatContext): ContextChatCitation[] {
  if (!Array.isArray(selection) || selection.length > 4) throw invalidGrounding();
  const citations: ContextChatCitation[] = [];
  for (const entry of selection) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join(",") !== "quote,sourceId"
      || typeof entry.sourceId !== "string" || typeof entry.quote !== "string"
      || !entry.quote.trim() || entry.quote.length > 800) throw invalidGrounding();
    const document = context.documents.find((item) => item.sourceId === entry.sourceId);
    if (!document || !passages.some((item) => item.sourceId === entry.sourceId && item.text.includes(entry.quote))) throw invalidGrounding();
    const offset = document.text.indexOf(entry.quote);
    // With only sourceId+quote there is no safe way to disambiguate repeated audio text.
    if (offset < 0 || offset !== document.text.lastIndexOf(entry.quote)) throw invalidGrounding();
    const bounds = completeExcerpt(document.text, offset, offset + entry.quote.length, document.kind === "goal" || document.kind === "progress");
    const quote = document.text.slice(bounds.start, bounds.end);
    if (citations.some((citation) => citation.sourceId === document.sourceId && citation.textStart === bounds.start && citation.textEnd === bounds.end)) continue;
    const segments = document.source?.segments ?? [];
    const first = segments.find((segment) => segment.textStart <= bounds.start && segment.textEnd > bounds.start);
    const last = segments.find((segment) => segment.textStart < bounds.end && segment.textEnd >= bounds.end);
    citations.push({ sourceId: document.sourceId, sourceTitle: document.title, kind: document.kind,
      quote, textStart: bounds.start, textEnd: bounds.end,
      startMs: document.kind === "audio" && first && last ? first.startMs : null,
      endMs: document.kind === "audio" && first && last ? last.endMs : null });
  }
  return citations;
}

export function citationsStillCurrent(citations: ContextChatCitation[], context: ChatContext): boolean {
  return citations.every((citation) => {
    const document = context.documents.find((entry) => entry.sourceId === citation.sourceId);
    return document?.text.slice(citation.textStart, citation.textEnd) === citation.quote;
  });
}
