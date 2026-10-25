import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalSttTranscriber } from "./stt.js";
import { MAX_AUDIO_BYTES } from "./validation.js";

const config = { baseUrl: "http://127.0.0.1:19000", model: "base", apiKey: "" };
const input = { bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" };
const transcript = {
  text: "Отправил резюме.",
  segments: [{ startMs: 120, endMs: 900, textStart: 0, textEnd: 16 }],
};

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("local STT adapter", () => {
  it.each(["audio/wav", "audio/mpeg", "audio/mp4", "audio/webm"])("sends raw %s bytes and preserves real segments", async (mimeType) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(transcript)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createLocalSttTranscriber({ ...config, baseUrl: `${config.baseUrl}/` })({ ...input, mimeType }))
      .resolves.toEqual(transcript);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${config.baseUrl}/transcribe`, {
      method: "POST", redirect: "error", headers: { "Content-Type": mimeType },
      body: input.bytes, signal: expect.any(AbortSignal),
    });
  });

  it("uses an optional server bearer key without putting it in the URL or body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "Текст", segments: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await createLocalSttTranscriber({ ...config, apiKey: "test-only" })(input);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "Content-Type": "audio/wav", Authorization: "Bearer test-only" });
    expect(fetchMock.mock.calls[0][0]).toBe(`${config.baseUrl}/transcribe`);
    expect(fetchMock.mock.calls[0][1].body).toEqual(input.bytes);
  });

  it("accepts audio at the exact 10 MiB boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(transcript)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createLocalSttTranscriber(config)({ ...input, bytes: new Uint8Array(MAX_AUDIO_BYTES) }))
      .resolves.toEqual(transcript);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    undefined, { ...config, baseUrl: "" }, { ...config, baseUrl: "invalid" },
    { ...config, baseUrl: "ftp://synthetic.invalid" },
    { ...config, baseUrl: "https://user:secret@synthetic.invalid" },
    { ...config, baseUrl: "https://synthetic.invalid?key=secret" },
    { ...config, baseUrl: "https://synthetic.invalid#fragment" },
    { ...config, model: "tiny" }, { ...config, apiKey: "key\r\nheader" },
  ])("requires explicit safe endpoint and the confirmed base model: %j", async (settings) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createLocalSttTranscriber(settings)(input)).rejects.toMatchObject({ code: "stt_unconfigured", statusCode: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, 300_001, Number.NaN])("rejects invalid timeout %s without network access", async (timeoutMs) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createLocalSttTranscriber(config, timeoutMs)(input)).rejects.toMatchObject({ code: "stt_unconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { ...input, bytes: new Uint8Array(), code: "invalid_request", statusCode: 400 },
    { ...input, bytes: new Uint8Array(MAX_AUDIO_BYTES + 1), code: "file_too_large", statusCode: 413 },
    { ...input, mimeType: "audio/ogg", code: "unsupported_media_type", statusCode: 415 },
  ])("rejects invalid audio before fetch: $code", async ({ code, statusCode, ...audio }) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createLocalSttTranscriber(config)(audio)).rejects.toMatchObject({ code, statusCode });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    new TypeError("fetch failed: secret"),
    Object.assign(new Error("secret"), { cause: { code: "ECONNREFUSED" } }),
  ])("reports network unavailability without exposing details", async (error) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    await expect(createLocalSttTranscriber(config)(input)).rejects.toMatchObject({
      code: "stt_unconfigured", statusCode: 503, message: "Распознавание аудио недоступно",
    });
  });

  it.each([400, 401, 429, 500, 503])("redacts failed HTTP %s responses", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret upstream response", { status })));
    await expect(createLocalSttTranscriber(config)(input)).rejects.toMatchObject({
      code: "provider_failed", statusCode: 502, message: "Некорректный ответ распознавания аудио",
    });
  });

  it.each([
    { text: "", segments: [] }, { text: "Текст" }, { text: "Текст", segments: [], language: "ru" },
    { text: "Текст", segments: [{ startMs: 0, endMs: 100, textStart: 0, textEnd: 10 }] },
    { text: "Текст", segments: [{ startMs: 200, endMs: 100, textStart: 0, textEnd: 5 }] },
    { text: "Текст", segments: [{ startMs: 0.5, endMs: 100, textStart: 0, textEnd: 5 }] },
  ])("rejects invalid transcript envelope and boundaries: %j", async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(value))));
    await expect(createLocalSttTranscriber(config)(input)).rejects.toMatchObject({ code: "provider_failed", statusCode: 502 });
  });

  it("rejects malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{bad")));
    await expect(createLocalSttTranscriber(config)(input)).rejects.toMatchObject({ code: "provider_failed" });
  });

  it("bounds streamed response bytes and cancels the body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(1_048_577)); }, cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(createLocalSttTranscriber(config)(input)).rejects.toMatchObject({ code: "provider_failed" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects an oversized declared response before reading and cancels it", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), {
      headers: { "Content-Length": "1048577" },
    })));
    await expect(createLocalSttTranscriber(config)(input)).rejects.toMatchObject({ code: "provider_failed" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(["fetch", "body"])("times out stalled %s even if it ignores abort", async (phase) => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetchMock = vi.fn().mockImplementation(() => phase === "fetch"
      ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream({ cancel }))));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(createLocalSttTranscriber(config, 50)(input))
      .rejects.toMatchObject({ code: "provider_timeout", statusCode: 504 });
    await vi.advanceTimersByTimeAsync(51);
    await result;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    if (phase === "body") expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not fetch an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createLocalSttTranscriber(config)({ ...input, signal: controller.signal }))
      .rejects.toMatchObject({ code: "provider_timeout", statusCode: 504 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates cancellation and removes its listener", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(createLocalSttTranscriber(config)({ ...input, signal: controller.signal }))
      .rejects.toMatchObject({ code: "provider_timeout", statusCode: 504 });
    controller.abort();
    await result;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
