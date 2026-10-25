# Выпуск «Рядом» из исходников форка

Нужен Node 22+ с npm. Приложение, web и MCP собираются последовательно через
`npm ci` и lockfiles одного полного Git SHA. Ключи передаются только gateway
через private environment. Vite dev server, upstream application images и
автообновление не используются. Один gateway владеет состоянием.

## Private environment

Скопировать `.env.example` в `.runtime/agent-a.env`, выставить `chmod 600`, затем
заполнить SHA и ключи приватно. Не помещать значения в CLI, Git, отчёты или traces.
Для master key использовать один раз `openssl rand -base64 32`; сохранить ключ
при restart, rollback и восстановлении secrets. Пустые LLM/STT поля означают
неподключённый провайдер, а не mock. STT работает только при наличии adapter
в выбранном SHA; передача environment сама по себе его не реализует.

Instance ID начинается с `ryadom_a`, `ryadom_b` или `ryadom_c` согласно owner.
У каждого synthetic запуска новый instance/state directory. По умолчанию A:
UI `127.0.0.1:15073`, gateway `127.0.0.1:18787`, no-Docker MCP
`127.0.0.1:18911–18913`. Все пять портов проверяются до запуска.
Занятые процессы сохраняются; MCP порты можно задать явно. B/C UI и gateway
проверяются по зарезервированным диапазонам SHARED_SERVER.md.

## Без Docker: scoped Node и source release

На сервере без Node использовать распакованный официальный Node archive внутри
своего workspace `tools/`; добавить его `bin` в PATH. Не ставить пакеты глобально.
Зафиксировать версию, платформу и checksum архива отдельно; build manifest
сохраняет фактические Node/platform. Тяжёлую сборку на общем сервере выполнять
через согласованный `flock /srv/ryadom-hackathon/coord/heavy.lock`.

Из checkout после коммита packaging (заменить `FULL_SHA` действительным SHA):

```bash
node scripts/release/build-source.mjs export FULL_SHA /srv/ryadom-hackathon/agent-a/releases/FULL_SHA
node scripts/release/build-source.mjs build /srv/ryadom-hackathon/agent-a/releases/FULL_SHA
node scripts/release/launch-source.mjs /srv/ryadom-hackathon/agent-a/private.env /srv/ryadom-hackathon/agent-a/releases/FULL_SHA /srv/ryadom-hackathon/agent-a/instances/demo1
```

Если Git checkout только локально: выполнить `export` локально и перенести
полученную папку в свой workspace сервера; затем выполнить `build` уже там.
Archive берёт только tracked файлы указанного коммита.
В экспорт включены `docs/contracts` — frontend импортирует оттуда demo fixture;
repository-relative layout сохраняется и в Docker build context.
Source export дополнительно включает `services/stt`, `docs/demo/sources` и
`docs/evaluation`, только если соответствующий каталог есть в выбранном SHA.
Их наличие в текущем working tree не влияет на состав старого кандидата.
`source-manifest.json` сохраняет фактический `export_paths`. Отсутствие STT не
блокирует export или Node build; Python/model install автоматически не запускается.
Не переносить местные node_modules между macOS и Linux. Запустить builder из перенесённого release
можно командой `node RELEASE/scripts/release/build-source.mjs build RELEASE`.

Launcher работает в foreground; при необходимости перенаправить stdout/stderr
в private файл своей среды. PID supervisor и порты записаны в
`INSTANCE/runtime.json`. SIGTERM именно этому PID останавливает его три MCP,
gateway и edge; чужие процессы не трогаются. Выход любого обязательного child
завершает всю среду. `runtime.lock` защищает от двух владельцев одной памяти.
После аварийного SIGKILL проверить записанный PID/его children и свободность
портов, затем удалить только собственный stale `runtime.lock`.

Данные: `INSTANCE/memory` и `INSTANCE/secrets`, независимо от `RELEASE`.
`memory/hackathon/state.json` входит в файловый backup. Для согласованной копии
остановить свой supervisor, использовать `scripts/release/backup.mjs` по его
инструкции, затем снова запустить. Secrets копируются отдельно приватно вместе
с master key. Release `backup.mjs` не включает secrets; встроенный migration
export upstream может включать vault и master key, его результат приватный.

Restart: SIGTERM своему supervisor, повторить ту же launch-команду и smoke.
Rollback: остановить свой supervisor; выбрать предыдущую уже собранную папку;
поменять SHA в private env, запустить предыдущий release с тем же INSTANCE.
Новый synthetic clean start: новая пустая INSTANCE и новый instance ID, без
удаления предыдущих каталогов. До rollback сохранить backup состояния;
совместимость state schema проверяется отдельно, launcher её не обещает.

## Optional STT из source delivery

Сначала проверить no-Docker приложение с уже выделенным сервисом B на
`http://127.0.0.1:19000`: выставить в private environment gateway
`HACKATHON_STT_BASE_URL`, `HACKATHON_STT_MODEL=base` и `HACKATHON_STT_API_KEY`.
Ключ должен совпадать с приватным `STT_AUTH_TOKEN` сервиса. Не запускать второй
STT на занятом порту и не перезапускать среду B. Для короткого аудио B рекомендует
120-секундный gateway timeout: в текущем adapter общий
`HACKATHON_LLM_TIMEOUT_MS=120000` также применяется к STT.

Если нужен отдельный source STT, использовать только `RELEASE/services/stt`
интегрированного кандидата: `services/stt/README.md` и `uv.lock` принадлежат B.
Нужны Python 3.11–3.13 и scoped `uv`; зависимости устанавливаются в проектную
`.venv` командой `uv sync --frozen --no-dev`, сервис запускается через
`uv run --frozen --no-dev ryadom-stt`. Node gateway остаётся backend приложения.
Не добавлять системный FFmpeg или Python packages глобально: PyAV использует
свои bundled libraries; lock фиксирует совместимый PyAV 18 и faster-whisper 1.2.1.

В собственном private STT environment заранее задать `STT_HOST=127.0.0.1`,
согласованный свободный `STT_PORT`, `STT_MODEL=base`, `STT_LANGUAGE=ru`,
`STT_CPU_THREADS=1`, `STT_AUTH_TOKEN`, отдельный `STT_MODEL_DIR` вне release и
`STT_HEAVY_LOCK=/srv/ryadom-hackathon/coord/heavy.lock`. Ключ не передавать через
CLI; environment загрузить приватно без вывода. Model cache не содержит audio,
но его checksum/версию сохранить отдельно: uv.lock фиксирует Python dependencies,
а не загружаемые model weights.

Ниже Bash-команды для **своего** source STT после подготовки environment.
`RELEASE` — абсолютный путь кандидата. До запуска проверить порт; loopback
listener сохраняется, если порт занят. Общий lock охватывает install и первый
startup/model download, затем освобождается после health: inference берёт этот
же lock внутри сервиса. Не держать внешний lock весь срок жизни сервиса и не
оборачивать HTTP/UI caller в тот же lock — иначе запросы получат `stt_busy`.

```bash
(
  set -euo pipefail
  : "${RELEASE:?}" "${STT_PORT:?}" "${STT_HEAVY_LOCK:?}" "${STT_AUTH_TOKEN:?}"
  cd "$RELEASE/services/stt"
  node -e 'const n=require("node:net");const s=n.createServer();s.on("error",()=>process.exit(1));s.listen(Number(process.env.STT_PORT),"127.0.0.1",()=>s.close());'
  exec 9>>"$STT_HEAVY_LOCK"
  flock -n 9
  uv sync --frozen --no-dev 9>&-
  uv run --frozen --no-dev ryadom-stt 9>&- &
  stt_job=$!
  trap 'kill "$stt_job" 2>/dev/null || true' EXIT
  ready=false
  for ((attempt=0; attempt<300; attempt++)); do
    if node -e 'fetch(`http://127.0.0.1:${process.env.STT_PORT}/health`,{signal:AbortSignal.timeout(2000)}).then(async r=>process.exit(r.ok&&(await r.json()).ready===true?0:1)).catch(()=>process.exit(1))'; then
      ready=true
      break
    fi
    kill -0 "$stt_job"
    sleep 1
  done
  [[ "$ready" == true ]]
  flock -u 9
  exec 9>&-
  wait "$stt_job"
)
```

Health подтверждает загруженную модель, но не полный audio MVP. На выбранном
интегрированном SHA нужен обычный authenticated UI → synthetic WAV → настоящий
STT → Gemini → точная source quote → confirm → server progress. Корпус находится
в `docs/demo/sources`. B runner и инструкции — `docs/evaluation/browser-audio.mjs`
и `browser-audio-README.md`. Текущий runner требует Git (`rev-parse`/`status`),
поэтому запускать его из exact-SHA audit checkout с установленными frontend
dependencies/Chromium и направлять на свою synthetic среду. Exported release
не содержит `.git`; наличие runner в архиве само по себе не делает его там
запускаемым. Runtime/runner не запускаются экспортом автоматически.

Docker STT topology и её live проверка остаются **NOT_RUN**. В текущем Docker
app loopback не достигает host STT B, а gateway config разрешает HTTP только
на loopback. Эта source инструкция не обещает Docker audio connectivity.

## Docker

Нужен Docker Engine с Compose v2 (`up --wait`). Сборка берёт `git archive SHA`,
а не изменённый working tree. Официальные Node/Caddy base images разрешаются
в digest; manifest сохраняет digests, platform и итоговые image IDs.
Повторная сборка может получить другие apt пакеты: это воспроизводимый source
build, не обещание побитово одинаковых образов. Для точного переноса сохранить
проверенные images через `docker save`, manifest и их checksums.

```bash
node scripts/release/build-hackathon.mjs agent-a FULL_SHA
node scripts/release/launch-hackathon.mjs check .runtime/agent-a.env
node scripts/release/launch-hackathon.mjs up .runtime/agent-a.env
node scripts/release/smoke-hackathon.mjs .runtime/agent-a.env
node scripts/release/launch-hackathon.mjs restart .runtime/agent-a.env
node scripts/release/smoke-hackathon.mjs .runtime/agent-a.env
node scripts/release/launch-hackathon.mjs down .runtime/agent-a.env
```

Для повторного выбора bases использовать `HACKATHON_NODE_IMAGE` и
`HACKATHON_EDGE_IMAGE` со значениями `repository@sha256:...` из manifest.
Image tags `ryadom-agent-a/{app,edge}:FULL_SHA` не перезаписываются builder.
Compose никогда не делает build/pull при запуске. MCP слушают только loopback
в app-контейнере, host публикует только UI/gateway на loopback. Отдельные
volumes `INSTANCE_memory`, `INSTANCE_secrets` и network `INSTANCE_runtime`
исключают upstream общие имена. `down` сохраняет volumes; `-v` не используется.

Rollback на уже собранные локальные images:

```bash
node scripts/release/launch-hackathon.mjs rollback .runtime/agent-a.env PREVIOUS_FULL_SHA
node scripts/release/smoke-hackathon.mjs .runtime/agent-a.env PREVIOUS_FULL_SHA
```

После rollback записать предыдущий SHA в private env до следующего `up`.
Для чистого synthetic старта сначала остановить свою среду и выбрать новый
instance ID; старые volumes не удалять. Docker backup требует отдельного
read-only mount именно своего volume; upstream backup scripts с общими именами
`braindrive_*` не применять.

## Проверки и границы

`node --test scripts/release/smoke-packaging.test.mjs` проверяет private env,
owner isolation и production HTTP edge: static files, release SHA, proxy path,
Authorization/status/cookies и traversal protection.
`node --test scripts/release/smoke-source-export.test.mjs` экспортирует текущий
committed SHA в отдельную папку и запускает настоящий frontend typecheck на
экспортированных файлах и отдельно на результате COPY шагов Docker edge.
Для этого focused regression используются уже установленные compiler libraries;
он не подменяет clean `npm ci` и реальный Docker build.
`node --test scripts/release/smoke-source-optionals.test.mjs` проверяет настоящие
Git archives двух synthetic commits: до и после STT/corpus/evaluation delivery.
`smoke-hackathon.mjs` одинаков для source/Docker: UI, release SHA, direct/proxied
health/auth bootstrap, отказ анонимному goals API; данные не пишет.
Это не заменяет authenticated пользовательскую приёмку, live LLM/STT,
restart/data backup/restore и браузерный сценарий. Docker Engine в локальной
среде отсутствует; Docker build/Compose запуск требуют отдельной проверки.
