# Публичный выпуск чата

25 октября 2026 года в 16:50 МСК публичный сайт `https://77.239.111.64/` переключён с `eba453caec424c47a31c8f8947a83ed9389dc8a3` на **`15ab6ebee73ab19c1727dd999db0a3f6f979e185`** из `main`. `/release.json` подтверждён по публичному HTTPS с обычной проверкой TLS. Кнопка «Чат с агентом» открывает `/chat`; прежний BrainDrive AppShell больше не отображается.

## Сохранение данных и запуск

Релиз собран на сервере под `coord/heavy.lock`: npm ci, backend/MCP/frontend build, frontend typecheck PASS. Перед переключением проверены PID, release, instance, private env и порты прежнего supervisor; остановлен только этот supervisor. TLS proxy, STT B и другие приложения не перезапускались.

После остановки сделан согласованный backup 49 файлов памяти, проверены manifest/checksums и восстановление в новый instance. Private secret store перенесён отдельно без вывода значений, master key и остальные настройки сохранены. SHA256 domain state до/после восстановления совпал. Старый release, instance и private env сохранены для отката.

Актуальные пути на сервере, относительно `/srv/ryadom-hackathon/integration`:

- release: `releases/context-chat-15ab6eb`;
- instance: `instances/context-chat-15ab6eb`;
- private env: `private-context-chat-15ab6eb.env`, mode600;
- backup: `backups/before-context-chat-15ab6eb`;
- прежние release/instance/env: `releases/eba453c`, `instances/restored-eba453c`, `private-c.env`.

UI17073, gateway18789 и MCP18931–18933 остаются на loopback, публичный HTTPS proxy использует443. Текущий supervisor PID читать только из актуального `instances/context-chat-15ab6eb/runtime.json`, не из исторического отчёта.

```sh
# Только если текущий instance остановлен и его порты свободны:
./tools/node-v22.21.1-linux-x64/bin/node releases/context-chat-15ab6eb/scripts/release/launch-source.mjs private-context-chat-15ab6eb.env /srv/ryadom-hackathon/integration/releases/context-chat-15ab6eb /srv/ryadom-hackathon/integration/instances/context-chat-15ab6eb

# Read-only smoke работающего экземпляра:
./tools/node-v22.21.1-linux-x64/bin/node releases/context-chat-15ab6eb/scripts/release/smoke-hackathon.mjs private-context-chat-15ab6eb.env 15ab6ebee73ab19c1727dd999db0a3f6f979e185
```

Согласованный откат после новых пользовательских записей требует сначала backup текущей памяти. Не запускать архивную память как актуальную без переноса новых данных. Общий порядок backup/stop/restore описан в `docs/release/RUNBOOK.md`.

## Проверка публичного сайта

Существующий тестовый аккаунт успешно вошёл обычной формой. Через кнопку цели отправлены два тестовых вопроса: название цели вернулось с проверенной цитатой; вопрос о погоде вне контекста получил `insufficient_context`. Вопросы не уходят в общий `/message`.

Первый проход прошёл пять функциональных проверок, затем остановился на ожидании заголовка после reload с таймаутом 5s. Этот FAIL сохранён. Код приложения не менялся. Два отдельных read-only прохода с ожиданием до30s подтвердили восстановление четырёх сообщений, отсутствие BrainDrive shell и размещение composer в375px. Повторных запросов к модели не было. Цель, прогресс и evidence до/после совпали побайтно в JSON-представлении. Это составная приёмка, а не переименованный успешный полный прогон.

Подробности: [публичное evidence](context-chat-public-deployment.json). Скриншоты находятся в локальном `/private/tmp/ryadom-context-chat-public`; в Git не включены. Физический iPhone после обновления повторно не проверялся.
