import { z } from "zod";
import { FeatureError, type EvidenceDraft, type Goal, type SourceDraft, type TranscriptSegment } from "../contracts.js";

export const MAX_TEXT_UNITS = 50_000;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const timestamp = z.string().datetime({ offset: true }).nullable().optional().default(null);
const goalId = z.string().min(1).max(200).refine((value) => value.trim().length > 0);
const title = z.string().min(1).max(200).refine((value) => value.trim().length > 0);
export const textImportSchema = z.object({
  goalId, title, text: z.string().min(1).max(MAX_TEXT_UNITS).refine((text) => text.trim().length > 0),
  capturedAt: timestamp,
}).strict();
export const audioQuerySchema = z.object({ goalId, title, capturedAt: timestamp }).strict();
const segmentSchema = z.object({
  startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative(),
  textStart: z.number().int().nonnegative(), textEnd: z.number().int().positive(),
}).strict();
const transcriptSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_UNITS).refine((text) => text.trim().length > 0),
  segments: z.array(segmentSchema).max(10_000),
}).strict();
const proposalSchema = z.object({
  criterionId: z.string().min(1),
  eventType: z.enum(["completed_action", "intention", "obstacle", "uncertain"]),
  summary: z.string().min(1).max(2_000).refine((value) => value.trim().length > 0),
  quote: z.string().min(1).max(MAX_TEXT_UNITS).refine((value) => value.trim().length > 0),
  textStart: z.number().int().nonnegative().optional(), textEnd: z.number().int().positive().optional(),
  startMs: z.number().int().nonnegative().nullable().optional(),
  endMs: z.number().int().nonnegative().nullable().optional(),
}).strict();

function invalidProvider(): never {
  throw new FeatureError("provider_failed", 502, "Некорректный ответ провайдера");
}

export function validateTranscript(value: unknown): { text: string; segments: TranscriptSegment[] } {
  const parsed = transcriptSchema.safeParse(value);
  if (!parsed.success) return invalidProvider();
  let previousEnd = 0;
  let previousTime = 0;
  for (const segment of parsed.data.segments) {
    if (segment.textStart < previousEnd || segment.textEnd <= segment.textStart ||
        segment.textEnd > parsed.data.text.length || segment.startMs < previousTime ||
        segment.endMs <= segment.startMs) return invalidProvider();
    previousEnd = segment.textEnd;
    previousTime = segment.startMs;
  }
  return parsed.data;
}

/** Only use actual STT segment boundaries; gaps containing speech cannot be guessed. */
function timeRange(source: SourceDraft, start: number, end: number): [number | null, number | null] {
  if (source.kind !== "audio") return [null, null];
  const segments = source.segments.filter((segment) => segment.textEnd > start && segment.textStart < end);
  if (!segments.length || segments[0].textStart > start || segments.at(-1)!.textEnd < end) return [null, null];
  for (let i = 1; i < segments.length; i++) {
    if (source.text.slice(segments[i - 1].textEnd, segments[i].textStart).trim()) return [null, null];
  }
  // Core requires the end boundary of the segment containing the quote's end.
  // Nested/nonmonotonic intervals have no safe complete range for this quote.
  const endMs = segments.at(-1)!.endMs;
  if (Math.max(...segments.map((segment) => segment.endMs)) !== endMs) return [null, null];
  return [segments[0].startMs, endMs];
}

export function validateEvidence(value: unknown, goal: Goal, source: SourceDraft): EvidenceDraft[] {
  const parsed = z.array(proposalSchema).max(200).safeParse(value);
  if (!parsed.success) return invalidProvider();
  const criterionIds = new Set(goal.criteria.map((criterion) => criterion.id));
  return parsed.data.map((proposal) => {
    if (!criterionIds.has(proposal.criterionId)) return invalidProvider();
    let start = proposal.textStart;
    let end = proposal.textEnd;
    if (start === undefined && end === undefined) {
      start = source.text.indexOf(proposal.quote);
      if (start < 0 || source.text.indexOf(proposal.quote, start + 1) !== -1) return invalidProvider();
      end = start + proposal.quote.length;
    }
    if (start === undefined || end === undefined || end <= start || end > source.text.length ||
        source.text.slice(start, end) !== proposal.quote) return invalidProvider();
    const [startMs, endMs] = timeRange(source, start, end);
    if ((proposal.startMs != null && proposal.startMs !== startMs) ||
        (proposal.endMs != null && proposal.endMs !== endMs)) return invalidProvider();
    return {
      criterionId: proposal.criterionId, eventType: proposal.eventType, summary: proposal.summary,
      quote: proposal.quote, textStart: start, textEnd: end, startMs, endMs,
    };
  });
}
