import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authorize } from "../../auth/authorize.js";
import { FeatureError, type GoalsStore } from "../contracts.js";
import { idSchema, parseInput } from "./schemas.js";

type Handler = (request: FastifyRequest) => Promise<unknown>;

function route(handler: Handler) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      try {
        authorize(request.authContext, "memory_access");
      } catch {
        throw new FeatureError("forbidden", 403, "Недостаточно прав");
      }
      return await handler(request);
    } catch (error) {
      if (error instanceof FeatureError) {
        return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      }
      // Storage failures stay failures, with no paths, stack traces or source text in the response.
      request.log.error({ err: error }, "Goals operation failed");
      return reply.code(500).send({ error: { code: "internal_error", message: "Не удалось выполнить операцию" } });
    }
  };
}

function parameter(request: FastifyRequest, name: string): string {
  return parseInput(idSchema, (request.params as Record<string, unknown>)[name]);
}

export async function registerGoalsRoutes(app: FastifyInstance, deps: { store: GoalsStore }): Promise<void> {
  const { store } = deps;
  // Parsing happens before the handler; scope its error translation to our routes.
  const options = {
    errorHandler: (error: Error & { statusCode?: number }, request: FastifyRequest, reply: FastifyReply) => {
      const code = error.statusCode;
      if (code === 400 || code === 413 || code === 415) {
        return reply.code(code).send({ error: {
          code: code === 413 ? "file_too_large" : code === 415 ? "unsupported_media_type" : "invalid_request",
          message: code === 413 ? "Превышен размер запроса" : code === 415 ? "Неподдерживаемый тип данных" : "Некорректный запрос",
        } });
      }
      return app.errorHandler(error, request, reply);
    },
  };

  app.put("/goals/:goalId", options, route(async (request) => ({
    goal: await store.saveGoal(parameter(request, "goalId"), request.body as Parameters<GoalsStore["saveGoal"]>[1]),
  })));

  app.get("/goals/:goalId", options, route(async (request) => {
    const goal = await store.getGoal(parameter(request, "goalId"));
    if (!goal) throw new FeatureError("not_found", 404, "Цель не найдена");
    return { goal };
  }));

  app.get("/goals/:goalId/evidence", options, route(async (request) => ({
    evidence: await store.listEvidence(parameter(request, "goalId")),
  })));

  app.get("/goals/:goalId/progress", options, route(async (request) => ({
    progress: await store.getProgress(parameter(request, "goalId")),
  })));

  app.get("/sources/:sourceId", options, route(async (request) => {
    const source = await store.getSource(parameter(request, "sourceId"));
    if (!source) throw new FeatureError("not_found", 404, "Источник не найден");
    return { source };
  }));

  app.patch("/evidence/:evidenceId", options, route(async (request) => ({
    evidence: await store.reviewEvidence(
      parameter(request, "evidenceId"), request.body as Parameters<GoalsStore["reviewEvidence"]>[1],
    ),
  })));
}
