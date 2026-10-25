import { afterEach, describe, expect, it, vi } from "vitest";
import { createContextProviders, requestProviderJson } from "./providers.js";
import type { Goal, SourceDraft } from "../contracts.js";

const goal: Goal = {
  id: "demo", title: "Подготовиться к интервью", deadline: null,
  criteria: [{ id: "cv", description: "Отправить резюме", targetCount: 1, unit: "отправка" }],
  confirmedAt: "2026-10-25T10:00:00Z", revision: 1,
};
const source: SourceDraft = {
  kind: "text", title: "Заметка", contentHash: "hash", text: "Резюме отправлено.",
  capturedAt: null, segments: [],
};

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("unconfirmed provider configuration", () => {
  it("does not call a provider or return fake extraction", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const providers = createContextProviders({});
    await expect(providers.extract({ goal, source })).rejects.toMatchObject({
      code: "provider_unconfigured", statusCode: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not infer a protocol, audio support or fallback from supplied values", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const providers = createContextProviders({
      protocol: "openai-compatible", baseUrl: "https://synthetic.invalid", model: "synthetic",
      apiKey: "synthetic-test-secret", stt: {
        baseUrl: "https://synthetic-stt.invalid", model: "synthetic", apiKey: "synthetic-test-secret",
      },
    });
    await expect(providers.extract({ goal, source })).rejects.toMatchObject({ code: "provider_unconfigured" });
    await expect(providers.transcribe!({ bytes: new Uint8Array([1]), mimeType: "audio/wav" }))
      .rejects.toMatchObject({ code: "stt_unconfigured", statusCode: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("protocol-independent bounded JSON transport", () => {
  const request = { url: "https://synthetic.invalid/exact-confirmed-method", body: { synthetic: true } };

  it("uses only the supplied URL and headers and parses JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"evidence":[]}'));
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestProviderJson({ ...request, headers: { Authorization: "Bearer test-only" } }))
      .resolves.toEqual({ evidence: [] });
    expect(fetchMock).toHaveBeenCalledWith(request.url, expect.objectContaining({
      method: "POST", redirect: "error", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" },
      body: JSON.stringify(request.body), signal: expect.any(AbortSignal),
    }));
  });

  it.each([429, 500])("redacts HTTP %s details", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("SECRET UPSTREAM BODY", { status })));
    await expect(requestProviderJson(request)).rejects.toMatchObject({ code: "provider_failed", statusCode: 502 });
    try { await requestProviderJson(request); } catch (error) {
      expect(String(error)).not.toContain("SECRET");
    }
  });

  it("redacts network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret-token-in-url")));
    await expect(requestProviderJson(request)).rejects.toMatchObject({
      code: "provider_failed", message: "Ошибка ответа провайдера",
    });
  });

  it("rejects malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{invalid")));
    await expect(requestProviderJson(request)).rejects.toMatchObject({ code: "provider_failed" });
  });

  it("limits streamed bytes without trusting Content-Length", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(20))); },
      cancel() { cancelled = true; },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
    await expect(requestProviderJson({ ...request, maxResponseBytes: 10 }))
      .rejects.toMatchObject({ code: "provider_failed" });
    expect(cancelled).toBe(true);
  });

  it("times out even if fetch ignores AbortSignal", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
    const result = expect(requestProviderJson({ ...request, timeoutMs: 50 }))
      .rejects.toMatchObject({ code: "provider_timeout", statusCode: 504 });
    await vi.advanceTimersByTimeAsync(51);
    await result;
  });

  it("times out a stalled response body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream())));
    const result = expect(requestProviderJson({ ...request, timeoutMs: 50 }))
      .rejects.toMatchObject({ code: "provider_timeout" });
    await vi.advanceTimersByTimeAsync(51);
    await result;
  });

  it("does not call fetch for an already cancelled signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestProviderJson({ ...request, signal: controller.signal }))
      .rejects.toMatchObject({ code: "provider_failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels in-flight work and removes the signal listener", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(requestProviderJson({ ...request, signal: controller.signal }))
      .rejects.toMatchObject({ code: "provider_failed" });
    controller.abort();
    await result;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
