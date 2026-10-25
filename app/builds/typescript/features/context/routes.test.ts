import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../../contracts.js";
import { FeatureError, type ContextProviders } from "../contracts.js";
import { registerContextRoutes, createContextProviders } from "./index.js";
import { createTestStore } from "./test-store.js";
import { MAX_AUDIO_BYTES } from "./validation.js";

const auth: AuthContext = {
  actorId: "test-owner", actorType: "owner", mode: "local",
  permissions: { memory_access: true, tool_access: false, system_actions: false, delegation: false, approval_authority: false, administration: false },
};
const request = { goalId: "demo", title: "Тест", text: "Завтра хочу отправить резюме." };
const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

async function setup(providers: ContextProviders = createContextProviders({}), memory = true, loggedIn = true) {
  const app = Fastify();
  apps.push(app);
  app.addHook("preHandler", async (req, reply) => {
    if (!loggedIn) { reply.code(401).send({ error: "Unauthorized" }); return; }
    req.authContext = { ...auth, permissions: { ...auth.permissions, memory_access: memory } };
  });
  const store = createTestStore();
  await registerContextRoutes(app, { store, providers });
  app.post("/unrelated-json", async (req) => req.body);
  return { app, store };
}

describe("context routes", () => {
  it("returns explicit unconfigured errors without commits", async () => {
    const { app, store } = await setup();
    const commit = vi.spyOn(store, "commitImport");
    const response = await app.inject({ method: "POST", url: "/context/import", payload: request });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: { code: "provider_unconfigured", message: expect.any(String) } });
    const audio = await app.inject({ method: "POST", url: "/context/audio?goalId=demo&title=Test", headers: { "content-type": "audio/wav" }, payload: Buffer.from("audio") });
    expect(audio.statusCode).toBe(503);
    expect(audio.json().error.code).toBe("stt_unconfigured");
    expect(commit).not.toHaveBeenCalled();
  });

  it("returns the direct ImportResult with no result wrapper", async () => {
    const extract = vi.fn(async () => []);
    const { app } = await setup({ extract });
    const response = await app.inject({ method: "POST", url: "/context/import", payload: request });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ source: { kind: "text", text: request.text }, evidence: [], duplicate: false });
    expect(response.json().result).toBeUndefined();
    expect(extract.mock.calls).toHaveLength(1);
  });

  it.each(["/context/import", "/context/audio?goalId=demo&title=x"])("requires memory_access after gateway auth on %s", async (url) => {
    const { app } = await setup(undefined, false);
    const response = await app.inject({ method: "POST", url, payload: request });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: { code: "forbidden", message: "Недостаточно прав" } });
  });

  it("preserves the existing gateway 401", async () => {
    const { app } = await setup(undefined, true, false);
    const response = await app.inject({ method: "POST", url: "/context/import", payload: request });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized" });
  });

  it.each([{}, { ...request, text: "  " }, { ...request, text: "x".repeat(50_001) }, { ...request, title: "x".repeat(201) }, { ...request, capturedAt: "yesterday" }, { ...request, confirmed: true }])("rejects invalid text input %#", async (payload) => {
    const extract = vi.fn(async () => []);
    const { app } = await setup({ extract });
    const response = await app.inject({ method: "POST", url: "/context/import", payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_request");
    expect(extract).not.toHaveBeenCalled();
  });

  it("maps malformed JSON to the stable error envelope", async () => {
    const { app } = await setup();
    const response = await app.inject({ method: "POST", url: "/context/import", headers: { "content-type": "application/json" }, payload: "{" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_request");
  });

  it("rejects oversized audio and unsupported MIME before STT", async () => {
    const transcribe = vi.fn(async () => ({ text: "text", segments: [] }));
    const { app } = await setup({ extract: vi.fn(async () => []), transcribe });
    const oversized = await app.inject({ method: "POST", url: "/context/audio?goalId=demo&title=x", headers: { "content-type": "audio/wav" }, payload: Buffer.alloc(MAX_AUDIO_BYTES + 1) });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json().error.code).toBe("file_too_large");
    const wrongMime = await app.inject({ method: "POST", url: "/context/audio?goalId=demo&title=x", headers: { "content-type": "application/octet-stream" }, payload: Buffer.from("x") });
    expect(wrongMime.statusCode).toBe(415);
    expect(wrongMime.json().error.code).toBe("unsupported_media_type");
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("keeps the audio buffer parser isolated from JSON routes", async () => {
    const { app } = await setup({ extract: vi.fn(async () => []), transcribe: vi.fn(async () => ({ text: "Расшифровка", segments: [] })) });
    const response = await app.inject({ method: "POST", url: "/context/audio?goalId=demo&title=x", headers: { "content-type": "audio/webm; codecs=opus" }, payload: Buffer.from("synthetic audio bytes") });
    expect(response.statusCode).toBe(200);
    expect(response.json().source).toMatchObject({ kind: "audio", text: "Расшифровка", segments: [] });
    const json = await app.inject({ method: "POST", url: "/unrelated-json", payload: { hello: "world" } });
    expect(json.json()).toEqual({ hello: "world" });
  });

  it("propagates core revision errors and hides unexpected error details", async () => {
    const { app, store } = await setup({ extract: vi.fn(async () => []) });
    vi.spyOn(store, "commitImport").mockRejectedValueOnce(new FeatureError("goal_changed", 409, "Цель изменилась, повторите обработку"));
    const changed = await app.inject({ method: "POST", url: "/context/import", payload: request });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe("goal_changed");
    vi.spyOn(store, "getConfirmedGoal").mockRejectedValueOnce(new Error("secret/upstream/body"));
    const failure = await app.inject({ method: "POST", url: "/context/import", payload: request });
    expect(failure.statusCode).toBe(502);
    expect(failure.body).not.toContain("secret");
  });
});
