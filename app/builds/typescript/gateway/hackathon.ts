import type { FastifyInstance } from "fastify";
import type { ContextProviders } from "../features/contracts.js";
import { createContextProviders, registerContextRoutes } from "../features/context/index.js";
import { createGoalsStore, registerGoalsRoutes } from "../features/goals/index.js";
import { createContextChatProvider, registerContextChatRoutes, type ContextChatProvider } from "../features/context-chat/index.js";
import { readHackathonProviderConfig } from "./hackathon-config.js";

/** Registers both modules over one store after the gateway's existing auth hooks. */
export async function registerHackathonFeatures(app: FastifyInstance, options: {
  memoryRoot: string;
  env?: NodeJS.ProcessEnv;
  /** Dependency injection for tests; runtime providers come from server environment. */
  providers?: ContextProviders;
  chatProvider?: ContextChatProvider;
}): Promise<void> {
  const store = await createGoalsStore({ memoryRoot: options.memoryRoot });
  const providers = options.providers
    ?? createContextProviders(readHackathonProviderConfig(options.env ?? process.env));

  await registerGoalsRoutes(app, { store });
  await registerContextRoutes(app, { store, providers });
  await registerContextChatRoutes(app, { memoryRoot: options.memoryRoot,
    provider: options.chatProvider ?? createContextChatProvider(readHackathonProviderConfig(options.env ?? process.env)) });
}
