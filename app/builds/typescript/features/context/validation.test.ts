import { describe, expect, it } from "vitest";
import { goal } from "./test-store.js";
import { validateEvidence, validateTranscript, textImportSchema, audioQuerySchema } from "./validation.js";
import type { SourceDraft } from "../contracts.js";

describe("transcript evidence timing", () => {
  const proposal = { criterionId: "cv", eventType: "completed_action", summary: "Отправлено", quote: "А Б" };
  const source: SourceDraft = {
    kind: "audio", title: "Тест", contentHash: "test", capturedAt: null, text: "А Б",
    segments: [
      { startMs: 0, endMs: 1_000, textStart: 0, textEnd: 1 },
      { startMs: 500, endMs: 600, textStart: 2, textEnd: 3 },
    ],
  };
  it("leaves timing unknown when the final segment would truncate an earlier interval", () => {
    const transcript = validateTranscript({ text: source.text, segments: source.segments });
    expect(validateEvidence([proposal], goal, { ...source, ...transcript })[0]).toMatchObject({ startMs: null, endMs: null });
  });
  it("does not guess timing over unmapped speech", () => {
    const text = "А слово Б";
    const segments = [{ ...source.segments[0] }, { ...source.segments[1], textStart: 8, textEnd: 9 }];
    expect(validateEvidence([{ ...proposal, quote: text }], goal, { ...source, text, segments })[0])
      .toMatchObject({ startMs: null, endMs: null });
  });
  it("rejects invented timing even when the text quote matches", () => {
    expect(() => validateEvidence([{ ...proposal, startMs: 123, endMs: 999 }], goal, source))
      .toThrow(expect.objectContaining({ code: "provider_failed" }));
  });
  it("rejects zero-duration segments before core commit", () => {
    expect(() => validateTranscript({ text: "А", segments: [{ startMs: 0, endMs: 0, textStart: 0, textEnd: 1 }] }))
      .toThrow(expect.objectContaining({ code: "provider_failed" }));
  });
  it.each(["", "  \n"])("rejects blank source title %j for text and audio", (title) => {
    expect(textImportSchema.safeParse({ goalId: "demo", title, text: "А" }).success).toBe(false);
    expect(audioQuerySchema.safeParse({ goalId: "demo", title }).success).toBe(false);
  });
});
