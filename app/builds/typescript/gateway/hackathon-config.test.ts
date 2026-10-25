import { describe, expect, it } from "vitest";

import { HackathonConfigError, readHackathonProviderConfig } from "./hackathon-config.js";

describe("readHackathonProviderConfig", () => {
  it("allows startup without configured providers and does not infer protocol or model", () => {
    expect(Object.values(readHackathonProviderConfig({})).every((value) => value === undefined)).toBe(true);
    const config = readHackathonProviderConfig({ HACKATHON_LLM_API_KEY: "test-key", HACKATHON_LLM_MODEL: "  " });
    expect(config.apiKey).toBe("test-key");
    expect(config.protocol).toBeUndefined();
    expect(config.model).toBeUndefined();
    expect(config.stt).toBeUndefined();
  });

  it.each(["openai-compatible", "gemini-native"])("passes explicit %s configuration without mutating the environment", (protocol) => {
    const env = Object.freeze({
      HACKATHON_LLM_PROTOCOL: protocol,
      HACKATHON_LLM_BASE_URL: "https://provider.example/v1/",
      HACKATHON_LLM_MODEL: " chosen-model ",
      HACKATHON_LLM_API_KEY: "test-llm-key",
      HACKATHON_LLM_TIMEOUT_MS: "30000",
      HACKATHON_STT_BASE_URL: "http://localhost:9000/v1",
      HACKATHON_STT_MODEL: "chosen-stt-model",
      HACKATHON_STT_API_KEY: "test-stt-key",
    });
    expect(readHackathonProviderConfig(env)).toEqual({
      protocol, baseUrl: env.HACKATHON_LLM_BASE_URL, model: "chosen-model",
      apiKey: "test-llm-key", timeoutMs: 30000,
      stt: { baseUrl: env.HACKATHON_STT_BASE_URL, model: "chosen-stt-model", apiKey: "test-stt-key" },
    });
  });

  it.each(["http://localhost:8000/v1", "http://127.0.0.1/v1", "http://[::1]:8000/v1", "https://provider.example/v1"])("accepts %s", (baseUrl) => {
    expect(readHackathonProviderConfig({ HACKATHON_LLM_BASE_URL: baseUrl }).baseUrl).toBe(baseUrl);
  });

  it.each(["HACKATHON_STT_BASE_URL", "HACKATHON_STT_MODEL", "HACKATHON_STT_API_KEY"])("leaves incomplete STT unconfigured when %s is absent", (missing) => {
    const env: NodeJS.ProcessEnv = {
      HACKATHON_STT_BASE_URL: "https://speech.example/v1",
      HACKATHON_STT_MODEL: "speech-model",
      HACKATHON_STT_API_KEY: "speech-key",
    };
    delete env[missing];
    expect(readHackathonProviderConfig(env).stt).toBeUndefined();
  });

  it.each(["0", "-1", "1.5", "Infinity", "1e3", "oops", "300001", "2147483648"])("rejects timeout %s without echoing its value", (timeout) => {
    expect(() => readHackathonProviderConfig({ HACKATHON_LLM_TIMEOUT_MS: timeout })).toThrow(HackathonConfigError);
  });

  it.each(["HACKATHON_LLM_BASE_URL", "HACKATHON_STT_BASE_URL"])("validates %s even if other fields are absent and never leaks URL data", (field) => {
    const invalidUrls = [
      "not-a-url-secret", "file:///secret", "ftp://host/secret",
      "http://public.example/secret", "http://localhost.attacker.example/secret",
      "https://user:secret@provider.example/v1",
      "https://provider.example/v1?api_key=secret", "https://provider.example/v1#secret",
    ];
    for (const value of invalidUrls) {
      let caught: unknown;
      try { readHackathonProviderConfig({ [field]: value }); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(HackathonConfigError);
      expect(caught).toMatchObject({ field });
      expect(String(caught)).not.toContain("secret");
      expect(String(caught)).not.toContain(value);
      expect(JSON.stringify(caught)).not.toContain("secret");
    }
  });

  it("rejects unknown protocols without leaking a mistakenly pasted credential", () => {
    expect(() => readHackathonProviderConfig({ HACKATHON_LLM_PROTOCOL: "secret-provider-key" }))
      .toThrow("HACKATHON_LLM_PROTOCOL: Expected openai-compatible or gemini-native");
  });
});
