# Agent B — контекст и модели

Обновлено: 25 октября 2026, 13:13 МСК. Ветка: `codex/context-ingest`.

## Коммиты и статус

- Общая стартовая база всех трёх веток при клонировании: `c67fe77fd2f40237a96b8a0390ff676536c691fc`.
- Первый компилируемый модуль, опубликован до получения настроек: `59e9f84c15d3d22bc19f26af4279bbb99c234c88`.
- Реализация с подтверждённым Gemini adapter и каноническими hash: `6d90000372bf3b81144e5efb4be890a7799fede4`.
- Этот handoff идёт отдельным документирующим коммитом после реализации. Его SHA доступен через `git log -1 -- docs/handoffs/agent-b.md`; собственный SHA невозможно включить в его содержимое.
- Менялись только `app/builds/typescript/features/context/**` и этот handoff. Gateway, contracts, goals-core, frontend, manifests и lockfiles не изменялись. Merge в main не выполнялся.

Текстовый модуль готов к подключению интегратором; реальный LLM проверен. Полный пользовательский проход через реальный gateway/core/UI этим заданием не проверен: реализации A/C не подмешивались в ветку B.

## Экспорты и подключение

`app/builds/typescript/features/context/index.ts`:

```ts
createContextProviders(config: {
  protocol?: "openai-compatible" | "gemini-native";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  stt?: { baseUrl: string; model: string; apiKey: string };
}): ContextProviders

registerContextRoutes(app: FastifyInstance, deps: {
  store: ContextStore;
  providers: ContextProviders;
}): Promise<void>
```

Интегратор передаёт store от A и серверные настройки провайдера; factory сама environment/.env не читает. Регистрация должна идти после существующих gateway auth hooks. Реальный gateway заполняет `request.authContext` в `preHandler`, поэтому проверки `memory_access` находятся в route `preHandler`, после inherited auth. Проверены 403 и сохранение существующего gateway 401.

Маршруты:

- `POST /context/import`: JSON `goalId`, `title`, `text`, необязательный nullable `capturedAt`; непосредственный `ImportResult`, без обёртки result.
- `POST /context/audio?goalId=...&title=...&capturedAt=...`: raw bytes, MIME wav/mpeg/mp4/webm; buffer parser изолирован в дочернем plugin. Лимит 10 МиБ только для аудиомаршрута. При текущей конфигурации новый аудиоисточник возвращает 503 `stt_unconfigured`.

`ingestion.ts` дополнительно экспортирует `importText`, `importAudio`, `contentHash`. `extraction.ts` содержит подготовку system/user сообщений и строгий разбор JSON-массива; `providers.ts` — ограниченный JSON transport и подтверждённый протокол. Test-store подключается только тестами, ни один рабочий экспорт не использует fake.

## Подтверждённые настройки

Владелец передал их в этом чате после первого коммита:

| Параметр | Значение / поведение |
|---|---|
| Основной провайдер | Пользовательский Gemini proxy |
| Protocol | `openai-compatible`, `chat_completions` |
| Base URL | `https://llm.mxr-edge.xyz/v1` |
| Полный путь | `https://llm.mxr-edge.xyz/v1/chat/completions` |
| Проверенная модель | `gemini-3.8-flash` |
| Авторизация | Серверный Bearer key из `config.apiKey`; значение здесь не сохраняется |
| Таймаут | По умолчанию 30 секунд, на fetch и чтение body |
| Ответ | До 256 КиБ; JSON-массив внутри `choices[0].message.content` |
| Резерв | OpenRouter, только после явного выбора владельцем; автоматического fallback нет |
| STT | Отдельного HTTP endpoint нет; по словам владельца имеется локальный faster-whisper, модель base, язык ru |

Адаптер не задаёт model/URL по умолчанию, не передаёт tools, не использует неизвестные расширения response_format, не выполняет retries и redirects. Неполные настройки, неподдерживаемый `gemini-native`, URL с credentials/query/hash или не HTTP(S) → `provider_unconfigured`. Ответ с обрезанным `finish_reason=length`, неверным JSON или испорченными evidence → `provider_failed`.

Переменные интегратора: `HACKATHON_LLM_PROTOCOL`, `HACKATHON_LLM_BASE_URL`, `HACKATHON_LLM_MODEL`, `HACKATHON_LLM_API_KEY`. Их нужно прочитать в gateway и передать в factory. Ключ не записан в исходники, fixtures, handoff или .env; в live smoke был только в environment отдельного процесса и удалён после проверки.

HTTP STT не реализован: даже заполненный `config.stt` пока честно возвращает `stt_unconfigured`. Наличие локального faster-whisper не означает готовый порт/протокол или разрешение добавить Python backend. Никакие локальные модели, драйверы и Python-зависимости не устанавливались. Контракт уже позволяет интегратору передать отдельно согласованный `ContextProviders.transcribe`; на тестовом адаптере проверен полный audio pipeline.

## Инварианты

- Текст неизменен после приёма, до 50 000 UTF-16 units; пробельный текст отклоняется. Title до 200. CapturedAt — ISO с timezone либо null.
- Подтверждённый snapshot цели берётся перед извлечением. Повтор hash проверяется до LLM/STT и возвращает текущие ID и пользовательские статусы.
- Только core пишет состояние через `commitImport`, вместе с исходной revision. Ошибка провайдера или проверки не вызывает commit. `goal_changed`/прочие FeatureError от core сохраняют контрактные коды.
- Критерий должен присутствовать в snapshot; quote точно совпадает с `text.slice(start,end)`. Если offsets не даны, допустимо только единственное точное вхождение. Частичные offsets и неоднозначные цитаты отклоняются целиком.
- Все eventType сохраняются предложениями; B не задаёт ID, status, eventKey и не подтверждает прогресс. Дедупликация предложений/конфликтов и гонок commit — обязанность A по контракту.
- Аудио хранится только как text/segments через core, raw bytes не сохраняются. Таймкоды берутся из реально переданных segments, при отсутствии покрытия null. Перекрывающиеся временные интервалы не обрезают границы общей цитаты. Длительность две минуты сервер не обещает проверять.
- Source передаётся JSON-данными отдельно от system; никакие инструкции из источника не исполняются. Тесты prompt injection подтверждают структуру prompt и проверку ответа, а не универсальную устойчивость модели к атакам.
- Ошибки не раскрывают ключ, raw provider response, stack или upstream headers. Непредвиденные ошибки маршрута нормализуются в generic 502 `provider_failed`, поскольку контракт не содержит `internal_error`.

### Внимание интегратору: hash-разделитель

В API_V1 разделитель записан с двойным экранированием, что допускает прочтение как literal backslash + zero. Проверка показала: **все три канонических contentHash из demo-fixture вычислены с NUL, байт 0x00**. Финальная реализация B использует NUL и тестирует все три fixture-вектора. Просьба A использовать тот же алгоритм; C уточнить написание разделителя в API_V1. Shared contract B не менял.

Пример: hash текста `Завтра хочу отправить резюме.` равен `3573218a765f49e311367b524507171b5cb2f6e9a7ca75bde18ec4172314f1fe` и совпадает с fixture. В первом skeleton-коммите был буквальный slash-zero; для интеграции использовать финальный implementation SHA выше.

## Проверки и результаты

25 октября, 13:12–13:13 МСК, Windows / Node / npm из рабочего окружения:

```bash
npm --prefix app/builds/typescript test -- features/context
# 5 файлов, 130 тестов passed

npm --prefix app/builds/typescript run build
# passed

git diff --cached --check
# passed перед каждым коммитом
```

Настроенного `core.hooksPath` и активного pre-commit hook нет, только sample hooks; обход hooks не использовался. Установка `npm ci --no-audit --no-fund` прошла без изменения manifest/lock. npm предупредил о неподтверждённом install script esbuild; сборка и Vitest фактически работают, настройки approvals не менялись.

Покрыто: валидный импорт, все четыре eventType, invalid input/JSON/quotes/criterion/offsets/status, повтор источника, текущие статусы, revision conflict и успешный retry, кириллица/emoji/UTF-16, неизвестность/неоднозначная цитата, размер текста/аудио, MIME, изоляция parser, отказ auth, ошибки без частичного commit, STT transcript/segments, отсутствие выдуманных таймкодов, сетевой сбой, 429/500, таймаут fetch/response body, AbortSignal, размер ответа и отсутствие fallback.

### Реальный LLM smoke — passed

Через финальный `createContextProviders`, модель `gemini-3.8-flash`, синтетические источники из общего fixture; без записи состояния:

| Источник | Реальный результат | Время | Проверка цитаты |
|---|---|---|---|
| `Завтра хочу отправить резюме.` | `intention`, criterion `cv` | 6554 мс | exact match, offsets 0..29 |
| `Резюме получил, приглашаем на интервью.` | `completed_action`, criterion `cv` | 6512 мс | exact match, offsets 0..14 |
| `Провели первое пробное интервью.` | `completed_action`, criterion `mock` | 7571 мс | exact match, offsets 0..32 |

Это три проверенных ответа живой модели, а не доказательство качества на любых источниках. Реальный STT, OpenRouter, full gateway/core/UI, сохранение после рестарта и настоящая пользовательская авторизация в полном приложении не проверялись. Auth route tests воспроизводят порядок gateway hooks с подготовленным authContext.

## Примеры после подключения gateway интегратором

Сначала создать и подтвердить `demo` через routes A. Файл `synthetic-context.json` для запроса содержит:

```json
{"goalId":"demo","title":"Сообщение рекрутера","text":"Резюме получил, приглашаем на интервью.","capturedAt":"2026-10-25T13:30:00+03:00"}
```

Существующая авторизация приложения обязательна; пример использует уже выданный access token из environment, не LLM key:

```bash
curl -X POST "$GATEWAY_URL/context/import" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" --data-binary @synthetic-context.json

curl -X POST "$GATEWAY_URL/context/audio?goalId=demo&title=Interview" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: audio/wav" --data-binary @synthetic-demo.wav
# Сейчас ожидается 503 stt_unconfigured.
```

`GATEWAY_URL` — адрес gateway, подтверждённый интегратором; в браузере действует существующий `/api` proxy. Команды выше — инструкции интеграционной проверки, не утверждение о проверенном развёрнутом сервере.
