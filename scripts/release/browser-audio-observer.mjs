/** Passive browser observer for the real UI audio response; no request mutation. */
export function observeReleaseAudioResponses() {
  globalThis.__ryadomReleaseAudioResults = [];
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, globalThis.location.href);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "POST" && url.pathname === "/api/context/audio") {
      // Keep only the synthetic domain JSON and status. Never capture headers,
      // credentials, request bytes, URLs or unrelated auth/provider responses.
      const result = { status: response.status, body: null, settled: false, invalidJson: false };
      globalThis.__ryadomReleaseAudioResults.push(result);
      try {
        void response.clone().json().then((body) => {
          result.body = body;
          result.settled = true;
        }).catch(() => {
          result.invalidJson = true;
          result.settled = true;
        });
      } catch {
        result.invalidJson = true;
        result.settled = true;
      }
    }
    return response;
  };
}

/** Read the browser's clone instead of Chromium's separate inspector body cache. */
export async function readReleaseAudioResponse(page) {
  await page.waitForFunction(() => globalThis.__ryadomReleaseAudioResults?.at(-1)?.settled === true, null, { timeout: 30_000 });
  return page.evaluate(() => globalThis.__ryadomReleaseAudioResults.at(-1));
}
