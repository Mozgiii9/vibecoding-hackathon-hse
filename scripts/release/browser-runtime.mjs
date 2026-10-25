import { createServer } from "node:http";
import net from "node:net";
import { mkdtemp, mkdir, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runtime = path.join(root, "app/builds/typescript");
const web = path.join(runtime, "client_web");
const gatewayPort = Number(process.env.RELEASE_GATEWAY_PORT ?? 8891);
const webPort = Number(process.env.RELEASE_WEB_PORT ?? 5091);
const mode = process.env.RELEASE_MODE ?? "fake";
if (!["fake", "live"].includes(mode)) throw new Error("RELEASE_MODE must be fake or live");
if (mode === "live" && !process.env.HACKATHON_LLM_API_KEY) throw new Error("Live runtime requires private HACKATHON_LLM configuration");
if ([gatewayPort, webPort].some((port) => [8787, 5073, 8911, 8912, 8913].includes(port)) || gatewayPort === webPort) {
  throw new Error("Release ports conflict with reserved ports");
}
for (const port of [gatewayPort, webPort]) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => reject(new Error(`Cannot reserve release port ${port}: ${error.code}`)));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

const isolated = await mkdtemp(path.join(tmpdir(), "ryadom-browser-"));
let app;
let vite;
let provider;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  vite?.kill("SIGTERM");
  await app?.close();
  provider?.closeAllConnections();
  await new Promise((resolve) => provider ? provider.close(resolve) : resolve());
  await rm(isolated, { recursive: true, force: true });
  process.exit(code);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());

try {
  // This is a protocol fake, explicitly named in every result. Auth, routing,
  // extraction validation, goals store, review and progress use production code.
  if (mode === "fake") {
    provider = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(JSON.parse(body).messages.at(-1).content);
      const text = input.source.text;
      if (text.includes("RELEASE_TIMEOUT")) return; // Bounded production transport must time out.
      if (text.includes("RELEASE_UNAVAILABLE")) { response.writeHead(503).end(); return; }
      const quote = text;
      const evidence = [{ criterionId: "cv", eventType: text.includes("Планирую") ? "intention" : "completed_action", summary: text, quote, textStart: 0, textEnd: text.length, startMs: null, endMs: null }];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: text.includes("RELEASE_INVALID") ? "invalid JSON" : JSON.stringify(evidence) }, finish_reason: "stop" }] }));
    });
    await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
    Object.assign(process.env, {
      HACKATHON_LLM_PROTOCOL: "openai-compatible",
      HACKATHON_LLM_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`,
      HACKATHON_LLM_MODEL: "release-protocol-fake",
      HACKATHON_LLM_API_KEY: "synthetic-release-key",
      HACKATHON_LLM_TIMEOUT_MS: "600",
    });
    delete process.env.HACKATHON_STT_BASE_URL;
    delete process.env.HACKATHON_STT_API_KEY;
    delete process.env.HACKATHON_STT_MODEL;
  }
  if (mode === "live" && process.env.RELEASE_PROVIDER_DIAGNOSTICS === "1") {
    const originalFetch = globalThis.fetch;
    const endpoint = `${process.env.HACKATHON_LLM_BASE_URL?.replace(/\/+$/, "")}/chat/completions`;
    globalThis.fetch = async (url, options) => {
      const response = await originalFetch(url, options);
      if (String(url) === endpoint) {
        try {
          const payload = await response.clone().json();
          const content = payload?.choices?.[0]?.message?.content;
          const input = JSON.parse(JSON.parse(options.body).messages.at(-1).content);
          let events;
          try { events = JSON.parse(content); } catch { /* Only a format flag is logged below. */ }
          console.log(`LIVE provider diagnostic ${JSON.stringify({
            status: response.status,
            contentIsString: typeof content === "string",
            markdownFence: typeof content === "string" && content.trim().startsWith("```"),
            finishReason: payload?.choices?.[0]?.finish_reason === "stop" ? "stop" : "other",
            array: Array.isArray(events),
            events: Array.isArray(events) ? events.map((event) => ({
              knownCriterion: input.goal.criteria.some((criterion) => criterion.id === event.criterionId),
              validType: ["completed_action", "intention", "obstacle", "uncertain"].includes(event.eventType),
              exactQuote: typeof event.quote === "string" && input.source.text.includes(event.quote),
              offsetsProvided: event.textStart !== undefined || event.textEnd !== undefined,
              offsetsMatch: input.source.text.slice(event.textStart, event.textEnd) === event.quote,
              extraFields: Object.keys(event).filter((key) => !["criterionId", "eventType", "summary", "quote", "textStart", "textEnd", "startMs", "endMs"].includes(key)).length,
            })) : undefined,
          })}`);
        } catch { console.log("LIVE provider diagnostic: unreadable response envelope"); }
      }
      return response;
    };
  }
  Object.assign(process.env, {
    PAA_MEMORY_ROOT: path.join(isolated, "user-memory"),
    PAA_SECRETS_HOME: path.join(isolated, "secrets"),
    PAA_AUTH_MODE: "local",
    BRAINDRIVE_PORT: String(gatewayPort),
    BRAINDRIVE_BIND_ADDRESS: "127.0.0.1",
    PAA_AUDIT_FILE_SINK_ENABLED: "false",
  });
  // Fresh config with no MCP sources. No upstream dev launcher or MCP host runs.
  await symlink(path.join(runtime, "memory"), path.join(isolated, "memory"));
  await symlink(path.join(runtime, "package.json"), path.join(isolated, "package.json"));
  await mkdir(path.join(isolated, "adapters"));
  await writeFile(path.join(isolated, "adapters/openai-compatible.json"), JSON.stringify({
    base_url: "http://127.0.0.1:1", model: "unused-assistant", api_key_env: "RELEASE_UNUSED_ASSISTANT_KEY",
  }));
  await writeFile(path.join(isolated, "config.json"), JSON.stringify({
    memory_root: process.env.PAA_MEMORY_ROOT, provider_adapter: "openai-compatible",
    auth_mode: "local", tool_sources: [], bind_address: "127.0.0.1", port: gatewayPort,
  }));
  // Import TypeScript using the repository's pinned tsx loader.
  const { tsImport } = await import(pathToFileURL(path.join(runtime, "node_modules/tsx/dist/esm/api/index.mjs")));
  const { buildServer } = await tsImport(pathToFileURL(path.join(runtime, "gateway/server.ts")).href, import.meta.url);
  ({ app } = await buildServer(isolated));
  await app.listen({ host: "127.0.0.1", port: gatewayPort });
  vite = spawn(process.execPath, [path.join(web, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], {
    cwd: web, env: { ...process.env, VITE_GATEWAY_PROXY_TARGET: `http://127.0.0.1:${gatewayPort}` }, stdio: "inherit",
  });
  vite.once("exit", (code) => { if (!stopping) void stop(code || 1); });
  console.log(`Release browser runtime mode=${mode}; gateway=${gatewayPort}; web=${webPort}; isolated memory; no MCP`);
} catch (error) {
  console.error(`Release runtime failed: ${error instanceof Error ? error.message : "unknown error"}`);
  await stop(1);
}
