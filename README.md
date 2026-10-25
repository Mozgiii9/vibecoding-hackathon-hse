# Второй мозг для достижения целей

Хакатонный MVP на основе BrainDrive: согласованная цель, импорт текстового контекста, извлечённые события, проверка цитат, подтверждение действий и серверный прогресс. Модули участников объединены в `codex/integration-ui`; для живого извлечения нужна серверная конфигурация LLM. Аудиомаршрут готов к подключению отдельного STT, но реальное распознавание ещё не настроено.

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
npm --prefix app/builds/typescript run dev:hackathon
```

Gateway: http://127.0.0.1:8787, web: http://localhost:5073. Первую авторизацию и модель необходимо настроить отдельно. Запуск без модели не доказывает работоспособность AI-сценария. Не используйте личные записи и секреты в коммитах или демонстрационных fixture.

Для живого сценария создайте локальный `app/builds/typescript/.env.hackathon` по примеру `.env.hackathon.example`. Node загрузит environment-файл, память и хранилище секретов по умолчанию останутся внутри корневого `.runtime/`. Переданные значения подключены к extraction-модулю; без ключа импорт возвращает понятную ошибку и не создаёт частичный результат. Провайдер из handoff участника B проверен как OpenAI-compatible chat completions, модель `gemini-3.8-flash`; ключ остаётся только в environment.

Вход в рабочий интерфейс проходит через авторизацию BrainDrive. Для отдельного просмотра дизайна без пользовательских данных откройте http://localhost:5073/?preview=goals: это development-only макет с синтетическими источниками, без сетевых запросов к модели и без сохранения подтверждений. В production-сборку макет не включается.

Проверки интеграции и ограничения записаны в [handoff нашей ветки](docs/handoffs/agent-c.md). Дизайн экрана: [подтверждённый бриф](docs/design/GOALS_BRIEF.md).
