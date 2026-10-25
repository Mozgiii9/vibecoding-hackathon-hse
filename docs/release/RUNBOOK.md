# Запуск и восстановление «Рядом»

Ветка A: `codex/qa-release`. Команды выполняются из корня выбранного release/checkout. Требуются Node 22.12+ с npm, Git для export, tar для переноса. Никакая команда не удаляет общую пользовательскую память. Реальные результаты и SHA записаны в [ACCEPTANCE.md](ACCEPTANCE.md), ограничения — в [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Изоляция A и секреты

Серверный каталог: `/srv/ryadom-hackathon/agent-a`. UI только `127.0.0.1:15073`, gateway `127.0.0.1:18787`; MCP без Docker — loopback `18911–18913`. Перед запуском проверить занятость; чужой процесс не останавливать. В Docker MCP не публикуются на host.

Private env создать из `app/installer/hackathon/.env.example` вне Git, mode 600. Заполнить полный `HACKATHON_SOURCE_SHA`, owner `agent-a`, instance ID `ryadom_a` либо новый `ryadom_a_demo2`. Для master key один раз приватно сгенерировать 32 байта base64 и сохранять при restart/rollback. LLM protocol/base URL/model/key и STT передаются только gateway. Не печатать env, `docker compose config`, process environment или browser traces. Не использовать ключи в CLI.

Текущий сервер не имеет глобального Node/Docker. Node v22.21.1 распакован внутри `agent-a/tools/` из официального архива после проверки SHA256. Добавить его `bin` в PATH текущего shell. Не ставить глобальные пакеты, не менять firewall/Docker и не останавливать B/C.

Проверяемый общий кандидат: `ef360ae0627e35ddfe615143b5409690ac222ed8`. Готовая папка A — `releases/ef360ae`. После приёмки работает новая synthetic копия `instances/restored-ef`, private env `release-restored-ef.env`; исходный `instances/full-ef` и его `release-ef.env` сохранены, instance остановлен. Перед любой командой управления прочитать актуальный runtime.json именно выбранного instance: исторический PID из отчёта использовать нельзя. Старые `demo-f935`, `restored-f935` и `common-4ac` сохранены и остановлены. Зафиксированный rollback baseline — `f93536db9091f10236221aba5901fbbdd0486f59`, папка `releases/f93536d`.

## Сборка фиксированного нашего SHA без Docker

`FULL_SHA`, `RELEASE`, `PRIVATE_ENV` и `INSTANCE` ниже — обозначения реальных путей/полного SHA, не буквальные значения для запуска.

1. Получить опубликованную ветку A или интегрированный кандидат C. Записать полный SHA, проверить чистоту checkout. Packaging должно присутствовать в выбранном коммите. Для export нужен driver A `7f79d255b175432685e9f1cf099489ceda0cb091` или новее: ранняя версия f0 пропускала docs/contracts, а новый driver включает переданные optional STT/corpus/evaluation. Export не изменяет файлы выбранного кандидата. C f875 уже содержит driver7f79d25. Последующие A acceptance/specs/docs передать обычным merge qa-release.
2. Export берёт только tracked исходники указанного SHA, не рабочие изменения:

```bash
node scripts/release/build-source.mjs export FULL_SHA RELEASE
```

3. При локальном export перенести всю папку RELEASE в собственный серверный каталог. Не переносить macOS node_modules в Linux. Все тяжёлые серверные операции выполнять под общим lock, без ожидания в цикле:

```bash
flock -n -E 75 /srv/ryadom-hackathon/coord/heavy.lock node RELEASE/scripts/release/build-source.mjs build RELEASE
```

Exit 75 означает занятый ресурс: выбрать лёгкую независимую задачу. Builder последовательно выполняет npm ci и build backend/MCP/frontend, frontend typecheck, затем пишет `build-manifest.json` с source SHA, archive SHA256, Node/platform и временем. Повторная сборка в готовый кандидат запрещена; нужен новый каталог.

4. Запуск production JS и статического frontend, без Vite:

```bash
node RELEASE/scripts/release/launch-source.mjs PRIVATE_ENV RELEASE INSTANCE
```

Supervisor запускает три MCP и один gateway, затем static edge с `/api` proxy. `INSTANCE/memory` и `INSTANCE/secrets` находятся отдельно от release. `INSTANCE/runtime.json` содержит только PID, SHA, instance и порты; ключей в нём нет. `runtime.lock` запрещает второй процесс в той же памяти.

5. В другом shell:

```bash
node RELEASE/scripts/release/smoke-hackathon.mjs PRIVATE_ENV FULL_SHA
```

Smoke проверяет direct/proxied health, auth bootstrap, отказ анонимному goals API, React HTML и `/release.json` с нужным SHA; пользовательские данные не меняет. Он не заменяет login/live LLM/STT приёмку.

Smoke запускать после READY/доступного health. Ошибка соединения сразу после старта не доказывает crash: сначала проверить собственный PID, lock и логи готовности. Не запускать второй supervisor из-за таймаута наблюдения SSH.

## Переданный STT

В ef360ae включены `services/stt` с `uv.lock`, synthetic WAV и evaluation corpus. Это отдельный вспомогательный процесс faster-whisper base/ru CPU/int8; Node gateway остаётся backend приложения. Текущая A приёмка использует переданный B localhost19000 с теми же public source/lock fingerprints, не перезапускает его. Token подключён только через отдельный private env; копировать другие private поля B нельзя.

Для независимого запуска в своей среде следовать `services/stt/README.md`: Python3.11–3.13, scoped uv, `uv sync --frozen --no-dev` создаёт project `.venv`, затем `uv run --frozen --no-dev ryadom-stt`. Не добавлять глобальные Python packages/FFmpeg. Собственные STT port/model cache/env согласовать отдельно: порт19000 занят B. Установка и первый download/start под общим heavy.lock; при inference lock берёт сам сервис через `STT_HEAVY_LOCK`, поэтому HTTP caller нельзя оборачивать в тот же flock. При busy/ошибке нет synthetic fallback.

Gateway env: `HACKATHON_STT_BASE_URL` без `/transcribe`, `HACKATHON_STT_MODEL=base`, `HACKATHON_STT_API_KEY` из private файла; `HACKATHON_LLM_TIMEOUT_MS=120000` для каждой bounded provider stage. Перед показом health STT должен вернуть ready/base/ru. Реальная расшифровка50с WAV на слабом CPU занимает время; UI не должен сообщать успех до результата.

## Restart и возврат предыдущего кандидата

1. Прочитать `INSTANCE/runtime.json`; проверить, что PID относится своему supervisor. Отправить SIGTERM только этому PID. Дождаться его завершения и освобождения своих пяти портов. Не использовать pkill, killall или reboot.
2. Restart: повторить launch с теми же RELEASE, PRIVATE_ENV и INSTANCE, затем smoke и проверить сохранённую цель через UI.
3. Rollback: сначала backup остановленной собственной памяти; выбрать предыдущую уже собранную папку RELEASE, записать её полный SHA в private env, запустить её с тем же INSTANCE и неизменным master key. Снова smoke и UI. Старые release и память не удалять.
4. Совместимость схемы состояния проверяется отдельно. При несовместимости запускать отдельную synthetic копию из backup, сохранив исходную память.

После SIGKILL stale lock удалять только после проверки, что записанный supervisor и его children завершены, а порты свободны. Наличие lock само по себе не доказывает работающий процесс.

## Backup и проверенное восстановление

Остановить только собственный supervisor. Родительские директории OUTPUT/RESTORED должны существовать; конечные директории backup/restore должны быть новыми.

```bash
node scripts/release/backup.mjs --memory-root INSTANCE/memory --output OUTPUT/new-backup
node scripts/release/restore.mjs --backup OUTPUT/new-backup --synthetic-copy OUTPUT/new-restored-memory
```

Backup обязательно содержит `hackathon/state.json`, manifest со списком файлов, размерами и SHA256. Включены цели, sources/evidence/review/progress и остальная разрешённая память. Исключены secrets/vault/master-key, `.env*`, `.git`, exports и backup archives. Для восстановления провайдера и encrypted vault нужны отдельные private env/master key/secrets; их нельзя прикладывать к публичным материалам.

Restore проверяет inventory/checksums и создаёт только новую synthetic директорию, существующая память не перезаписывается. Для пробного запуска остановить свою среду, создать новый INSTANCE, поместить восстановленную память в его `memory`, подключить отдельные synthetic secrets/private config и запустить. Исходный INSTANCE сохраняется.

Новый чистый demo-runtime: новый пустой INSTANCE и новый instance ID, затем обычный signup и цель через UI. Не удалять старую память и не сбрасывать integration-среду.

Самопроверка backup/restart на временной synthetic памяти:

```bash
node --import ./app/builds/typescript/node_modules/tsx/dist/loader.mjs scripts/release/persistence-check.mts
```

## Docker — дополнительный вариант

Подробные команды и условия находятся в `app/installer/hackathon/README.md`. Builder использует git archive SHA, свои source-built app/edge images, digest base images и manifest. Launch проверяет image revision и использует `--no-build --pull never`. Явные volumes: `<instance>_memory`, `<instance>_secrets`, network `<instance>_runtime`; общие upstream volumes не используются. `down` без `-v` сохраняет данные.

Docker runtime пока NOT_RUN: daemon отсутствует в проверенных средах. Не подменять этим утверждением PASS source launcher. Для Docker backup читать только собственный memory volume через отдельный read-only mount; upstream backup/restore с `braindrive_*` запрещены для этой проверки.

## Браузерная приёмка

Release Playwright runner находится в `scripts/release/playwright.release.config.mjs`, specs — `app/builds/typescript/client_web/e2e/release-acceptance.spec.ts`. Для внешней собственной среды задаётся `RELEASE_BASE_URL`; runner не запускает второй сервер. Указывать live/fake режим явно; live mutations разрешены только для своей synthetic среды. Traces/video/screenshots с ключами не создавать.

Порядок: signup/login → три критерия → intention (0) → action → точная цитата → confirm (1) → duplicate (1) → reject (0) → mobile. Затем свежий synthetic WAV → настоящий STT/Gemini → transcript/точная цитата/реальные сегментные таймкоды → confirm/числовой server count → reload/restart. У audio payload должен быть duplicate=false: dedup не доказывает новый STT. Приёмочный WAV из Git50.626875с, SHA256 `889c89021c3a64f384a6056a7307b32faae3394dbae44882d5109561359b1577`.

На existing synthetic goal запускать audio отдельно с `--grep 'LIVE audio:'`; main создаёт цель и повторно на существующей памяти не запускается. После успешного audio checkpoint обновляется в `RELEASE_STATE_FILE`. Затем реальный stop/restart, smoke и `RELEASE_RESUME=1` с тем же checkpoint: точное состояние API, source IDs/quotes/status/timecodes и desktop/mobile. Встроенных retries нет; первый FAIL сохранять, диагностический повтор именовать отдельно.

## Проверенное состояние после приёмки

На ef360ae после audio confirm выполнены stop/start original full-ef, backup49files в `backups/ui-ef`, restore в новый `instances/restored-ef/memory`, запуск с `release-restored-ef.env` и обычный UI resume desktop/mobile. Domain state до и после UI имеет SHA256 `37e63c830b1672d40b4a97197a575adcc48d4870b4de255472611fb53ecb4bfb`:3sources/5events,1confirmed,counts1/0/0. Original full-ef сохранён и остановлен. Исторический active restored PID86778 приведён только для evidence; перед управлением читать runtime.json.

Для smoke уже работающей восстановленной среды из A каталога:

```sh
export PATH=/srv/ryadom-hackathon/agent-a/tools/node-v22.21.1-linux-x64/bin:$PATH
node releases/ef360ae/scripts/release/smoke-hackathon.mjs release-restored-ef.env ef360ae0627e35ddfe615143b5409690ac222ed8
```

Не повторять main/audio на этой памяти ради «чистого» прохода: main создаёт goal, audio уже сохранено и даст dedup. Для нового полного gate создать новый собственный INSTANCE и отдельный private instance ID, остановив только свою текущую среду и сохранив её память. После smoke выполнить main с `--grep 'ordinary signup/login'`, затем audio с `--grep 'LIVE audio:'`; оба с отдельными reports и одним RELEASE_STATE_FILE. Текущий composite audio результат и два ранних FAIL описаны в ACCEPTANCE; future native fetch observer имеет local regression PASS, новый live gate с ним ещё NOT_RUN.
