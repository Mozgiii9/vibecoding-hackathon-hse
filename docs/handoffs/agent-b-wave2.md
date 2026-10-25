# Agent B, wave 2 — текст и реальное аудио

**Готово к передаче, 25 октября 2026, 14:40 МСК.** Audio gate пройден на общем интегрированном кандидате C `ef360ae0627e35ddfe615143b5409690ac222ed8`. Это приёмка импорта контекста; весь выпуск команды (production packaging, restart/backup, mobile, защита) этим отчётом не объявляется принятым.

## SHA и границы

| Назначение | SHA |
|---|---|
| Фактическая база B из origin/codex/integration-ui | `92cb8bc6ecacf1bf8f1bb1f3fbe62d195db3aa5a` |
| Adapter, prompt fix, live quality и corpus | `a14d4fb72bd6c0bfdeacf2c4abf64b212cb04562` |
| Bounded STT service, validator alignment, реальные transcript/metrics | `7d5c109c438fbc70657caff8dc29bf8ad01dda0f` |
| Browser runner: настоящий response и видимый retry | `6b083203684b8c5d1b93a0c8ce5645233b3061e4`, `a6291e7024089342cd2d4b41d86539a0eb75de06` |
| Audio UI на чистой ветке B | `a6291e7024089342cd2d4b41d86539a0eb75de06` — PASS |
| Общий кандидат после merge C и независимый audio UI gate | `ef360ae0627e35ddfe615143b5409690ac222ed8` — PASS |

Ветка B — `codex/audio-quality`, без force/reset/merge в main. Текстовый pipeline первой волны сохранён. Менялись только context, services/stt, собственные evaluation/demo/status/handoff. Общие gateway/UI/contracts/manifests/locks не менялись. Сервисный `uv.lock` принадлежит B. Последний документационный SHA можно получить через `git log -1 -- docs/handoffs/agent-b-wave2.md`; собственный SHA невозможно включить в содержимое этого коммита.

## Что передано C/A

Существующий `createContextProviders(config)` автоматически подключает рабочий `ContextProviders.transcribe`, если передано:

```ts
stt: { baseUrl: "http://127.0.0.1:19000", model: "base", apiKey: serverOnlyToken }
```

Дополнительный export из `features/context/providers.ts`:

```ts
createLocalSttTranscriber(config?: {
  baseUrl: string; model: string; apiKey: string;
}, timeoutMs?: number): NonNullable<ContextProviders["transcribe"]>
```

Точный протокол: raw `POST <baseUrl>/transcribe`, MIME `audio/wav`, `audio/mpeg`, `audio/mp4`, `audio/webm`, header Bearer при настроенном token. Не multipart/base64. Ответ:

```ts
{ text: string; segments: Array<{
  startMs: number; endMs: number; textStart: number; textEnd: number;
}> }
```

Offsets — UTF-16 в точной возвращённой строке. Времена — только реальные boundaries STT. При неизвестном безопасном диапазоне evidence times остаются null. Hash аудио — SHA256 `audio + NUL + originalBytes`. Raw audio сервисом не сохраняется; Source и evidence пишет только core атомарно через commitImport. Ручное подтверждение и проверка цитат не ослаблены. Согласованы обнаруженные C различия: blank source title отклоняется до модели, zero-duration segments не доходят до core.

У gateway уже есть все нужные env; новая Node dependency или shared interface не требуются:

- `HACKATHON_STT_BASE_URL=http://127.0.0.1:19000`
- `HACKATHON_STT_MODEL=base`
- `HACKATHON_STT_API_KEY` — приватный token. C helper требует непустое значение.
- LLM остаётся подтверждённым OpenAI-compatible `https://llm.mxr-edge.xyz/v1`, `gemini-3.8-flash`, серверный `HACKATHON_LLM_API_KEY`; OpenRouter автоматически не используется.

Если общий timeout не задан, LLM30с/STT120с. Заданный `HACKATHON_LLM_TIMEOUT_MS` пока применяется к обоим адаптерам; для demo рекомендовано оставить unset. Неполная STT config/неподдержанная model/сетевой отказ →503stt_unconfigured; timeout→504provider_timeout; испорченный ответ/HTTPошибка→502provider_failed. Busy сервиса сейчас также нормализуется в502, а не маскируется успешным пустым результатом.

## STT на предоставленном сервере

- Своя среда `/srv/ryadom-hackathon/agent-b`, service только `127.0.0.1:19000`.
- Python3.12.3; uv0.13.5 только в `agent-b/tools`; project `.venv`, faster-whisper1.2.1, PyAV18.1.0, NumPy2.4.6. Глобальные установки/драйверы/Docker не выполнялись.
- Base/ru/CPU/int8,1thread;1CPU,1967МиБRAM, около25ГиБ свободного диска при исходной проверке.
- Реальная WAV запись50.626875с/1 620 106байт →15 641мс; повтор с загруженной моделью11 973мс.9реальных segments. После первого прогона RSS297484КиБ, availableRAM1341МиБ.
- Байт-в-байт6Python sources на сервере совпадают с7d5c109: `docs/evaluation/stt-runtime-facts.json`. Общий кандидат ef360ae содержит те же context/service sources.
- Token хранится только в `/srv/ryadom-hackathon/agent-b/private/stt.env` с ограниченным доступом. **Разрешена передача C/A только STT_AUTH_TOKEN из этого файла в их server environment**. Не печатать значение и не переносить в Git; это не разрешение читать другие private/env файлы.
- `STT_HEAVY_LOCK=/srv/ryadom-hackathon/coord/heavy.lock` автоматически удерживается во время decode/inference. При занятости чужой сборкой —503stt_busy. Нельзя оборачивать HTTP caller тем же flock: это заблокирует сам STT.
- После проверок B сохранил полезный remote service для C/A; временные собственные local gateway/Vite/SSH tunnel остановлены. A/C процессы и их память не менялись.

## Запуск и health

Полный переносимый runbook: `services/stt/README.md`. В source release сохранять pyproject, uv.lock и src; .venv/models/private env не коммитить и не переносить Windows `.venv` в Linux. A может добавить этот отдельный процесс рядом с source launcher; основной backend остаётся TypeScript.

На предоставленном сервере, только своя среда B:

```sh
cd /srv/ryadom-hackathon/agent-b/services/stt
UV_CACHE_DIR=/srv/ryadom-hackathon/agent-b/.cache/uv \
  flock -n /srv/ryadom-hackathon/coord/heavy.lock \
  /srv/ryadom-hackathon/agent-b/tools/uv sync --frozen --no-dev
```

Перед первым запуском подготовить модель под внешним heavy.lock, используя этот же `.venv`:

```sh
HF_HOME=/srv/ryadom-hackathon/agent-b/.cache/huggingface HF_HUB_DISABLE_XET=1 \
flock -n /srv/ryadom-hackathon/coord/heavy.lock .venv/bin/python - <<'PY'
from faster_whisper import WhisperModel
WhisperModel("base", device="cpu", compute_type="int8", cpu_threads=1,
             num_workers=1, download_root="/srv/ryadom-hackathon/agent-b/models")
PY
```

Не запускать второй экземпляр поверх работающего19000. Для нового экземпляра после проверки свободного порта/собственного PID:

```sh
set -a
. /srv/ryadom-hackathon/agent-b/private/stt.env
set +a
export STT_HOST=127.0.0.1 STT_PORT=19000 STT_MODEL=base STT_LANGUAGE=ru
export STT_CPU_THREADS=1 STT_MODEL_DIR=/srv/ryadom-hackathon/agent-b/models
export XDG_CACHE_HOME=/srv/ryadom-hackathon/agent-b/.cache
export HF_HOME=/srv/ryadom-hackathon/agent-b/.cache/huggingface
export STT_HEAVY_LOCK=/srv/ryadom-hackathon/coord/heavy.lock
.venv/bin/ryadom-stt
```

Готовая модель загружается до listen. Foreground service не держать под внешним flock всю жизнь: per-request lock уже внутри. Установка/первичная загрузка отдельно требуют внешнего lock. Чужой PID не останавливать.

```sh
curl --fail --silent http://127.0.0.1:19000/health
# {"ready":true,"model":"base","language":"ru"}
```

Пример реального запроса из source checkout (token уже в environment, не в argv):

```sh
services/stt/.venv/bin/python - <<'PY'
import json, os, urllib.request
from pathlib import Path
request = urllib.request.Request(
    "http://127.0.0.1:19000/transcribe",
    data=Path("docs/demo/sources/demo-audio.wav").read_bytes(), method="POST",
    headers={"Content-Type": "audio/wav",
             "Authorization": "Bearer " + os.environ["STT_AUTH_TOKEN"]})
with urllib.request.urlopen(request, timeout=120) as response:
    result = json.load(response)
print({"textLength": len(result["text"]), "segments": len(result["segments"])})
PY
```

## Корпус и проверки

`docs/demo/sources/`:5synthetic text sources, повтор того же файла по инструкции, шестой источник `demo-audio.wav`, настоящие transcript/metrics. `EXPECTED.md` описывает события и прогресс; `docs/evaluation/RESULTS.md` содержит ground truth озвучки и ошибки STT. Короткое объяснение AI pipeline для защиты — в `docs/evaluation/README.md`.

- Gemini:9живых случаев +8parser/validation =17/17PASS. Первоначальный16/17FAIL сохранён; исправлен воспроизведённый future/intention дефект prompt. Это не общая метрика качества модели.
- `npm --prefix app/builds/typescript test -- features/context features/goals gateway/hackathon`: **283PASS,11files**; backend buildPASS.
- STT: **17unittestPASS**, ruffPASS, strictmypyPASS(8files), lock/build проверены. Native decoder проверяет stereo48кГц→mono16кГц, ровно120с и отклонение240сWAV под bytecap.
- Pre-commit hook/core.hooksPath не настроен; `git diff --cached --check` выполнен, hooks не обходились. Только свои paths коммитились.

## Общий audio UI gate — PASS

`docs/evaluation/common-candidate-README.md` и `common-candidate-artifacts/results.json`: **ef360ae**, чистый tracked source,14:38:07–14:38:59МСК,7PASS/0FAIL/без retries. Отдельный detached checkout, обычный local signup/logout/login, настоящие Gemini и STT. Фактическая машина браузера/gateway — Windows B, STT — предоставленный Linux server через private SSH loopback. Это не утверждение о production/static серверном выпуске C.

Проверено: UIсоздание3критериев→WAVчерезfileinput→настоящаярасшифровка→3proposed evidence с точными цитатами→нулевой прогресс до review→источник/mark→ручной confirm→серверный cv1/mock0/feedback0→повтор тех жеbytes с другим title/прежниеIDs/счётчикнерастёт→reload сохраняет данные. Три просмотренных PNG приложены. Запросы/ответы и auth не подменялись; fetch clone только наблюдает реальный audio response для обхода CDPbody ошибки локального Chromium.

Передача C/A сделана опубликованной веткой, own coord/agent-b.md, точными exports/env и приватным путём token. C уже выполнил merge вef360ae; независимый проверяющий B подтвердил именно этот общий кандидат с кодом A/C/B. Финальная упаковка/выбор машины показа и общая release-приёмка остаются у C/A.

## Ограничения

Лимит raw10МиБ и decoded120с; mono PCM buffer7.68МБ. WAV проверен живым end-to-end; MP3/AAC/Opus decoder реально присутствуют, отдельный live проход каждого формата не заявляется. Base допускает ошибки слов (реальный transcript сохранён без исправлений); пользователь проверяет события. Таймкоды сегментные, без плеера исходного файла.

Клиентский abort не убивает уже начатое native inference: job завершится, другие запросы получают busy, hard process deadline нет. После отмены ingestion не коммитит. Отсутствие второго provider call не измеряется браузером, но ID/progress gate и ранняя дедупликация проверены. Смысловые дубли пересказов не обещаются. Reload не доказывает process restart/backup/restore/mobile или весь выпуск — это отдельная приёмка A/C. Никаких fake audio/text результатов в обычном запуске нет.
