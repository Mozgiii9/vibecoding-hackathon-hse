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
`smoke-hackathon.mjs` одинаков для source/Docker: UI, release SHA, direct/proxied
health/auth bootstrap, отказ анонимному goals API; данные не пишет.
Это не заменяет authenticated пользовательскую приёмку, live LLM/STT,
restart/data backup/restore и браузерный сценарий. Docker Engine в локальной
среде отсутствует; Docker build/Compose запуск требуют отдельной проверки.
