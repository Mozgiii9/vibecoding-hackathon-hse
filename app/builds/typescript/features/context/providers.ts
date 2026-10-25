import { FeatureError, type ContextProviders } from "../contracts.js";

export interface ContextProviderConfig {
  protocol?: "openai-compatible" | "gemini-native";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  stt?: { baseUrl: string; model: string; apiKey: string };
}

/** Provider-specific wiring awaits the owner's confirmed protocol and endpoint. */
export function createContextProviders(_config: ContextProviderConfig): ContextProviders {
  return {
    async extract() {
      throw new FeatureError("provider_unconfigured", 503, "Провайдер извлечения не настроен");
    },
    async transcribe() {
      throw new FeatureError("stt_unconfigured", 503, "Провайдер распознавания аудио не настроен");
    },
  };
}

interface JsonRequest {
  /** A complete, confirmed endpoint; this helper never infers a protocol or method path. */
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

const failed = () => new FeatureError("provider_failed", 502, "Ошибка ответа провайдера");

/** Shared transport for a future confirmed adapter; no fallback or automatic retries. */
export async function requestProviderJson(input: JsonRequest): Promise<unknown> {
  const timeoutMs = input.timeoutMs ?? 30_000;
  const maxBytes = input.maxResponseBytes ?? 262_144;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000
    || !Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 1_048_576) {
    throw new FeatureError("provider_unconfigured", 503, "Некорректные ограничения провайдера");
  }
  if (input.signal?.aborted) throw failed();

  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let rejectCancellation: (reason: FeatureError) => void = () => {};
  const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
  const cancel = (reason: FeatureError) => {
    rejectCancellation(reason);
    controller.abort();
    void reader?.cancel().catch(() => {});
  };
  const onAbort = () => cancel(failed());
  input.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => cancel(new FeatureError("provider_timeout", 504, "Провайдер не ответил вовремя")), timeoutMs);

  const operation = async (): Promise<unknown> => {
    const response = await fetch(input.url, {
      method: "POST",
      redirect: "error",
      headers: { ...input.headers, "Content-Type": "application/json" },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      void response.body?.cancel().catch(() => {});
      throw failed();
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxBytes) {
      void response.body.cancel().catch(() => {});
      throw failed();
    }
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        void reader.cancel().catch(() => {});
        throw failed();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  };

  try {
    return await Promise.race([operation(), cancellation]);
  } catch (error) {
    if (error instanceof FeatureError) throw error;
    throw failed();
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onAbort);
  }
}
