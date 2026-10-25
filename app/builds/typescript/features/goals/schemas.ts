import { z } from "zod";
import { FeatureError } from "../contracts.js";

export const idSchema = z.string().min(1).refine((value) => value.trim().length > 0);
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const offset = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.string().datetime({ offset: true });
const nonBlank = z.string().min(1).refine((value) => value.trim().length > 0);

export const criterionSchema = z.object({
  id: idSchema,
  description: nonBlank,
  targetCount: positiveInteger,
  unit: nonBlank,
}).strict();

const criteriaSchema = z.array(criterionSchema).min(1).refine(
  (criteria) => new Set(criteria.map((criterion) => criterion.id)).size === criteria.length,
  "Criterion IDs must be unique",
);

const goalFields = {
  title: nonBlank,
  deadline: timestamp.nullable(),
  criteria: criteriaSchema,
};

export const goalWriteSchema = z.object({
  ...goalFields,
  confirm: z.boolean(),
  expectedRevision: positiveInteger.nullable(),
}).strict();

export const goalSchema = z.object({
  ...goalFields,
  id: idSchema,
  confirmedAt: timestamp.nullable(),
  revision: positiveInteger,
}).strict();

export const segmentSchema = z.object({
  startMs: offset,
  endMs: offset,
  textStart: offset,
  textEnd: offset,
}).strict().refine((segment) => segment.endMs > segment.startMs && segment.textEnd > segment.textStart);

export const sourceDraftSchema = z.object({
  kind: z.enum(["text", "audio"]),
  title: nonBlank.max(200),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  text: nonBlank.max(50_000),
  capturedAt: timestamp.nullable(),
  segments: z.array(segmentSchema),
}).strict();

export const sourceSchema = sourceDraftSchema.extend({
  id: idSchema,
  goalId: idSchema,
  createdAt: timestamp,
});

export const evidenceDraftSchema = z.object({
  criterionId: idSchema,
  eventType: z.enum(["completed_action", "intention", "obstacle", "uncertain"]),
  summary: nonBlank,
  quote: nonBlank,
  textStart: offset,
  textEnd: offset,
  startMs: offset.nullable(),
  endMs: offset.nullable(),
}).strict();

export const evidenceStatusSchema = z.enum(["proposed", "confirmed", "rejected", "disputed"]);

export const evidenceSchema = evidenceDraftSchema.extend({
  id: idSchema,
  goalId: idSchema,
  sourceId: idSchema,
  eventKey: z.string().regex(/^[a-f0-9]{64}$/),
  status: evidenceStatusSchema,
  revision: positiveInteger,
  createdAt: timestamp,
});

export const reviewSchema = z.object({
  status: evidenceStatusSchema,
  expectedRevision: positiveInteger,
  duplicateOfEvidenceId: idSchema.optional(),
}).strict();

export const importSchema = z.object({
  goalId: idSchema,
  expectedGoalRevision: positiveInteger,
  source: sourceDraftSchema,
  evidence: z.array(evidenceDraftSchema),
}).strict();

export const snapshotSchema = z.object({
  version: z.literal(1),
  goals: z.array(goalSchema),
  sources: z.array(sourceSchema),
  evidence: z.array(evidenceSchema),
}).strict();

export type Snapshot = z.infer<typeof snapshotSchema>;

export function parseInput<T>(schema: z.ZodType<T>, input: unknown, evidence = false): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new FeatureError(
      evidence ? "invalid_evidence" : "invalid_request",
      evidence ? 422 : 400,
      evidence ? "Некорректные свидетельства" : "Некорректный запрос",
    );
  }
  return result.data;
}
