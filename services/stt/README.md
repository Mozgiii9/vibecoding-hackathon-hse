# Private STT sidecar

The Node gateway stays the application backend. This optional service runs one
real `faster-whisper` CPU/int8 model, default `base` and Russian, and keeps request
audio only in memory. It never stores recordings or logs transcripts, headers or
model exception details. Model weights are cached on disk separately from audio.

## Install and run

Requires Python 3.11–3.13 and `uv`. All Python dependencies belong in this project's
`.venv`; no global Python packages or system FFmpeg/GPU driver installation is
needed. [faster-whisper uses PyAV's bundled FFmpeg libraries](https://github.com/SYSTRAN/faster-whisper#requirements).

From `services/stt`:

```sh
uv sync --frozen --no-dev
STT_CPU_THREADS=1 STT_MODEL_DIR=./models uv run --frozen --no-dev ryadom-stt
```

PowerShell:

```powershell
uv sync --frozen --no-dev
$env:STT_CPU_THREADS = '1'
$env:STT_MODEL_DIR = './models'
uv run --frozen --no-dev ryadom-stt
```

First start downloads model weights; run installation/download/transcription on
the shared test server only under its agreed heavy-operation lock. No socket is
opened until model loading succeeds. A failed startup exits with code 1 and a
redacted diagnostic; there is no synthetic production fallback. Use `/health`
after startup to confirm readiness. Real STT quality/latency on the demo machine
still requires a live audio acceptance pass.

| Environment | Default | Meaning |
|---|---|---|
| `STT_HOST` | `127.0.0.1` | Private bind; non-loopback requires a bearer token |
| `STT_PORT` | `19000` | Reserved agent B port; verify it is free first |
| `STT_MODEL` | `base` | faster-whisper model name or prepared local model path |
| `STT_LANGUAGE` | `ru` | Explicit transcription language |
| `STT_CPU_THREADS` | `2` | Native CPU threads; use `1` on the measured one-core server |
| `STT_MODEL_DIR` | library default | Model cache only; an isolated private path is recommended |
| `STT_AUTH_TOKEN` | unset | Optional private bearer token; never commit or print it |
| `STT_HEAVY_LOCK` | unset | POSIX shared advisory lock file, e.g. `/srv/ryadom-hackathon/coord/heavy.lock` |

This is a small private sidecar, without TLS or public hosting hardening. Keep it
on loopback or an isolated container network; do not expose the service publicly.
The token, when configured, protects transcription. Health is public and reports
only readiness/model/language. Requests are serialized; a concurrent transcription
gets `503 stt_busy`, while health remains available.
When `STT_HEAVY_LOCK` is set, each real decode/inference also takes a nonblocking
OS `flock` on that path and releases it only after the actual job finishes, even
when the caller times out. An existing external operation holding the same lock
causes `503 stt_busy` before model work. Prepare the parent directory and writable
file privately. Do not wrap the HTTP caller in that same lock: the service owns
the inference lock. Installation and first startup/model download still need an
external heavy-operation lock. The setting requires POSIX `fcntl`; leave it unset
on Windows. The lock file is never removed or truncated by this service.

## HTTP contract

`GET /health` → `200 {"ready":true,"model":"base","language":"ru"}`.

`POST /transcribe` accepts raw audio bytes, **not multipart**. It requires one
valid `Content-Length` of 1–10 MiB and one of `audio/wav`, `audio/mpeg`, `audio/mp4`,
`audio/webm` (parameters such as `codecs=opus` are accepted). Send
`Authorization: Bearer <private token>` when configured. Chunked uploads are rejected.
The read timeout is 30 seconds. Decoding iterates PyAV frames and stops at the
first frame exceeding **120 seconds**; accumulated mono/16 kHz/float32 PCM is
bounded to 1,920,000 samples (7.68 MB), before the model is invoked. Audio beyond
the duration limit returns `413 audio_too_long`, without partial transcription.
Use short 20–60 second recordings for the MVP and a 120-second gateway timeout.
The gateway timeout or a disconnected client does not cancel native inference;
the single job finishes, and concurrent transcription requests get `503 stt_busy`
until then. There is no hard inference deadline/process termination in this MVP.

```json
{"text":"Привет мир!","segments":[{"startMs":120,"endMs":900,"textStart":0,"textEnd":6},{"startMs":1000,"endMs":1400,"textStart":7,"textEnd":11}]}
```

Text is the trimmed nonempty model segments joined with one ASCII space.
`textStart`/`textEnd` are JavaScript **UTF-16 code-unit** offsets into that exact
string; the end is exclusive. Times are actual model seconds rounded to
milliseconds. Invalid model timings fail the request rather than invent times.
Silence can legitimately produce `{"text":"","segments":[]}`; the gateway decides
how to display a no-speech result and must not create a partial source.

Errors are JSON `{"error":"code"}`: `400` malformed/empty/incomplete upload,
`401 unauthorized`, `408 audio_read_timeout`, `411 content_length_required`,
`413 audio_too_large` / `audio_too_long`, `415 unsupported_media_type`, `422 invalid_audio`,
`502 transcription_failed`, `503 stt_busy`. Unknown routes return `404`.
Inference failure returns no partial transcript. Model decoding is in memory via
`BytesIO`, resampled frame by frame to bounded NumPy audio before STT; there are
no recording files to delete. PyAV is locked below v19 for compatibility with
faster-whisper 1.2.1; the sidecar does not pass the removed `metadata_errors` argument.

## Verification

```sh
uv sync --frozen
uv run ruff check .
uv run mypy
uv run python -m unittest discover -s tests -v
```

HTTP tests use only an explicitly test-owned transcriber; they do not prove real
transcription. Native decoder tests use generated in-memory PCM WAV, including
resampling and a 240-second file below the byte cap. Tests also check HTTP
limits/auth/errors, model exception redaction, serialized inference and health,
exact Unicode offsets and timestamp validation.
