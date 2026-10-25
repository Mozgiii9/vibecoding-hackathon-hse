# Рядом

Второй мозг, который связывает события из заметок и коротких разговоров с личной целью. Модель предлагает события и точные цитаты; человек проверяет их, а сервер считает подтверждённый прогресс.

Хакатонный MVP: одна цель и три критерия, текст и короткое аудио, источник каждого события, подтверждение/пересмотр, дубли без повторного роста и постоянная память. Намерения не считаются выполненными действиями. Цель задаётся формой, следующий шаг выбирает правило. LLM-интервью, continuous recording и OAuth не реализованы.

## Рабочая версия и показ

Готовая разработка находится в ветке **codex/integration-ui**. Source-кандидат сервера — **eba453caec424c47a31c8f8947a83ed9389dc8a3**; последующие коммиты могут содержать отчёты и материалы. Проверять фактический deployment через `/release.json`.

- [Открыть приложение, запуск и восстановление](docs/demo/OPERATIONS.md).
- [Текущее доказательство production-проверок](docs/demo/evidence/c-production/summary.json) и [handoff C](docs/handoffs/agent-c-wave2.md).
- [Четыре автономных экрана защиты](docs/demo/defense/index.html), [сценарий на три минуты](docs/demo/DEMO_SCRIPT.md), [реальные резервные видео](docs/demo/defense/recordings/README.md).
- [Общий контракт](docs/contracts/API_V1.md), [граница и приёмка MVP](docs/agents/MVP_ACCEPTANCE.md), [план команды](docs/agents/ITERATION_2.md).

Доступ к серверному UI настроен через SSH tunnel, а не публичный hosting. Техническая приёмка C выполнена; финальная независимая A4 и человеческие репетиции отмечаются отдельно по факту.

## Локальная разработка

Нужен Node22.12+ и npm. Клонировать рабочую ветку, установить зависимости трёх частей из lockfiles:

```bash
# Получить текущую реализацию команды.
git clone --branch codex/integration-ui https://github.com/Mozgiii9/vibecoding-hackathon-hse.git
# Перейти в корень полученного проекта.
cd vibecoding-hackathon-hse
npm --prefix app/builds/typescript ci
npm --prefix app/builds/mcp_release ci
npm --prefix app/builds/typescript/client_web ci
# Включить общий pre-commit hook для своего clone.
git config core.hooksPath .githooks
# Собрать MCP, необходимые локальному launcher.
npm --prefix app/builds/mcp_release run build
```

Создать приватный `app/builds/typescript/.env.hackathon` по соседнему `.env.hackathon.example`, mode600, заполнить выбранный OpenAI-compatible Gemini endpoint/model/key. STT настраивается отдельно; без работающего transcribe-сервиса аудио недоступно. Ключи не передавать в frontend, Git и командные аргументы.

```bash
# Запустить свои gateway/MCP/Vite; память и secrets останутся в ignored .runtime/.
npm --prefix app/builds/typescript run dev:hackathon
```

UI: http://localhost:5073/. После обычного входа создать цель и добавить источник. `?preview=goals` — только development-макет с synthetic данными, не live-приёмка.

Production source packaging без Vite и Docker описан в [инструкции выпуска](app/installer/hackathon/README.md). Python/STT использует scoped uv, проектную `.venv` и `uv.lock`, см. [services/stt](services/stt/README.md). Изолированные серверные среды и heavy lock обязательны для команды.

## Основа

Форк [BrainDrive](https://github.com/BrainDriveAI/BrainDrive), лицензия MIT. Оригинальные исходники, LICENSE и TRADEMARK сохранены в `app/`, [происхождение и импорт](UPSTREAM.md) зафиксированы отдельно. Собственный вклад команды: доменная модель целей/evidence, text/audio extraction и проверка цитат, вычисляемый прогресс, review UI, интеграция и source release. Название «Рядом» рабочее; торговая марка BrainDrive не присваивается.

Распределение команды: [A — выпуск](docs/agents/AGENT_A_RELEASE.md), [B — аудио/качество](docs/agents/AGENT_B_AUDIO_QUALITY.md), [C — интеграция/UI](docs/agents/AGENT_C_INTEGRATION_UI.md). [Контракт TypeScript](app/builds/typescript/features/contracts.ts) и [подтверждённый дизайн-бриф](docs/design/GOALS_BRIEF.md). Жёсткий дедлайн хакатона: 25 октября2026,17:30МСК.
