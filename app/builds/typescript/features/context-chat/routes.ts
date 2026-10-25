import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authorize } from "../../auth/authorize.js";
import { ContextChatError } from "./errors.js";
import type { ContextChatProvider } from "./provider.js";
import { createContextChatService } from "./service.js";

export async function registerContextChatRoutes(app: FastifyInstance, options: { memoryRoot: string; provider: ContextChatProvider }): Promise<void> {
  const service = createContextChatService(options);
  const execute = (handler: (request: FastifyRequest, signal: AbortSignal) => Promise<unknown>) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const onClose = () => { if (!reply.raw.writableEnded) abort(); };
      request.raw.on("aborted", abort);
      reply.raw.on("close", onClose);
      try {
        try {
          authorize(request.authContext, "memory_access");
          if (!request.authContext.actorId) throw new Error("Missing actor");
        } catch { throw new ContextChatError("forbidden", 403, "Недостаточно прав."); }
        return await handler(request, controller.signal);
      } catch (error) {
        if (error instanceof ContextChatError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
        // Do not log the model output, imported text, actor identity, secrets or paths.
        request.log.error("Context chat operation failed");
        return reply.code(500).send({ error: { code: "internal_error", message: "Не удалось загрузить или сохранить чат." } });
      } finally {
        request.raw.removeListener("aborted", abort);
        reply.raw.removeListener("close", onClose);
      }
    };
  const routeOptions = {
    bodyLimit: 24_000,
    errorHandler: (error: Error & { statusCode?: number }, request: FastifyRequest, reply: FastifyReply) => {
      if ([400, 413, 415].includes(error.statusCode ?? 0)) return reply.code(400).send({ error: { code: "invalid_request", message: "Некорректный запрос чата." } });
      return app.errorHandler(error, request, reply);
    },
  };
  const goalId = (request: FastifyRequest) => (request.params as { goalId: string }).goalId;
  app.get("/goals/:goalId/chat", routeOptions, execute((request) => service.getThread(request.authContext.actorId, goalId(request))));
  app.post("/goals/:goalId/chat", routeOptions, execute((request, signal) => service.postMessage(request.authContext.actorId, goalId(request), request.body, signal)));
}
