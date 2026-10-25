# Машина показа «Рядом»

Прежний полностью проверенный source-кандидат: **eba453caec424c47a31c8f8947a83ed9389dc8a3**. Backend/MCP/frontend собраны на Linux/x64, Node22.21.1 из Git-архива этого SHA. [Manifest](evidence/c-production/build-manifest.json), [проверки C](evidence/c-production/summary.json), [восстановление](evidence/c-production/restore-proof.json). Более свежие Git-коммиты могут содержать только отчёты и материалы; фактический deployment SHA всегда проверять через `/release.json`.

## Текущий запуск после параллельного обновления

Во время проверки разделения URL серверное приложение было независимо обновлено до **15ab6ebee73ab19c1727dd999db0a3f6f979e185** (`origin/main`, context-chat). Фактические release/instance: `releases/context-chat-15ab6eb` и `instances/context-chat-15ab6eb`; private env `private-context-chat-15ab6eb.env`. При проверке supervisor88892, gateway88932; будущие операции сверять с `instances/context-chat-15ab6eb/runtime.json`. Порты UI17073/API18789 сохранились. Этот интегратор перезапустил только собственный TLS proxy, не приложение.

Новый public routing: **панель https://77.239.111.64/**, **лендинг https://77.239.111.64/landing/**. Кнопка лендинга ведёт в панель; `/landing` перенаправляется на `/landing/`. Включён `HACKATHON_HTTPS_LANDING_PORT=80`, HTTP listener самого proxy по-прежнему выключен. Исходный HTTP landing обслуживается своим процессом, его файлы не изменены. [Проверки и актуальные PID](evidence/c-production/landing-routing.json).

```bash
# Только если текущая instance остановлена: запустить её из workspace C с её собственной памятью и env.
./tools/node-v22.21.1-linux-x64/bin/node releases/context-chat-15ab6eb/scripts/release/launch-source.mjs private-context-chat-15ab6eb.env /srv/ryadom-hackathon/integration/releases/context-chat-15ab6eb /srv/ryadom-hackathon/integration/instances/context-chat-15ab6eb
```

Работающий экземпляр не запускать повторно. Команды для eba453c ниже относятся к прежнему проверенному кандидату и его архиву; их запуск на текущих занятых портах не является обновлением context-chat. Полная приёмка eba453c не переносится автоматически на новый SHA; при routing-проверке15ab6eb подтверждены обычный вход, цель, reload и anonymous API401.

## Открыть приложение

Основной адрес приложения: **https://77.239.111.64/**. Доверенный сертификат Let’s Encrypt на IP действует до **1 ноября 2026, 06:48 МСК**. UI и API доступны под одним HTTPS origin; обычный вход сохранён. На iPhone после прежней ошибки TLS нажать «Повторить загрузку». Фактический проход на физическом устройстве подтверждает владелец отдельно.

Проверки: [независимый публичный smoke](evidence/c-production/https-independent.json), [развёртывание HTTPS](evidence/c-production/https-deployment.json), [порядок выпуска и продления](HTTPS_PLAN.md). Автоматическое продление и запуск proxy после reboot не настроены.

Резерв на ноутбуке — SSH-туннель. Если UI уже открывается по адресу ниже, повторный tunnel на занятый порт не запускать.

```bash
# Открыть только локальный доступ к UI C; пароль вводится интерактивно.
ssh -N -L 127.0.0.1:17073:127.0.0.1:17073 root@77.239.111.64
```

Открыть **http://127.0.0.1:17073/**. Это loopback ноутбука через туннель, не публичный URL сервера. Проверка версии: http://127.0.0.1:17073/release.json. Синтетический login передаётся приватно владельцем; файл передачи A/C на сервере — `integration/private/synthetic-login.env`. Значения не помещать в Git или слайды.

Для A/B/C использовать отдельные профили/контексты браузера: refresh-cookie одного hostname не разделяется портами. Проверка только ширины390px не заменяет физический телефон. Публичный HTTPS добавлен отдельным proxy без изменения app source; физическая iOS-оболочка проверяется отдельно, PWA не реализована.

## Архив: состояние и проверка eba453c

- Workspace C: `/srv/ryadom-hackathon/integration`.
- Immutable release: `releases/eba453c`.
- Активная восстановленная копия: `instances/restored-eba453c`, память/секреты в её `memory`/`secrets`.
- Исходная копия `instances/mvp-eba453c` сохранена и остановлена.
- Согласованный backup: `backups/eba453c-live`,49файлов. Secrets в backup не входят; при этом проверенном восстановлении они перенесены отдельно приватно, master key сохранён.
- Private env C: `private-c.env`, mode600. Scoped Node: `tools/node-v22.21.1-linux-x64/bin/node`.
- UI17073, gateway18789, MCP18931–18933, все только loopback. Актуальный supervisor PID находится в `instances/restored-eba453c/runtime.json`; не использовать старые PID из отчётов для остановки.
- Собственный TLS proxy: `https/proxy.mjs`, private config `https/private.env` mode600, PID `https/proxy.pid`, log `https/logs/proxy.log`. Только публичный443; `HACKATHON_HTTPS_HTTP_ENABLED=0`. Чужой landing на HTTP80 сохранён.
- Общий STT B: `127.0.0.1:19000`, base/ru/CPUint8. Его не перезапускать из C. Исходники и `uv.lock` входят в release, отдельный запуск описан в `services/stt/README.md` и `app/installer/hackathon/README.md`.

Checkpoint после restore: cv1/1, mock1/2, feedback0/1;6событий. Последующие публичные проверки добавляют собственные synthetic источники и могут менять текущие counts. Актуальные данные смотреть в UI; не считать checkpoint текущим live-состоянием. Повтор того же источника должен показывать duplicate.

```bash
# Если остановлен только собственный HTTPS proxy, запустить его с существующей парой PEM.
./tools/node-v22.21.1-linux-x64/bin/node https/proxy.mjs tls https/private.env
```

Эту команду выполнять из `/srv/ryadom-hackathon/integration`; работающий proxy повторно не запускать. Приложение и STT для запуска TLS не перезапускаются. Ручное продление сертификата требует освободить только443 от собственного proxy: полный порядок в [HTTPS_PLAN.md](HTTPS_PLAN.md).

## Архив: запуск, smoke и restart eba453c

Команды ниже выполнять только на сервере из workspace C. Они не устанавливают глобальные пакеты и не затрагивают A/B.

```bash
# Запустить готовый кандидат с существующей восстановленной памятью, если он остановлен.
./tools/node-v22.21.1-linux-x64/bin/node releases/eba453c/scripts/release/launch-source.mjs private-c.env /srv/ryadom-hackathon/integration/releases/eba453c /srv/ryadom-hackathon/integration/instances/restored-eba453c

# В другом shell проверить UI/SHA/health/auth401 без записи данных.
./tools/node-v22.21.1-linux-x64/bin/node releases/eba453c/scripts/release/smoke-hackathon.mjs private-c.env
```

Launcher работает foreground; при необходимости перенаправить его вывод в private log своей среды. Уже работающий экземпляр не запускать второй раз. Для restart проверить own namespace/SHA/PID в runtime.json, отправить SIGTERM только своему supervisor, дождаться освобождения пяти портов и повторить launch. Lock вручную не удалять без проверки завершения собственных процессов. Полный порядок backup/restore и rollback — [RUNBOOK A](../release/RUNBOOK.md).

Для повторной чистой сборки экспортировать полный SHA в **новый** release directory, затем собирать под shared heavy.lock. Для HTTP/audio этот внешний lock не держать: его берёт сам STT во время inference. Никогда не выполнять global prune/pkill/reboot. Source-экземпляр не использует Docker, upstream app images или Vite.

## Резерв защиты

Для чистой репетиции подготовлены **не запущенные** `instances/show-eba453c` и `private-show-c.env` с новым namespace/master key. Активная восстановленная копия не изменена. Когда интегратор завершит текущее окно A/C, остановить только её проверенный supervisor и запустить тот же release с `private-show-c.env` и state `/srv/ryadom-hackathon/integration/instances/show-eba453c`. Launcher откажет на занятых портах и не остановит соседние процессы. Затем обычным UI создать синтетический аккаунт и цель; старые instance и backup сохранить. Не стартовать второй gateway одновременно.

```bash
# Только после остановки собственного прежнего C: запустить подготовленную чистую demo-среду.
./tools/node-v22.21.1-linux-x64/bin/node releases/eba453c/scripts/release/launch-source.mjs private-show-c.env /srv/ryadom-hackathon/integration/releases/eba453c /srv/ryadom-hackathon/integration/instances/show-eba453c
```

Четыре автономных [экрана презентации](defense/index.html), [сценарий](DEMO_SCRIPT.md), [чеклист репетиций](REHEARSAL.md) и [реальное текстовое видео production-кандидата](defense/recordings/production-eba453c/completed-text/demo.webm). Ролик не содержит весь трёхминутный рассказ и не заменяет audio evidence.

Локальный `npm --prefix app/builds/typescript run dev:hackathon` остаётся текстовым резервом. Его env приватен; аудио в нём использует SSH-доступ к тому же серверному STT. Полностью offline LLM/STT-работа не заявляется. При сетевом сбое использовать автономные слайды и подписанную запись реального прохода, не выдавая её за текущий live-запрос.
