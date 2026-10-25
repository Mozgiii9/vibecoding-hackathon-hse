import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authorize } from "../../auth/authorize.js";
import { FeatureError } from "../contracts.js";
import { AUDIO_MIME_TYPES, importAudio, importText, type ContextDependencies } from "./ingestion.js";
import { MAX_AUDIO_BYTES } from "./validation.js";

export { createContextProviders } from "./providers.js";

async function requireMemoryAccess(request: FastifyRequest): Promise<void> {
  try { authorize(request.authContext, "memory_access"); }
  catch { throw new FeatureError("forbidden", 403, "Недостаточно прав"); }
}

function routeError(error: unknown, _request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof FeatureError) {
    reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    return;
  }
  const code = (error as { code?: string })?.code;
  if (code === "FST_ERR_CTP_BODY_TOO_LARGE") {
    reply.code(413).send({ error: { code: "file_too_large", message: "Превышен размер запроса" } });
  } else if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
    reply.code(415).send({ error: { code: "unsupported_media_type", message: "Неподдерживаемый формат" } });
  } else if ((error as { statusCode?: number })?.statusCode === 400) {
    reply.code(400).send({ error: { code: "invalid_request", message: "Некорректный запрос" } });
  } else {
    reply.code(502).send({ error: { code: "provider_failed", message: "Не удалось обработать запрос" } });
  }
}

async function withRequestSignal<T>(request: FastifyRequest, reply: FastifyReply, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => { if (!reply.raw.writableEnded) abort(); };
  request.raw.once("aborted", abort);
  reply.raw.once("close", close);
  try { return await work(controller.signal); }
  finally {
    request.raw.off("aborted", abort);
    reply.raw.off("close", close);
  }
}

export async function registerContextRoutes(app: FastifyInstance, deps: ContextDependencies): Promise<void> {
  app.post("/context/import", {
    bodyLimit: 512 * 1024, preHandler: requireMemoryAccess, errorHandler: routeError,
  }, (request, reply) => withRequestSignal(request, reply, (signal) => importText(deps, request.body, signal)));

  await app.register(async (audio) => {
    audio.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: MAX_AUDIO_BYTES }, (_request, body, done) => done(null, body));
    audio.post("/context/audio", {
      bodyLimit: MAX_AUDIO_BYTES,
      preHandler: async (request) => {
        await requireMemoryAccess(request);
        const mimeType = request.headers["content-type"]?.split(";")[0].trim().toLowerCase() ?? "";
        if (!AUDIO_MIME_TYPES.has(mimeType)) throw new FeatureError("unsupported_media_type", 415, "Неподдерживаемый формат аудио");
      },
      errorHandler: routeError,
    }, (request, reply) => withRequestSignal(request, reply, (signal) => {
      const mimeType = request.headers["content-type"]!.split(";")[0].trim().toLowerCase();
      if (!Buffer.isBuffer(request.body)) throw new FeatureError("invalid_request", 400, "Ожидаются байты аудиофайла");
      return importAudio(deps, request.query, request.body, mimeType, signal);
    }));
  });
}
