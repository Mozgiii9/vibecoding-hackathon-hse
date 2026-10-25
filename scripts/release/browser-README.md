# Release browser acceptance

Run from the repository root after installing the locked runtime and web dependencies. The default browser is installed Google Chrome; `RELEASE_BROWSER_CHANNEL` can select another installed Playwright channel. No shared Playwright configuration is changed.

```sh
node app/builds/typescript/client_web/node_modules/@playwright/test/cli.js test --config scripts/release/playwright.release.config.mjs
```

Default `RELEASE_MODE=fake`: real gateway, local signup/password/JWT, extraction validation, file store, review and progress; only the provider HTTP service is a deterministic protocol fake. It starts isolated gateway `8891`, Vite `5091`, and a random loopback provider port, refuses occupied/reserved ports, uses temporary memory/secrets and removes them when stopped. It never starts the upstream launcher or an MCP host. This is **not** evidence of live Gemini or STT.

```sh
RELEASE_MODE=live RELEASE_ALLOW_LIVE_MUTATIONS=1 node --env-file=.runtime/qa-release/provider.env app/builds/typescript/client_web/node_modules/@playwright/test/cli.js test --config scripts/release/playwright.release.config.mjs
```

Live mode passes the private server-side `HACKATHON_LLM_*` configuration to the real gateway without fake responses. Use Gemini configuration supplied privately by the owner. `RELEASE_PROVIDER_DIAGNOSTICS=1` logs only response status and validation booleans (JSON-array shape, known criteria, exact quote/offset match), never provider URL, key or raw model content. A live failure stays FAIL; no retry or fake fallback is automatic.

`RELEASE_BASE_URL=http://127.0.0.1:15073` selects an already started candidate (including a tunnel to the isolated source release) and disables all automatic server startup. This candidate must have fresh synthetic memory: the first test creates the fixed `demo` goal and will refuse an existing goal. Use `RELEASE_USERNAME`/`RELEASE_PASSWORD` only for synthetic acceptance credentials. External runtime provider identity is an operator assertion and must be recorded with the tested candidate SHA.

For live audio, also set `RELEASE_AUDIO_FILE` to a synthetic 20–60 second WAV/MP3/M4A/WebM recording containing a completed action for the three test criteria. The test checks decoded duration, real STT success, transcript, exact source quote, confirmation and reload. Without a file/live STT, audio is **NOT_RUN**. The fake unconfigured-STT upload tests only the failure state and cannot count as successful audio acceptance.

The main scenario checks desktop 1440px and mobile 390px, signup/logout/invalid login/login, all three criteria, intention not counted, action quote, confirmation, duplicate, reject and reload. Synthetic failure scenarios cover provider timeout, 503, malformed JSON, a real revision conflict and unconfigured STT with no false progress. Restart and backup/restore belong to separate release checks.

After a successful main scenario, the browser saves a synthetic checkpoint (goal, evidence IDs/revisions/status and server progress) to `/private/tmp/ryadom-release-browser-state-live.json` in live mode; `RELEASE_STATE_FILE` overrides it. After the operator restarts the same external runtime without resetting its memory, run:

```sh
RELEASE_BASE_URL=http://127.0.0.1:15073 RELEASE_MODE=live RELEASE_RESUME=1 node app/builds/typescript/client_web/node_modules/@playwright/test/cli.js test --config scripts/release/playwright.release.config.mjs
```

Resume performs ordinary password login, compares server state to the checkpoint exactly and reopens every evidence source on desktop/mobile. It creates no goal, imports no source and performs no evidence reviews. Its separate report is `/private/tmp/ryadom-release-browser-live-resume.json`. Missing pre-restart checkpoint is a failure, not evidence of persistence. Pass `RELEASE_CANDIDATE_SHA` to include the operator-verified SHA in report metadata.

Results are printed with FAKE/LIVE labels and saved separately to `/private/tmp/ryadom-release-browser-fake.json` or `/private/tmp/ryadom-release-browser-live.json`; `RELEASE_RESULT_FILE` overrides the report destination. Traces, HAR, screenshots and video are disabled to keep credentials out of browser artifacts. Skipped tests mean NOT_RUN, never PASS. Record the candidate SHA alongside the report. Gateway/web ports can be changed with `RELEASE_GATEWAY_PORT`/`RELEASE_WEB_PORT` while respecting reservations.
