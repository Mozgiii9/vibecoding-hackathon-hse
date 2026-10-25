import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { chromium } from "../../app/builds/typescript/client_web/node_modules/@playwright/test/index.mjs";
import { observeReleaseAudioResponses, readReleaseAudioResponse } from "./browser-audio-observer.mjs";

const body = { source: { id: "local-observer-probe", kind: "audio", text: "Синтетический ответ локального HTTP probe" }, evidence: [], duplicate: false };
const report = { scope: "LOCAL fetch-observer regression only; no STT, Gemini, real audio or product runtime", status: "FAIL" };
let uploads = 0;
let uploadBytes = 0;
let validWav = false;
const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url.startsWith("/api/context/audio")) {
    uploads++;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    uploadBytes = bytes.length;
    validWav = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE";
    response.writeHead(200, { "content-type": "application/json", "x-synthetic-result": "unchanged" });
    response.end(JSON.stringify(body));
  } else if (request.url === "/api/auth/probe") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ unobserved: true }));
  } else {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<!doctype html><title>Local observer regression</title>");
  }
});
let browser;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  await page.addInitScript(observeReleaseAudioResponses);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const actual = await page.evaluate(async () => {
    const probe = await (await fetch("/api/auth/probe")).json();
    const capturesBeforeAudio = globalThis.__ryadomReleaseAudioResults.length;
    // A valid 50-second, 16 kHz PCM16 mono silent WAV, created only in memory.
    const wav = new Uint8Array(44 + 50 * 16000 * 2);
    const view = new DataView(wav.buffer);
    const text = (offset, value) => { for (let index = 0; index < value.length; index++) wav[offset + index] = value.charCodeAt(index); };
    text(0, "RIFF"); view.setUint32(4, wav.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, "data"); view.setUint32(40, wav.length - 44, true);
    const response = await fetch("/api/context/audio?title=local-synthetic-probe", { method: "POST", headers: { "content-type": "audio/wav" }, body: wav });
    return { probe, capturesBeforeAudio, status: response.status, originalResponseHeader: response.headers.get("x-synthetic-result"), body: await response.json() };
  });
  const captured = await readReleaseAudioResponse(page);
  assert.deepEqual(actual.probe, { unobserved: true });
  assert.equal(actual.capturesBeforeAudio, 0);
  assert.equal(uploads, 1);
  assert(uploadBytes > 1024 * 1024);
  assert(validWav);
  assert.equal(actual.status, 200);
  assert.equal(actual.originalResponseHeader, "unchanged");
  assert.deepEqual(actual.body, body);
  assert.deepEqual(captured, { status: 200, body, settled: true, invalidJson: false });
  assert.deepEqual(Object.keys(captured).sort(), ["body", "invalidJson", "settled", "status"]);
  Object.assign(report, { status: "PASS", uploadRequests: uploads, uploadBytes, validWavHeader: validWav, originalCallerJSONUnchanged: true, originalCallerHeaderUnchanged: true, capturedJSONMatchesRealResponse: true, unrelatedAuthGETNotCaptured: true, noHeadersOrCredentialsCaptured: true });
} catch (error) {
  report.error = error instanceof Error ? error.message : "Unknown local regression error";
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(process.env.RELEASE_OBSERVER_REPORT ?? "/private/tmp/ryadom-audio-observer-regression.json", JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
}
