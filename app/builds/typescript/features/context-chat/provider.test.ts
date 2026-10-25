import { afterEach, describe, expect, it, vi } from "vitest";
import { createContextChatProvider, type ContextChatProviderInput } from "./provider.js";

const config = { protocol: "openai-compatible" as const, baseUrl: "https://synthetic.invalid/v1", model: "owner-confirmed-model", apiKey: "synthetic-server-only-key" };
const input: ContextChatProviderInput = { message: "Что известно о резюме?", history: [], documents: [
  { sourceId: "synthetic-source", title: "Запись", kind: "text", text: "Резюме не отправлено.", textStart: 0 },
] };
const response = (content: unknown, finish_reason: string = "stop") => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason }] }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("bounded server-only quote selection provider", () => {
  it("uses the confirmed endpoint/key and no tools or general-agent fallback", async () => {
    const selection = [{ sourceId: "synthetic-source", quote: "Резюме не отправлено." }];
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify(selection)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await createContextChatProvider(config)(input)).toEqual(selection);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://synthetic.invalid/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer synthetic-server-only-key");
    expect(request.redirect).toBe("error");
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({ model: config.model, stream: false, temperature: 0 });
    expect(body).not.toHaveProperty("tools");
    expect(request.body).not.toContain(config.apiKey);
    expect(body.messages[0].content).toContain("История помогает только понять");
    expect(body.messages[0].content).toContain("не выполнять");
    expect(JSON.parse(body.messages[1].content).documents).toEqual(input.documents);
  });

  it("does not contact any endpoint when there are no current documents", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(await createContextChatProvider({})({ ...input, documents: [] })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {}, { ...config, protocol: "gemini-native" as const }, { ...config, apiKey: "" },
    { ...config, baseUrl: "https://user:password@synthetic.invalid" },
    { ...config, baseUrl: "https://synthetic.invalid?key=secret" },
    { ...config, baseUrl: "http://public.invalid" },
    { ...config, apiKey: "bad\r\nheader" },
  ])("fails closed for unavailable configuration %# without network", async (settings) => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(createContextChatProvider(settings)(input)).rejects.toMatchObject({ code: "provider_unconfigured", statusCode: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    response("Париж — столица Франции"), response("```json\n[]\n```"),
    response(null), response("[]", "length"), new Response("not json"),
  ])("rejects malformed/truncated model output %#", async (upstream) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream));
    await expect(createContextChatProvider(config)(input)).rejects.toMatchObject({ statusCode: 502 });
  });

  it("bounds response bytes and redacts upstream failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(70_000))));
    await expect(createContextChatProvider(config)(input)).rejects.toMatchObject({ code: "provider_failed", statusCode: 502 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret credentials upstream")));
    await expect(createContextChatProvider(config)(input)).rejects.toMatchObject({ message: "Модель временно недоступна. Ответ не сохранён." });
  });

  it("propagates cancellation to fetch with no second endpoint request", async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const pending = createContextChatProvider(config)({ ...input, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "provider_failed" });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps the bounded shared transport deadline to a safe 504", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => undefined)); vi.stubGlobal("fetch", fetchMock);
    const pending = expect(createContextChatProvider({ ...config, timeoutMs: 10 })(input)).rejects.toMatchObject({ code: "provider_timeout", statusCode: 504 });
    await vi.advanceTimersByTimeAsync(10);
    await pending;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
