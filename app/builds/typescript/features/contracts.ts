/** Shared v1 contract for the hackathon modules; implementations live in separate branches. */
export type EventType = "completed_action" | "intention" | "obstacle" | "uncertain";
export type EvidenceStatus = "proposed" | "confirmed" | "rejected" | "disputed";

export interface Criterion {
  id: string;
  description: string;
  targetCount: number;
  unit: string;
}

export interface Goal {
  id: string;
  title: string;
  deadline: string | null;
  criteria: Criterion[];
  confirmedAt: string | null;
  revision: number;
}

export interface GoalWrite {
  title: string;
  deadline: string | null;
  criteria: Criterion[];
  confirm: boolean;
  expectedRevision: number | null;
}

/** Text offsets use JavaScript UTF-16 code units, with an exclusive end. */
export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  textStart: number;
  textEnd: number;
}

export interface SourceDraft {
  kind: "text" | "audio";
  title: string;
  contentHash: string;
  text: string;
  capturedAt: string | null;
  segments: TranscriptSegment[];
}

export interface Source extends SourceDraft {
  id: string;
  goalId: string;
  createdAt: string;
}

/** Proposals contain only claims and source references; core assigns IDs and review status. */
export interface EvidenceDraft {
  criterionId: string;
  eventType: EventType;
  summary: string;
  quote: string;
  textStart: number;
  textEnd: number;
  startMs: number | null;
  endMs: number | null;
}

export interface Evidence extends EvidenceDraft {
  id: string;
  goalId: string;
  sourceId: string;
  eventKey: string;
  status: EvidenceStatus;
  revision: number;
  createdAt: string;
}

export interface ImportResult {
  source: Source;
  evidence: Evidence[];
  duplicate: boolean;
}

export interface Progress {
  goalId: string;
  goalRevision: number;
  criteria: Array<{
    criterionId: string;
    confirmedCount: number;
    targetCount: number;
    complete: boolean;
    evidenceIds: string[];
  }>;
  nextStep: { text: string; evidenceIds: string[]; kind: "rule" | "model" } | null;
}

/** Core implements this port; ingestion must not import the core implementation. */
export interface ContextStore {
  getConfirmedGoal(goalId: string): Promise<Goal>;
  findImport(goalId: string, contentHash: string): Promise<ImportResult | null>;
  commitImport(input: {
    goalId: string;
    expectedGoalRevision: number;
    source: SourceDraft;
    evidence: EvidenceDraft[];
  }): Promise<ImportResult>;
}

export interface GoalsStore extends ContextStore {
  getGoal(goalId: string): Promise<Goal | null>;
  saveGoal(goalId: string, input: GoalWrite): Promise<Goal>;
  getSource(sourceId: string): Promise<Source | null>;
  listEvidence(goalId: string): Promise<Evidence[]>;
  reviewEvidence(evidenceId: string, input: {
    status: EvidenceStatus;
    expectedRevision: number;
    duplicateOfEvidenceId?: string;
  }): Promise<Evidence>;
  getProgress(goalId: string): Promise<Progress>;
}

export interface ContextProviders {
  extract(input: {
    goal: Goal;
    source: SourceDraft;
    signal?: AbortSignal;
  }): Promise<EvidenceDraft[]>;
  transcribe?: (input: {
    bytes: Uint8Array;
    mimeType: string;
    signal?: AbortSignal;
  }) => Promise<{ text: string; segments: TranscriptSegment[] }>;
}

export type FeatureErrorCode =
  | "invalid_request" | "forbidden" | "not_found" | "goal_unconfirmed" | "goal_changed"
  | "goal_locked" | "revision_conflict" | "invalid_evidence"
  | "provider_unconfigured" | "provider_timeout" | "provider_failed"
  | "stt_unconfigured" | "file_too_large" | "unsupported_media_type";

/** Domain errors stay independent of Fastify so both route modules can map them consistently. */
export class FeatureError extends Error {
  constructor(
    public readonly code: FeatureErrorCode,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "FeatureError";
  }
}
