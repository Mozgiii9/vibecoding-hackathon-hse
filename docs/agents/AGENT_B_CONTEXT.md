# Агент B — импорт контекста и модели

Этот файл можно передать Codex как задание. Репозиторий `Mozgiii9/vibecoding-hackathon-hse`, ветка **`codex/context-ingest`**. Прочитай `docs/agents/START_HERE.md`, `docs/contracts/API_V1.md`, `app/AGENTS.md` и `app/builds/typescript/features/contracts.ts`.

Реализуй импорт текста, извлечение проверяемых событий и, при доступном STT, короткого аудио. Сначала кратко назови последовательность и приступай в согласованной границе; не жди core/UI. В тестах создай фейковую реализацию ContextStore. Передача этого задания владельцем разрешает реализацию внутри него, если владелец отдельно не ограничил работу анализом.

## Файлы и границы

Твои файлы — `app/builds/typescript/features/context/**` и `docs/handoffs/agent-b.md`. `index.ts` экспортирует `registerContextRoutes` и `createContextProviders` по API_V1.md. Модуль получает ContextStore и не импортирует реализацию goals-core. Все источники и evidence сохраняет core через `commitImport`; никакого второго JSON-хранилища.

Не меняй gateway, общую схему, goals-core, frontend и package manifests/locks. Существующие Node fetch/crypto, Fastify, Zod и Vitest достаточны для текстового пути. Если для аудио нужна новая зависимость, сообщи интегратору до изменения; сначала попробуй API-провайдер с raw upload. Python/Whisper на сервер не добавлять без отдельного решения о ресурсах.

Каждый маршрут проверяет memory_access. Отказ authorize переводится в 403 forbidden по общему контракту, не в 500. 401 обрабатывает существующий gateway middleware.

## Провайдер

Пользователь подтвердил кастомный провайдер с моделями Gemini; OpenRouter — резерв. URL, model ID, API protocol и STT ещё не даны. Не выводи их из слова Gemini и не ищи чужие ключи в домашней директории. Настройки передаёт интегратор, секреты остаются на сервере. Пока они не пришли, пиши transport adapter и тесты с mocked fetch; не выдавай fixture за результат реального LLM.

Поддержи один фактически подтверждённый протокол. Ненастроенный провайдер → provider_unconfigured, не silent fallback. У extraction timeout и AbortSignal, ограничение размера ответа и строгая schema. Не отправляй контекст в OpenRouter без выбора владельцем этого провайдера. Для STT нужен отдельный подтверждённый endpoint/адаптер; chat API Gemini не равен автоматически Whisper API.

## Последовательность

1. **Первый коммит:** index/route/ingestion skeleton, тестовый ContextStore, сборка. Опубликуй ветку с точными экспортами.
2. **Текст:** input schema, лимит, hash, ранняя дедупликация, getConfirmedGoal. Стабильный текст и offsets.
3. **Extraction:** получить EvidenceDraft[], разделить completed_action/intention/obstacle/uncertain. Не создавать события без цитаты. Разрешать только criterionId из цели. Никаких tools у extraction и исполнения инструкций внутри источника.
4. **Validation и commit:** точное совпадение quote и диапазонов, безопасное сопоставление timestamps, затем атомарный ContextStore.commitImport. Ошибка модели не оставляет источник как успешно обработанный. Сохранять все предложенные события без автоподтверждения.
5. **Аудио:** изолированный raw-body route, MIME/размер, реальная STT → тот же pipeline. При отсутствии STT вернуть stt_unconfigured и оставить текст полностью рабочим. Не сохранять raw audio в MVP, не рисовать выдуманные timestamps.
6. **Handoff:** provider config без значений ключей, какие реальные вызовы проверены, curl/fixture примеры, SHA и тесты. Push только своей ветки.

## Проверки

- Три синтетических текста из API_V1 дают подходящие eventType и ссылки на оригинал; unit tests с фиксированным ответом модели не доказывают качество живой модели.
- Prompt injection в источнике не меняет задачу extraction; ложные criterionId/quote/offsets отклоняются.
- Повтор точного источника пропускает LLM/STT и возвращает существующие ID.
- Неверный JSON, таймаут, сетевой сбой, HTTP 429/500, неполная конфигурация → понятная ошибка без частичного commit.
- Смена revision цели за время LLM → goal_changed; повтор не превращается в дубль.
- UTF-16 offsets, кириллица/эмодзи, неоднозначная цитата, пустой текст.
- Аудио сверх лимита и неподдерживаемый MIME отклоняются до вызова провайдера; временные ссылки соответствуют настоящим segments.

```bash
# Проверить сборку backend.
npm --prefix app/builds/typescript run build
# Запустить тесты только своего модуля.
npm --prefix app/builds/typescript test -- features/context
```

Используй настроенные hooks и `git diff --cached --check`; коммить только свои пути.

## Сабагенты и сроки

Можно поручить одному помощнику provider adapter и transport tests, второму — независимый review extraction/цитат; сам делай ingestion/routes. Раздели файлы заранее. Аудио лучше делегировать после готовности текстового пути, без изменения общих контрактов.

К 14:00 — текстовый pipeline и проверка реального LLM, когда доступны настройки. К 14:15 — интеграция. Если к 14:45 STT не заработал, зафиксировать текстовый режим и не тратить оставшееся время на установку моделей. В 15:45 прекратить новые функции.
