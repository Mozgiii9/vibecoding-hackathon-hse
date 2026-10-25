import { FeatureError, type ContextProviders } from "../contracts.js";
import { MAX_AUDIO_BYTES, validateTranscript } from "./validation.js";

export interface LocalSttConfig {
  baseUrl: string;
  model: string;
  /** An empty key means the separately configured local service does not require auth. */
  apiKey: string;
}

const unavailable = () => new FeatureError("stt_unconfigured", 503, "Распознавание аудио недоступно");
const failed = () => new FeatureError("provider_failed", 502, "Некорректный ответ распознавания аудио");
const timeout = () => new FeatureError("provider_timeout", 504, "Распознавание аудио прервано или не ответило вовремя");
const mimeTypes = new Set(["audio/wav", "audio/mpeg", "audio/mp4", "audio/webm"]);
const MAX_RESPONSE_BYTES = 1_048_576;

function transcriptionEndpoint(config?: LocalSttConfig): string | null {
  if (!config?.baseUrl?.trim() || config.model !== "base" || typeof config.apiKey !== "string"
    || /[\r\n]/.test(config.apiKey)) return null;
  try {
    const url = new URL(config.baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password) return null;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/transcribe`;
    return url.toString();
  } catch { return null; }
}

/** Raw-byte protocol of the confirmed local base/ru/CPU service; no guessed endpoint or fallback. */
export function createLocalSttTranscriber(config?: LocalSttConfig, timeoutMs = 120_000): NonNullable<ContextProviders["transcribe"]> {
  const endpoint = transcriptionEndpoint(config);
  const apiKey = typeof config?.apiKey === "string" ? config.apiKey.trim() : "";
  return async (input) => {
    if (!endpoint || !Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) throw unavailable();
    if (!mimeTypes.has(input.mimeType)) throw new FeatureError("unsupported_media_type", 415, "Неподдерживаемый формат аудио");
    if (input.bytes.byteLength > MAX_AUDIO_BYTES) throw new FeatureError("file_too_large", 413, "Аудио превышает 10 МиБ");
    if (!input.bytes.byteLength) throw new FeatureError("invalid_request", 400, "Пустой аудиофайл");
    if (input.signal?.aborted) throw timeout();

    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let rejectCancellation: (reason: FeatureError) => void = () => {};
    const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
    const cancel = () => {
      rejectCancellation(timeout());
      controller.abort();
      void reader?.cancel().catch(() => {});
    };
    input.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);

    const operation = async () => {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST", redirect: "error",
          headers: { "Content-Type": input.mimeType, ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: new Uint8Array(input.bytes), signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) throw timeout();
        throw unavailable();
      }
      // A fetch mock or nonstandard implementation can resolve after cancellation.
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        throw timeout();
      }
      if (!response.ok || !response.body) {
        void response.body?.cancel().catch(() => {});
        throw failed();
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        void response.body.cancel().catch(() => {});
        throw failed();
      }
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          void reader.cancel().catch(() => {});
          throw failed();
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return validateTranscript(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    };
    try {
      return await Promise.race([operation(), cancellation]);
    } catch (error) {
      if (error instanceof FeatureError) throw error;
      throw failed();
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", cancel);
    }
  };
}
