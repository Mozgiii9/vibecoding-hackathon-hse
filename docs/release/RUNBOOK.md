# Запуск и восстановление «Рядом»

Ветка A: `codex/qa-release`. Команды выполняются из корня выбранного release/checkout. Требуются Node 22.12+ с npm, Git для export, tar для переноса. Никакая команда не удаляет общую пользовательскую память. Реальные результаты и SHA записаны в [ACCEPTANCE.md](ACCEPTANCE.md), ограничения — в [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Изоляция A и секреты

Серверный каталог: `/srv/ryadom-hackathon/agent-a`. UI только `127.0.0.1:15073`, gateway `127.0.0.1:18787`; MCP без Docker — loopback `18911–18913`. Перед запуском проверить занятость; чужой процесс не останавливать. В Docker MCP не публикуются на host.

Private env создать из `app/installer/hackathon/.env.example` вне Git, mode 600. Заполнить полный `HACKATHON_SOURCE_SHA`, owner `agent-a`, instance ID `ryadom_a` либо новый `ryadom_a_demo2`. Для master key один раз приватно сгенерировать 32 байта base64 и сохранять при restart/rollback. LLM protocol/base URL/model/key и STT передаются только gateway. Не печатать env, `docker compose config`, process environment или browser traces. Не использовать ключи в CLI.

Текущий сервер не имеет глобального Node/Docker. Node v22.21.1 распакован внутри `agent-a/tools/` из официального архива после проверки SHA256. Добавить его `bin` в PATH текущего shell. Не ставить глобальные пакеты, не менять firewall/Docker и не останавливать B/C.

## Сборка фиксированного нашего SHA без Docker

`FULL_SHA`, `RELEASE`, `PRIVATE_ENV` и `INSTANCE` ниже — обозначения реальных путей/полного SHA, не буквальные значения для запуска.

1. Получить опубликованную ветку A или интегрированный кандидат C. Записать полный SHA, проверить чистоту checkout. Packaging должно присутствовать именно в выбранном коммите.
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

Порядок: signup/login → три критерия → intention (0) → action → точная цитата → confirm (1) → duplicate (1) → reject (0) → reload/restart → mobile. Реальное аудио проверяется отдельно после передачи STT B/C. Отсутствующий STT является открытым пунктом, не успешной аудиоприёмкой.
