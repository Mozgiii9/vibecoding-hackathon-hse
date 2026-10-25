import Fastify, { type FastifyInstance } from "fastify";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../contracts.js";
import type { ContextProviders, EvidenceDraft, GoalWrite, ImportResult, Progress } from "../features/contracts.js";
import { registerHackathonFeatures } from "./hackathon.js";

const allowed = { "x-test-auth": "allow" };
const text = "Резюме получил, приглашаем на интервью.";
const importInput = { goalId: "demo", title: "Сообщение рекрутера", text };
const goalWrite: GoalWrite = {
  title: "Подготовиться к ML-собеседованию", deadline: "2026-11-01T17:30:00+03:00",
  criteria: [
    { id: "cv", description: "Отправить резюме", targetCount: 1, unit: "отправка" },
    { id: "mock", description: "Пройти интервью", targetCount: 2, unit: "интервью" },
    { id: "feedback", description: "Исправить замечание", targetCount: 1, unit: "исправление" },
  ],
  confirm: true, expectedRevision: null,
};

function extraction(eventType: EvidenceDraft["eventType"] = "completed_action") {
  return vi.fn<ContextProviders["extract"]>(async ({ source }) => [{
    criterionId: "cv", eventType, summary: "Отправка резюме",
    quote: source.text, textStart: 0, textEnd: source.text.length, startMs: null, endMs: null,
  }]);
}

describe("hackathon gateway integration", () => {
  let memoryRoot: string;
  const apps: FastifyInstance[] = [];

  beforeEach(async () => {
    memoryRoot = await mkdtemp(path.join(os.tmpdir(), "hackathon-gateway-"));
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await rm(memoryRoot, { recursive: true, force: true });
  });

  async function setup(providers?: ContextProviders): Promise<FastifyInstance> {
    const app = Fastify();
    apps.push(app);
    app.decorateRequest("authContext", null as unknown as AuthContext);
    // Match the root gateway's authentication phase; modules own memory_access checks.
    app.addHook("preHandler", async (request, reply) => {
      if (!request.headers["x-test-auth"]) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      request.authContext = {
        actorId: "test-owner", actorType: "owner", mode: "local",
        permissions: {
          memory_access: request.headers["x-test-auth"] === "allow",
          tool_access: false, system_actions: false, delegation: false,
          approval_authority: false, administration: false,
        },
      };
    });
    // The existing gateway already has a raw parser for unrelated upload routes.
    app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" },
      (_request, body, done) => done(null, body));
    await registerHackathonFeatures(app, { memoryRoot, env: {}, providers });
    app.post("/unrelated-json", async (request) => ({ body: request.body, buffer: Buffer.isBuffer(request.body) }));
    app.post("/unrelated-raw", async (request) => ({ buffer: Buffer.isBuffer(request.body) }));
    return app;
  }

  async function createGoal(app: FastifyInstance, confirm = true): Promise<void> {
    const response = await app.inject({
      method: "PUT", url: "/goals/demo", headers: allowed, payload: { ...goalWrite, confirm },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ goal: { id: "demo", revision: 1 } });
  }

  async function progress(app: FastifyInstance): Promise<Progress> {
    const response = await app.inject({ url: "/goals/demo/progress", headers: allowed });
    expect(response.statusCode).toBe(200);
    return response.json<{ progress: Progress }>().progress;
  }

  async function snapshot(): Promise<{ sources: unknown[]; evidence: unknown[] }> {
    return JSON.parse(await readFile(path.join(memoryRoot, "hackathon", "state.json"), "utf8"));
  }

  it("shares goal/import/review state, preserves duplicate IDs and restores rejected progress after restart", async () => {
    const extract = extraction();
    const app = await setup({ extract });
    await createGoal(app);
    const imported = await app.inject({ method: "POST", url: "/context/import", headers: allowed, payload: importInput });
    expect(imported.statusCode).toBe(200);
    const result = imported.json<ImportResult>();
    expect(result).toMatchObject({ duplicate: false, evidence: [{ status: "proposed", revision: 1 }] });
    expect((await progress(app)).criteria[0].confirmedCount).toBe(0);

    const confirmed = await app.inject({
      method: "PATCH", url: `/evidence/${result.evidence[0].id}`, headers: allowed,
      payload: { status: "confirmed", expectedRevision: 1 },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toMatchObject({ evidence: { status: "confirmed", revision: 2 } });
    expect((await progress(app)).criteria[0]).toMatchObject({ confirmedCount: 1, complete: true });

    const sourceResponse = await app.inject({ url: `/sources/${result.source.id}`, headers: allowed });
    expect(sourceResponse.statusCode).toBe(200);
    const source = sourceResponse.json<{ source: ImportResult["source"] }>().source;
    expect(source).toEqual(result.source);
    const entry = result.evidence[0];
    expect(source.text.slice(entry.textStart, entry.textEnd)).toBe(entry.quote);

    const duplicate = await app.inject({
      method: "POST", url: "/context/import", headers: allowed,
      payload: { ...importInput, title: "Другое название" },
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({
      duplicate: true, source: { id: source.id },
      evidence: [{ id: entry.id, status: "confirmed", revision: 2 }],
    });
    expect(extract).toHaveBeenCalledTimes(1);
    expect((await progress(app)).criteria[0].confirmedCount).toBe(1);

    const rejected = await app.inject({
      method: "PATCH", url: `/evidence/${entry.id}`, headers: allowed,
      payload: { status: "rejected", expectedRevision: 2 },
    });
    expect(rejected.statusCode).toBe(200);
    expect((await progress(app)).criteria[0].confirmedCount).toBe(0);
    await app.close();
    apps.splice(apps.indexOf(app), 1);

    const restarted = await setup({ extract });
    expect((await progress(restarted)).criteria[0].confirmedCount).toBe(0);
    const evidence = await restarted.inject({ url: "/goals/demo/evidence", headers: allowed });
    expect(evidence.json()).toMatchObject({ evidence: [{ id: entry.id, status: "rejected", revision: 3 }] });
    expect((await snapshot()).sources).toHaveLength(1);
  });

  it("keeps intentions proposed and rejects confirmation without increasing progress", async () => {
    const app = await setup({ extract: extraction("intention") });
    await createGoal(app);
    const imported = await app.inject({
      method: "POST", url: "/context/import", headers: allowed,
      payload: { ...importInput, text: "Завтра хочу отправить резюме." },
    });
    expect(imported.statusCode).toBe(200);
    const entry = imported.json<ImportResult>().evidence[0];
    expect(entry).toMatchObject({ eventType: "intention", status: "proposed" });
    const confirmed = await app.inject({
      method: "PATCH", url: `/evidence/${entry.id}`, headers: allowed,
      payload: { status: "confirmed", expectedRevision: 1 },
    });
    expect(confirmed.statusCode).toBe(422);
    expect(confirmed.json()).toMatchObject({ error: { code: "invalid_evidence" } });
    expect((await progress(app)).criteria.every((criterion) => criterion.confirmedCount === 0)).toBe(true);
  });

  it("preserves root 401 and module 403 on every goal, source, review and context route", async () => {
    const extract = extraction();
    const app = await setup({ extract });
    await createGoal(app);
    const imported = await app.inject({ method: "POST", url: "/context/import", headers: allowed, payload: importInput });
    const result = imported.json<ImportResult>();
    const routes = [
      { method: "PUT", url: "/goals/demo", payload: { ...goalWrite, expectedRevision: 1 } },
      { method: "GET", url: "/goals/demo" },
      { method: "GET", url: "/goals/demo/evidence" },
      { method: "GET", url: "/goals/demo/progress" },
      { method: "GET", url: `/sources/${result.source.id}` },
      { method: "PATCH", url: `/evidence/${result.evidence[0].id}`, payload: { status: "confirmed", expectedRevision: 1 } },
      { method: "POST", url: "/context/import", payload: importInput },
      { method: "POST", url: "/context/audio?goalId=demo&title=Audio", payload: Buffer.from("audio"), headers: { "content-type": "audio/wav" } },
    ] as const;
    for (const route of routes) {
      const unauthenticated = await app.inject(route);
      expect(unauthenticated.statusCode, route.url).toBe(401);
      expect(unauthenticated.json()).toEqual({ error: "Unauthorized" });
      const denied = await app.inject({ ...route, headers: { ...("headers" in route ? route.headers : {}), "x-test-auth": "deny" } });
      expect(denied.statusCode, route.url).toBe(403);
      expect(denied.json()).toEqual({ error: { code: "forbidden", message: "Недостаточно прав" } });
    }
    expect(extract).toHaveBeenCalledTimes(1);
    expect((await progress(app)).criteria[0].confirmedCount).toBe(0);
  });

  it("starts without provider configuration and returns clean 503 without persisting partial sources", async () => {
    const app = await setup();
    await createGoal(app);
    const response = await app.inject({ method: "POST", url: "/context/import", headers: allowed, payload: importInput });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: { code: "provider_unconfigured", message: expect.any(String) } });
    const audio = await app.inject({
      method: "POST", url: "/context/audio?goalId=demo&title=Audio",
      headers: { ...allowed, "content-type": "audio/wav" }, payload: Buffer.from("audio"),
    });
    expect(audio.statusCode).toBe(503);
    expect(audio.json()).toMatchObject({ error: { code: "stt_unconfigured" } });
    expect(await snapshot()).toMatchObject({ sources: [], evidence: [] });
  });

  it("requires a confirmed goal before calling extraction", async () => {
    const extract = extraction();
    const app = await setup({ extract });
    await createGoal(app, false);
    const response = await app.inject({ method: "POST", url: "/context/import", headers: allowed, payload: importInput });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "goal_unconfirmed" } });
    expect(extract).not.toHaveBeenCalled();
    expect(await snapshot()).toMatchObject({ sources: [], evidence: [] });
  });

  it("rejects invalid provider proposals atomically instead of storing an empty successful import", async () => {
    const extract = extraction();
    extract.mockImplementationOnce(async ({ source }) => [{
      criterionId: "unknown", eventType: "completed_action", summary: "Неверный критерий",
      quote: source.text, textStart: 0, textEnd: source.text.length, startMs: null, endMs: null,
    }]);
    const app = await setup({ extract });
    await createGoal(app);
    const response = await app.inject({ method: "POST", url: "/context/import", headers: allowed, payload: importInput });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: "provider_failed" } });
    expect(await snapshot()).toMatchObject({ sources: [], evidence: [] });
  });

  it("isolates the audio parser, validates MIME and keeps the gateway's other JSON/raw routes intact", async () => {
    const bytes = Buffer.from("synthetic audio bytes");
    const transcribe = vi.fn<NonNullable<ContextProviders["transcribe"]>>(async () => ({ text, segments: [] }));
    const app = await setup({ extract: extraction(), transcribe });
    await createGoal(app);
    const unsupported = await app.inject({
      method: "POST", url: "/context/audio?goalId=demo&title=Audio",
      headers: { ...allowed, "content-type": "application/octet-stream" }, payload: bytes,
    });
    expect(unsupported.statusCode).toBe(415);
    expect(unsupported.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
    expect(transcribe).not.toHaveBeenCalled();
    const audio = await app.inject({
      method: "POST", url: "/context/audio?goalId=demo&title=Audio",
      headers: { ...allowed, "content-type": "audio/webm; codecs=opus" }, payload: bytes,
    });
    expect(audio.statusCode).toBe(200);
    expect(audio.json()).toMatchObject({ source: { kind: "audio", text, segments: [] }, evidence: [{ startMs: null, endMs: null }] });
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ bytes, mimeType: "audio/webm" }));
    const json = await app.inject({ method: "POST", url: "/unrelated-json", headers: allowed, payload: { hello: "world" } });
    expect(json.json()).toEqual({ body: { hello: "world" }, buffer: false });
    const raw = await app.inject({
      method: "POST", url: "/unrelated-raw", headers: { ...allowed, "content-type": "application/octet-stream" }, payload: bytes,
    });
    expect(raw.json()).toEqual({ buffer: true });
    const unrelatedAudio = await app.inject({
      method: "POST", url: "/unrelated-json", headers: { ...allowed, "content-type": "audio/webm" }, payload: bytes,
    });
    expect(unrelatedAudio.statusCode).toBe(415);
  });
});
