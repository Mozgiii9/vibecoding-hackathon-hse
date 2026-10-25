# API v1 для трёх агентов

Статус: фиксированный стартовый контракт для предложенного разделения работ, не описание уже работающих endpoints. Канонические TypeScript-типы: `app/builds/typescript/features/contracts.ts`. Время — ISO 8601 с timezone; ID — непустые строки. Внешние payload валидировать через Zod, одним TypeScript не ограничиваться.

Маршруты ниже записаны относительно gateway. Браузер использует существующий `/api` proxy: например `/api/goals/demo`. Реальная авторизация — существующая BrainDrive; не создавать публичный дубликат API. В каждом модуле проверять право `memory_access`. Интегратор подключает модули после auth hooks и проверяет 401/403. Ответ 401 остаётся в существующем формате upstream middleware; отказ в праве memory_access оба новых модуля переводят в `403 { error: { code: "forbidden", message: "Недостаточно прав" } }`. Не отдавать обычный Error из authorize как 500.

## Кто что экспортирует

Агент A: `features/goals/index.ts`:

```ts
createGoalsStore(options: { memoryRoot: string }): Promise<GoalsStore>
registerGoalsRoutes(app: FastifyInstance, deps: { store: GoalsStore }): Promise<void>
```

Агент B: `features/context/index.ts`:

```ts
registerContextRoutes(app: FastifyInstance, deps: {
  store: ContextStore;
  providers: ContextProviders;
}): Promise<void>
createContextProviders(config: {
  protocol?: "openai-compatible" | "gemini-native";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  stt?: { baseUrl: string; model: string; apiKey: string };
}): ContextProviders
```

Реализовать один подтверждённый протокол основного провайдера. Второй протокол можно честно отклонять `provider_unconfigured` до его реализации. STT config означает отдельно проверенный OpenAI-compatible transcription endpoint; не считать любой Gemini/OpenRouter URL таким endpoint. Функции не читают секреты из frontend. Отсутствующие настройки не мешают запуску приложения: соответствующий запрос возвращает явную ошибку.

Интегратор создаёт store и providers, передаёт в оба модуля. Обработку `FeatureError` каждый модуль должен переводить в стабильный HTTP ответ, без изменения глобального gateway error handler агентами A/B. В тестах использовать `app.inject()` с подготовленным authContext.

## Маршруты A

| Метод и путь | Запрос | Успешный ответ |
|---|---|---|
| `PUT /goals/:goalId` | `GoalWrite` | `200 { goal: Goal }` |
| `GET /goals/:goalId` | — | `200 { goal: Goal }` |
| `GET /goals/:goalId/evidence` | — | `200 { evidence: Evidence[] }` |
| `GET /goals/:goalId/progress` | — | `200 { progress: Progress }` |
| `GET /sources/:sourceId` | — | `200 { source: Source }` |
| `PATCH /evidence/:evidenceId` | `{ status, expectedRevision, duplicateOfEvidenceId? }` | `200 { evidence: Evidence }` |

При создании цели `expectedRevision: null`; первая revision = 1. При изменении передавать текущую revision, иначе 409. `confirm: true` фиксирует `confirmedAt` серверным временем; без подтверждения импорт возвращает 409 `goal_unconfirmed`. После первого импорта запретить изменение цели целиком с `goal_locked` (повтор идентичного PUT допустим без изменения revision). Так не требуется миграция evidence к новым критериям.

Внутренний `getGoal`/`getSource` возвращает null для отсутствующего объекта; HTTP маршрут переводит это в 404. `getConfirmedGoal` выбрасывает FeatureError, если объект отсутствует/не подтверждён. Списки и прогресс несуществующей цели тоже дают 404.

Каждое evidence создаётся `proposed`, revision = 1. Клиент не может прислать статус confirmed через импорт. PATCH принимает только корректную revision. Подтвердить можно только `completed_action`; прочие eventType остаются proposed/rejected/disputed. При неверном переходе — 422 `invalid_evidence`. Переход confirmed → rejected/disputed уменьшает подтверждённый прогресс.

`duplicateOfEvidenceId` позволяет человеку объединить две записи одного действия: только внутри одной цели и одного критерия. Core присваивает текущей записи существующий eventKey выбранного evidence. Это не изменение eventType и не автоматическое подтверждение. Смысловые дубли не решаем одним LLM-хешем.

## Маршруты B

`POST /context/import`:

```json
{
  "goalId": "demo",
  "title": "Сообщение рекрутера",
  "text": "Резюме получил, приглашаем на интервью.",
  "capturedAt": "2026-10-25T13:30:00+03:00"
}
```

Ответ `200 ImportResult`: `{ source, evidence, duplicate }`, где evidence всегда массив, включая пустой. Это непосредственный объект, без дополнительной обёртки `result`. Лимит текста 50 000 UTF-16 units, title до 200; capturedAt может быть null. Пустой/пробельный текст — 400. Не менять нормализацию принятого текста после вычисления ссылок на цитаты.

`POST /context/audio?goalId=demo&title=Interview&capturedAt=...`:

- Тело — сырые байты файла, не multipart и не base64. `Content-Type`: `audio/wav`, `audio/mpeg`, `audio/mp4` или `audio/webm`.
- Максимум 10 МиБ; body limit задаётся только для этого маршрута. Парсер buffer зарегистрировать в изолированном Fastify plugin, чтобы не изменить JSON parsing других маршрутов.
- Ответ тот же `ImportResult`, source.kind = audio. Таймкоды только из реальных segments STT. Если провайдер вернул только текст, segments = [], временные ссылки null. Не выдумывать секунды.
- Целевая длительность demo до двух минут. Ограничение по байтам обязательно; если длительность нельзя надёжно определить, не утверждать, что сервер проверяет её.
- В MVP сохраняем расшифровку и segments; сырые байты аудио после обработки не сохраняем. UI показывает цитату/таймкод в расшифровке, плеер не обещает. Хранение/проигрывание оригинала — только дополнительная согласованная функция.

При успешном извлечении намерений/препятствий сохранять их с соответствующим eventType. Если модель вернула испорченный JSON/несуществующие criteria/несовпадающие цитаты, отклонить ответ целиком с 502 `provider_failed`; не молча превращать его в пустой успешный список. Источник для неуспешной обработки не коммитить.

## Идемпотентность и транзакция

1. B берёт подтверждённый Goal snapshot через порт.
2. Хеширует последовательность `kind`, один нулевой байт `0x00`, затем `originalBytes` через SHA-256, hex lowercase. Для текста originalBytes = UTF-8 исходного принятого text; title/capturedAt в hash не входят.
3. `findImport(goalId, contentHash)` проверяется до LLM/STT; найденный результат возвращается с duplicate = true и текущими пользовательскими статусами.
4. B вызывает провайдеры вне транзакции и валидирует предложения: criterion существует; `text.slice(textStart,textEnd) === quote`; диапазоны целочисленные и корректные. LLM может вернуть quote вместо offsets, но код обязан найти точное вхождение и корректно обработать неоднозначность, не угадывая.
5. `commitImport` у A снова проверяет hash, goal revision и валидность данных, затем сохраняет Source и весь Evidence одной операцией. Изменившаяся цель → 409 `goal_changed`. Повтор гоняющихся запросов возвращает один набор ID.

Core хранит snapshot в `<memoryRoot>/hackathon/state.json`, сериализует все изменения одной очередью и использует temporary file + rename. Поддерживаем один процесс, не несколько реплик. При ошибке записи не заменять рабочее состояние в памяти. Core генерирует source/evidence ID и eventKey; B не может навязать review status. Source привязан к одной goalId; одинаковый источник для другой цели — отдельный импорт.

Одинаковые предложения внутри одного импорта дедуплицируются по `(criterionId,eventType,textStart,textEnd)`. Начальный eventKey = SHA-256 от JSON-массива `[sourceId,criterionId,textStart,textEnd]`, hex lowercase. Если модель прислала разные типы события для одного критерия и одного диапазона, core отклоняет такой конфликт с invalid_evidence. Между разными диапазонами/источниками смысловое совпадение автоматически не обещаем; для него есть ручное объединение.

Прогресс: уникальные eventKey записей `confirmed + completed_action` внутри критерия. Каждый eventKey даёт единицу. `confirmedCount` хранит фактическое число; UI ограничивает длину полосы targetCount и показывает точное число. Общий «процент готовности к собеседованию» не вычисляем. `nextStep` в первой версии может быть правилом «выполнить следующий незакрытый критерий», kind = rule; не выдавать это за результат модели. При полной цели nextStep = null.

## Ошибки и провайдеры

Общий формат: `{ "error": { "code": "goal_changed", "message": "Цель изменилась, повторите обработку" } }`. Не отдавать stack trace, ключ, upstream headers или полный ответ провайдера клиенту.

- 400 invalid_request; 403 forbidden; 404 not_found.
- 409 goal_unconfirmed / goal_changed / goal_locked / revision_conflict.
- 413 file_too_large; 415 unsupported_media_type; 422 invalid_evidence.
- 503 provider_unconfigured / stt_unconfigured; 504 provider_timeout; 502 provider_failed.

Настройки интегратора: `HACKATHON_LLM_PROTOCOL`, `HACKATHON_LLM_BASE_URL`, `HACKATHON_LLM_MODEL`, `HACKATHON_LLM_API_KEY`; опционально `HACKATHON_STT_BASE_URL`, `HACKATHON_STT_MODEL`, `HACKATHON_STT_API_KEY`. Процесс должен получить их через environment; не предполагать, что `.env` автоматически загружается. `baseUrl` — базовый URL API без конечного метода; адаптер добавляет путь своего протокола. Точный формат согласовать с владельцем реального endpoint до вызовов.

Основной провайдер — кастомный Gemini, резерв — OpenRouter. Нельзя угадывать model ID, отправлять данные резервному провайдеру автоматически или заявлять о проверенной аудиоподдержке. Для первой проверки использовать короткий синтетический текст. Текст источника — данные, его команды не исполняются; extraction не получает инструменты записи/сети.

## Контрольный пример для всех

Готовое состояние интерфейса: [demo-fixture.json](demo-fixture.json). Данные синтетические; fixture отражает этап после подтверждения отправки резюме и первого интервью. Использовать только для разработки и тестов, не подменять им живой provider response.

Цель `demo`: «Подготовиться к ML-собеседованию»; критерии `cv` (1 отправка), `mock` (2 интервью), `feedback` (1 исправление по обратной связи). Дедлайн `2026-11-01T17:30:00+03:00`.

1. «Завтра хочу отправить резюме.» → intention, нулевой прогресс.
2. «Резюме получил, приглашаем на интервью.» → completed_action/cv; до подтверждения 0/1, после 1/1.
3. Повтор источника 2 → duplicate = true, те же IDs, счётчик прежний.
4. Источник «Провели первое пробное интервью.» → completed_action/mock; после подтверждения 1/2.
5. Отклонить evidence из пункта 2 → cv 0/1; после перезапуска результат тот же.
