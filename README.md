# Второй мозг для достижения целей

Рабочая основа хакатона: BrainDrive, дополненный планом импорта жизненного контекста и подтверждаемого прогресса. Функции хакатона пока не реализованы; `app/` содержит исходники основы и общий TypeScript-контракт.

**Участникам начать с [распределения работы](docs/agents/START_HERE.md).** Этот документ уточняет роли из первоначального [роадмапа](HACKATHON_ROADMAP.md): два внешних агента делают backend и импорт, текущий Codex отвечает за интеграцию и UI, владелец проекта ведёт дизайн в Stitch.

- [Агент A: цели и прогресс](docs/agents/AGENT_A_GOALS.md).
- [Агент B: контекст и модели](docs/agents/AGENT_B_CONTEXT.md).
- [Наш Codex: интеграция и UI](docs/agents/AGENT_C_INTEGRATION_UI.md).
- [Общий API v1](docs/contracts/API_V1.md).
- [Контракт TypeScript](app/builds/typescript/features/contracts.ts).
- [Работа с Google Stitch](docs/design/STITCH_HANDOFF.md).
- [Происхождение исходников и лицензия](UPSTREAM.md).

Репозиторий: https://github.com/Mozgiii9/vibecoding-hackathon-hse. Дедлайн: 25 октября 2026, 17:30 МСК.

Установка и запуск локально, из корня репозитория:

```bash
# Установить зафиксированные зависимости backend, MCP и web.
npm --prefix app/builds/typescript ci
npm --prefix app/builds/mcp_release ci
npm --prefix app/builds/typescript/client_web ci

# Подключить общий pre-commit hook для проверки staged diff.
git config core.hooksPath .githooks

# Запустить MCP, gateway и Vite с тестовыми данными внутри проекта.
PAA_MEMORY_ROOT="$PWD/.runtime/memory" PAA_SECRETS_HOME="$PWD/.runtime/secrets" npm --prefix app/builds/typescript run dev
```

Gateway: http://127.0.0.1:8787, web: http://localhost:5073. Первую авторизацию и модель необходимо настроить отдельно. Запуск без модели не доказывает работоспособность AI-сценария. Не используйте личные записи и секреты в коммитах или демонстрационных fixture.
