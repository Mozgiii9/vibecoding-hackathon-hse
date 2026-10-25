import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// An explicit public-file list keeps documentation, tooling and Git out of HTTP.
const root = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/config.js", ["config.js", "text/javascript; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/assets/favicon.svg", ["assets/favicon.svg", "image/svg+xml"]],
  ["/assets/og-image.png", ["assets/og-image.png", "image/png"]],
]);
const port = Number(process.env.PORT || 4178);
const host = process.env.HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  response.setHeader(
    "Permissions-Policy",
    "microphone=(), camera=(), geolocation=()",
  );
  response.setHeader("Cache-Control", "no-cache");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let path;
  try {
    path = new URL(request.url, "http://static.invalid").pathname;
  } catch {
    response.writeHead(400).end();
    return;
  }
  const entry = files.get(path);
  if (!entry) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const content = await readFile(join(root, entry[0]));
    response.writeHead(200, {
      "Content-Type": entry[1],
      "Content-Length": content.length,
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(503).end("Static asset unavailable");
  }
});
server.listen(port, host, () => console.log(`Рядом: http://${host}:${port}`));
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
