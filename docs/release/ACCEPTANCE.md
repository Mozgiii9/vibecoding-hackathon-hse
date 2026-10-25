# Приёмка выпуска «Рядом»

Дата: 25 октября 2026, МСК. Ответственный A, ветка `codex/qa-release`.

Base SHA: `484c396e71b3fbfe2ff65c04f6260e1899aa6bd1` из `origin/codex/integration-ui`, включает `92cb8bc`. Проверенный первый срез сохранности: `83108ad3f7d42b08c089ad79043163baeba7a26d`.

Это журнал доказательств. Полный MVP пока **не принят**: реальное аудио, production restart и общий релизный кандидат ещё проверяются. Тестовый provider и синтетические audio SourceDraft не являются живой моделью или STT.

## Выполненные проверки

Команды приведены из корня репозитория, кроме явно указанного cwd. Нужны Node и npm в PATH; на локальной машине использовались Node v24.22.1 и npm 10.9.4 во временном toolchain.

| Пункт | Статус | Команда / доказательство |
|---|---|---|
| Backend compilation | PASS | `npm --prefix app/builds/typescript run build` |
| MCP compilation | PASS | `npm --prefix app/builds/mcp_release run build` |
| Frontend production build | PASS | `npm --prefix app/builds/typescript/client_web run build`; предупреждение JS chunk >500 kB |
| Goals + context | PASS | cwd `app/builds/typescript`: `npm test -- features/goals features/context features/integration`; 8 файлов, 209 тестов; отдельной папки features/integration нет |
| Frontend unit suite | PASS | `npm --prefix app/builds/typescript/client_web test`; 20 файлов, 215 тестов |
| MCP suite | PASS | `npm --prefix app/builds/mcp_release test`; 2 файла, 6 тестов |
| Полный backend suite | FAIL | `npm --prefix app/builds/typescript test`: 411 PASS, 3 FAIL из 414; один baseline starter-pack lint и два запрета loopback sandbox |
| Desktop bridge повторно с loopback | PASS | cwd backend: `npm test -- desktop/bridge.test.ts` вне filesystem sandbox; 20/20. Это не повторный зелёный полный suite |
| Сохранность, restart отдельного Node-процесса | PASS | `node --import ./app/builds/typescript/node_modules/tsx/dist/loader.mjs scripts/release/persistence-check.mts` |
| Existing migration export | PASS | Та же проверка: экспорт содержит `memory/hackathon/state.json`; fake secrets paths отсутствуют, vault/master-key не включены |
| Новый backup/restore | PASS | Та же проверка: SHA256/bytes inventory, точное состояние в новом synthetic root, пустые директории сохранены |
| Защиты восстановления | PASS | Отказ существующему root, пересечению путей, symlink parent в исходную память, повреждённому checksum и path traversal |
| Новый чистый demo root | PASS | Отдельный пустой synthetic root не меняет исходную память |
| Осмотр тестового сервера | PASS | SSH read-only: 1 CPU, 1967 МБ RAM, около 24 ГБ свободно; Node/Docker глобально отсутствовали, чужая среда B сохранена |
| Scoped Node сервера | PASS | `/srv/ryadom-hackathon/agent-a/tools/node-v22.21.1-linux-x64`, официальный archive проверен SHASUMS256; установка под общим flock |
| Export dependencies regression | PASS | `node --test scripts/release/smoke-source-export.test.mjs`; 2/2: настоящий frontend typecheck из git archive, материализация Docker edge COPY и проверка file:.. dependency |

## Очередь интегрированной приёмки

| Требование | Статус | Что ещё нужно |
|---|---|---|
| Обычная авторизация и цель через desktop UI | PASS локально | Настоящий buildServer/JWT, clean signup201, logout, wrong password401, login200; dev UI, ещё не production candidate |
| Live Gemini intention/action и точная цитата | PASS локально, один предшествующий FAIL | Повторный clean прогон 14:11:52–14:12:22 МСК; 1 passed / 6 skipped, `/private/tmp/ryadom-release-browser-live.json`; реальная модель, без response mocks |
| UI confirm/progress/duplicate/reject/reload | PASS локально | Live intention0 → action proposed0 → quote → confirm1 → duplicate1 → reject0 → reload0, подтверждён API ответами |
| Узкий мобильный экран | PASS локально | Тот же live сценарий на 390×844, нет горизонтального overflow |
| Таймаут/ошибка без ложного успеха | PASS protocol-fake | 6 passed / 1 skipped, 14:14:37–14:14:46 МСК: timeout, HTTP503, invalid JSON, реальный revision conflict, stt_unconfigured; `/private/tmp/ryadom-release-browser-fake.json`; live outage не имитируется как live quality |
| Реальный audio upload/STT/evidence/confirm | NOT_RUN | B ещё не передал реальный adapter в проверенную ветку |
| Fixed SHA source-build и чистый запуск | PASS f93536d, первый FAIL сохранён | Linux/x64 Node22.21.1, git archive SHA256 ea04f24d0e26817c1218c94737f7bfeff611e11071572dfc818c95b21a5c3aa5; backend/MCP/web ci/build и web typecheck exit0; build manifest 11:20:01 UTC |
| Серверный health/auth smoke нашего SHA | PASS f93536d | Изолированный A source launcher без Docker; built React entrypoint, release SHA, direct/proxyhealth200, auth bootstrap200, анонимные goals401; один gateway+3 MCP, все5портов loopback |
| Production live Gemini UI f93536d | PASS | 14:21:11–14:21:54 МСК, external production static edge→gateway→реальная модель; main1PASS/6skipped, точные source/evidence IDs, counts/revisions и desktop/mobile390 |
| HTTP restart с сохранённой UI-целью | PASS f93536d | Supervisor81963 реально остановлен, тот же instance перезапущен PID82436; smokePASS, 14:23:24 resume1/1PASS: ordinary login, полный goal/evidence/progress checkpoint и все source quotes на desktop/mobile |
| Backup/restore настоящей synthetic UI-памяти | PASS f93536d | Остановленный собственный gateway; backup49файлов, новая restored memory и отдельная приватная копия своих synthetic secrets. State SHA256 0522b2dbed62784e7fabffcdd21766ccb669b4d1f743388eda0a2a45808388a6 совпадает |
| HTTP/UI на восстановленной копии | PASS f93536d | Отдельный instance restored-f935, supervisor82655; smokePASS, 14:24:55 resume1/1PASS с тем же pre-restart checkpoint, IDs/revisions/status/counts/quotes полностью совпали. Исходная память сохранена |
| Приёмка финального общего SHA C | NOT_RUN | SHA/кандидат C ещё не передан |
| Проверка резервного трёхминутного видео | NOT_RUN | Комплект защиты C ещё не передан |

Локальный live прогон использовал исходники реализации base и отдельный временный runtime без MCP; он не подменяет production acceptance нашего source-built SHA. На первом live прогоне выполненное действие вернуло `provider_failed`, UI показал ошибку, прогресс не вырос. Точная причина ответа модели тогда не снималась; не приписываем сбой конкретной валидации. Повтор прошёл без смены провайдера/fallback. Traces, screenshots и video выключены, provider diagnostics сохраняют только форму ответа.

Production доказательства: [source-f935-summary.json](evidence/source-f935-summary.json). Полные приватные browser отчёты на машине проверки: `/private/tmp/ryadom-source-f935-main.json`, `-restart.json`, `-restore.json`, synthetic checkpoint `/private/tmp/ryadom-source-f935-state.json`. Это PASS текстового production кандидата A, а не audio/full MVP и не приёмка более нового общего SHA C.

## Точная область A3

Проверка создаёт только временную синтетическую память и удаляет только её. Три источника (два text, один заранее заданный audio SourceDraft) дают review `confirmed/rejected/proposed`, revisions `2/3/1` и progress `[1,0,0]`. Объект store и новый Node-процесс возвращают те же цели, source, evidence, revisions и progress. Проверяется duplicate lookup. Backup/restore сохраняет байты state.json и загружается новым GoalsStore.

Это доказывает файловую сохранность доменного состояния, но не заменяет реальную расшифровку, UI reload, полный gateway restart или серверный запуск.
