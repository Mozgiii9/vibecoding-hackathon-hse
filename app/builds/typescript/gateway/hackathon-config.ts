/** Server-only configuration accepted by the context provider factory. */
export type HackathonProviderConfig = {
  protocol?: "openai-compatible" | "gemini-native";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  stt?: { baseUrl: string; model: string; apiKey: string };
};

type ConfigField =
  | "HACKATHON_LLM_PROTOCOL"
  | "HACKATHON_LLM_BASE_URL"
  | "HACKATHON_LLM_TIMEOUT_MS"
  | "HACKATHON_STT_BASE_URL";

/** Contains field names only: environment values must never enter diagnostics. */
export class HackathonConfigError extends Error {
  constructor(readonly field: ConfigField, reason: string) {
    super(`${field}: ${reason}`);
    this.name = "HackathonConfigError";
  }
}

function optionalValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return env[key]?.trim() || undefined;
}

function readBaseUrl(env: NodeJS.ProcessEnv, field: ConfigField): string | undefined {
  const value = optionalValue(env, field);
  if (!value) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HackathonConfigError(field, "Expected an absolute HTTP(S) base URL");
  }

  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "[::1]" ||
    /^127\.\d+\.\d+\.\d+$/.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new HackathonConfigError(field, "Use HTTPS or HTTP on localhost/loopback");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new HackathonConfigError(field, "Credentials, query strings and fragments are not allowed");
  }
  return value;
}

/** Reads environment without defaults or I/O; incomplete providers stay unconfigured. */
export function readHackathonProviderConfig(env: NodeJS.ProcessEnv): HackathonProviderConfig {
  const protocol = optionalValue(env, "HACKATHON_LLM_PROTOCOL");
  if (protocol !== undefined && protocol !== "openai-compatible" && protocol !== "gemini-native") {
    throw new HackathonConfigError("HACKATHON_LLM_PROTOCOL", "Expected openai-compatible or gemini-native");
  }

  const timeout = optionalValue(env, "HACKATHON_LLM_TIMEOUT_MS");
  let timeoutMs: number | undefined;
  if (timeout) {
    timeoutMs = Number(timeout);
    // Match the bounded transport in features/context/providers.ts.
    if (!/^\d+$/.test(timeout) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
      throw new HackathonConfigError("HACKATHON_LLM_TIMEOUT_MS", "Expected an integer between 1 and 300000 milliseconds");
    }
  }

  const sttBaseUrl = readBaseUrl(env, "HACKATHON_STT_BASE_URL");
  const sttModel = optionalValue(env, "HACKATHON_STT_MODEL");
  const sttApiKey = optionalValue(env, "HACKATHON_STT_API_KEY");

  return {
    protocol,
    baseUrl: readBaseUrl(env, "HACKATHON_LLM_BASE_URL"),
    model: optionalValue(env, "HACKATHON_LLM_MODEL"),
    apiKey: optionalValue(env, "HACKATHON_LLM_API_KEY"),
    timeoutMs,
    stt: sttBaseUrl && sttModel && sttApiKey
      ? { baseUrl: sttBaseUrl, model: sttModel, apiKey: sttApiKey }
      : undefined,
  };
}
