import Fastify, { type FastifyInstance } from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../../contracts.js";
import type { GoalsStore } from "../contracts.js";
import { createGoalsStore, registerGoalsRoutes } from "./index.js";
import { goalWrite, importText } from "./test-helpers.js";

const allowed = { "x-test-access": "allow" };

describe("goals HTTP routes", () => {
  let memoryRoot: string;
  let app: FastifyInstance;
  let store: GoalsStore;

  beforeEach(async () => {
    memoryRoot = await mkdtemp(path.join(os.tmpdir(), "goals-http-"));
    store = await createGoalsStore({ memoryRoot });
    app = Fastify({ bodyLimit: 4096 });
    app.decorateRequest("authContext", null as unknown as AuthContext);
    // Simulate an upstream auth hook; production owns real BrainDrive authentication.
    app.addHook("onRequest", async (request, reply) => {
      if (request.headers["x-test-access"] === "unauthenticated") {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      if (request.headers["x-test-access"] === "missing-context") return;
      request.authContext = {
        actorId: "test-owner", actorType: "owner", mode: "local",
        permissions: {
          memory_access: request.headers["x-test-access"] === "allow",
          tool_access: true, system_actions: false, delegation: false,
          approval_authority: false, administration: false,
        },
      };
    });
    await registerGoalsRoutes(app, { store });
    app.post("/unrelated", async () => ({ ok: true }));
  });

  afterEach(async () => {
    await app.close();
    await rm(memoryRoot, { recursive: true, force: true });
  });

  it("serves the full goal/import/review/progress/source scenario without extra wrappers", async () => {
    const created = await app.inject({ method: "PUT", url: "/goals/demo", headers: allowed, payload: goalWrite() });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ goal: { id: "demo", revision: 1 } });
    expect((await app.inject({ url: "/goals/demo", headers: allowed })).json()).toEqual(created.json());
    const result = await importText(store);
    const evidenceId = result.evidence[0].id;
    const list = await app.inject({ url: "/goals/demo/evidence", headers: allowed });
    expect(list.json()).toEqual({ evidence: result.evidence });
    const source = await app.inject({ url: `/sources/${result.source.id}`, headers: allowed });
    expect(source.json()).toEqual({ source: result.source });
    const review = await app.inject({
      method: "PATCH", url: `/evidence/${evidenceId}`, headers: allowed,
      payload: { status: "confirmed", expectedRevision: 1 },
    });
    expect(review.statusCode).toBe(200);
    expect(review.json()).toMatchObject({ evidence: { id: evidenceId, status: "confirmed", revision: 2 } });
    const progress = await app.inject({ url: "/goals/demo/progress", headers: allowed });
    expect(progress.statusCode).toBe(200);
    expect(progress.json()).toMatchObject({ progress: {
      goalId: "demo", goalRevision: 1,
      criteria: [{ criterionId: "cv", confirmedCount: 1 }, { criterionId: "mock", confirmedCount: 0 }],
      nextStep: { kind: "rule" },
    } });
  });

  it.each([
    ["PUT", "/goals/demo", goalWrite()], ["GET", "/goals/demo", undefined],
    ["GET", "/goals/demo/evidence", undefined], ["GET", "/goals/demo/progress", undefined],
    ["GET", "/sources/source", undefined],
    ["PATCH", "/evidence/evidence", { status: "confirmed", expectedRevision: 1 }],
  ] as const)("%s %s requires memory_access", async (method, url, payload) => {
    const response = await app.inject({ method, url, payload });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: { code: "forbidden", message: "Недостаточно прав" } });
    expect(await store.getGoal("demo")).toBeNull();
  });

  it("rejects a missing auth context and preserves upstream 401 response format", async () => {
    const missing = await app.inject({ url: "/goals/demo", headers: { "x-test-access": "missing-context" } });
    expect(missing.statusCode).toBe(403);
    const unauthenticated = await app.inject({
      url: "/goals/demo", headers: { "x-test-access": "unauthenticated" },
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ error: "Unauthorized" });
  });

  it.each(["/goals/absent", "/goals/absent/evidence", "/goals/absent/progress", "/sources/absent"])(
    "returns stable 404 for %s", async (url) => {
      const response = await app.inject({ url, headers: allowed });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: "not_found" } });
    },
  );

  it.each([
    { ...goalWrite(), criteria: [{ ...goalWrite().criteria[0], targetCount: 0 }] },
    { ...goalWrite(), criteria: [{ ...goalWrite().criteria[0], targetCount: 1.2 }] },
    { ...goalWrite(), criteria: [{ ...goalWrite().criteria[0], targetCount: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...goalWrite(), criteria: [goalWrite().criteria[0], goalWrite().criteria[0]] },
    { ...goalWrite(), title: " " }, { ...goalWrite(), expectedRevision: "1" },
    { ...goalWrite(), progress: 100 }, null, [],
  ])("validates external goal writes at runtime: %j", async (payload) => {
    const response = await app.inject({
      method: "PUT", url: "/goals/demo", headers: { ...allowed, "content-type": "application/json" },
      payload: JSON.stringify(payload),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(await store.getGoal("demo")).toBeNull();
  });

  it("maps parser errors locally without changing unrelated routes", async () => {
    for (const url of ["/goals/demo", "/evidence/absent"]) {
      const response = await app.inject({
        method: url.startsWith("/goals") ? "PUT" : "PATCH", url,
        headers: { ...allowed, "content-type": "application/json" }, payload: "{",
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: { code: "invalid_request", message: "Некорректный запрос" } });
    }
    const unrelated = await app.inject({
      method: "POST", url: "/unrelated", headers: { "content-type": "application/json" }, payload: "{",
    });
    expect(unrelated.json()).toMatchObject({ code: "FST_ERR_CTP_INVALID_JSON_BODY" });
  });

  it("maps oversized payloads and unsupported media types to stable errors", async () => {
    const oversized = await app.inject({
      method: "PUT", url: "/goals/demo", headers: allowed,
      payload: { ...goalWrite(), title: "x".repeat(5000) },
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json()).toMatchObject({ error: { code: "file_too_large" } });
    const media = await app.inject({
      method: "PUT", url: "/goals/demo", headers: { ...allowed, "content-type": "application/octet-stream" },
      payload: "arbitrary bytes",
    });
    expect(media.statusCode).toBe(415);
    expect(media.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
  });

  it("maps revision conflict, invalid confirmation, missing evidence and goal lock", async () => {
    await store.saveGoal("demo", goalWrite());
    const conflict = await app.inject({ method: "PUT", url: "/goals/demo", headers: allowed, payload: goalWrite() });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ error: { code: "revision_conflict" } });
    const result = await importText(store, "Хочу отправить резюме.", { eventType: "intention" });
    const invalid = await app.inject({
      method: "PATCH", url: `/evidence/${result.evidence[0].id}`, headers: allowed,
      payload: { status: "confirmed", expectedRevision: 1 },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json()).toMatchObject({ error: { code: "invalid_evidence" } });
    const missing = await app.inject({
      method: "PATCH", url: "/evidence/absent", headers: allowed,
      payload: { status: "confirmed", expectedRevision: 1 },
    });
    expect(missing.statusCode).toBe(404);
    const locked = await app.inject({
      method: "PUT", url: "/goals/demo", headers: allowed,
      payload: goalWrite({ expectedRevision: 1, title: "Изменённая цель" }),
    });
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toMatchObject({ error: { code: "goal_locked" } });
  });

  it("does not accept client-controlled event types or counters during review", async () => {
    await store.saveGoal("demo", goalWrite());
    const { evidence: [entry] } = await importText(store);
    const response = await app.inject({
      method: "PATCH", url: `/evidence/${entry.id}`, headers: allowed,
      payload: { status: "confirmed", expectedRevision: 1, eventType: "completed_action", confirmedCount: 100 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect((await store.getProgress("demo")).criteria[0].confirmedCount).toBe(0);
  });

  it("storage failure returns 500 without leaking filesystem paths or success", async () => {
    vi.spyOn(store, "saveGoal").mockRejectedValueOnce(new Error("secret /private/memory/path"));
    const response = await app.inject({ method: "PUT", url: "/goals/demo", headers: allowed, payload: goalWrite() });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { code: "internal_error", message: "Не удалось выполнить операцию" } });
    expect(response.body).not.toContain("secret");
    expect(await store.getGoal("demo")).toBeNull();
  });
});
