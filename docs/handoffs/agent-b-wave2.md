# Agent B, wave 2 — текущая передача

Состояние: RUNNING, 25 октября 2026. Полный audio MVP пока не принят.

## База и границы

- Ветка `codex/audio-quality`, base `92cb8bc6ecacf1bf8f1bb1f3fbe62d195db3aa5a` из origin/codex/integration-ui.
- Первая волна сохранена, extraction pipeline не переписан. Изменены prompt для воспроизведённого future/intention случая и новый локальный transcribe adapter.
- Только context, services/stt, собственные evaluation/demo/status/handoff. Gateway/UI/shared contracts/корневые manifests не меняются.

## Передача C/A: STT wiring

Существующий `createContextProviders(config)` теперь подключает реальный `transcribe`, если передано:

```ts
stt: { baseUrl: "http://127.0.0.1:19000", model: "base", apiKey: serverOnlyToken }
```

Отдельный export из `features/context/providers.ts`:

```ts
createLocalSttTranscriber(config?: {
  baseUrl: string; model: string; apiKey: string;
}, timeoutMs?: number): NonNullable<ContextProviders["transcribe"]>
```

Без явной конфигурации, с неподдержанной model или при недоступном endpoint: 503 stt_unconfigured. Raw POST `/transcribe`, Content-Type WAV/MP3/M4A/WebM, максимум10МиБ; ответ `{text,segments:[{startMs,endMs,textStart,textEnd}]}`. Quote и UTF16 validation сохранены. Raw audio не пишется сервисом на диск. Готовый audio corpus в Git синтетический и служит входным примером, не пользовательским хранилищем.

Gateway уже читает `HACKATHON_STT_BASE_URL`, `HACKATHON_STT_MODEL`, `HACKATHON_STT_API_KEY`; его helper требует непустой key. Никаких новых config/dependency на стороне Node не нужно. При незаданном общем timeout LLM остаётся30с, STT120с. Общий `HACKATHON_LLM_TIMEOUT_MS`, если задан, сейчас применяется и к STT.

## Текущее состояние сервера

- Своя среда `/srv/ryadom-hackathon/agent-b`, STT loopback19000.
- 1 CPU, RAM1967МиБ, available около1590МиБ до запуска, диск25ГиБ свободно.
- Python3.12.3 и flock были установлены, faster-whisper/uv/Docker/ffmpeg не было.
- uv0.13.5 подготовлен только в `agent-b/tools` из официального PyPI wheel с проверкой SHA256; installer astral.sh получил403. Системные настройки не менялись.
- faster-whisper1.2.1 и base CPU/int8 реально установлены в project .venv; модель загружена под shared heavy.lock. Health возвращает ready/base/ru.
- Первый live WAV запрос обнаружил несовместимость PyAV19 с `metadata_errors`; defect воспроизведён прямым вызовом. Исправляется bounded decoder и pin PyAV<19. До повторного live результата аудио остаётся NOT_READY.
- Сервис защищён случайным приватным token. Разрешена передача C/A **только** STT_AUTH_TOKEN из private файла `/srv/ryadom-hackathon/agent-b/private/stt.env` в их серверное environment; не печатать значение и не копировать в Git. Это явная передача конфигурации B, не разрешение читать другие private/env файлы.
- Все установки/загрузка/реальные STT-прогоны выполняются под `/srv/ryadom-hackathon/coord/heavy.lock`. Сервис получит optional STT_HEAVY_LOCK для автоматического соблюдения lock при UI запросах.

## Качество extraction

`docs/evaluation/acceptance-corpus.json`:10 случаев (9live,1validation), плюс7 parser границ.

- Первый живой прогон:16/17,9LLM calls; future-date rejected. Контрольный повтор future-date вернул пустой список, что также не соответствует ожидаемому intention.
- Prompt теперь явно сохраняет будущие действия как intention и предпочитает quote-only для уникальных цитат; deterministic offsets по-прежнему вычисляет и проверяет код.
- Повторный живой прогон после изменения: **17/17 PASS**, включая9реальных Gemini вызовов; файлы `live-results-initial.json` и `live-results.json` сохраняют различие.
- Parser-only:8/8 PASS. Это приёмочный синтетический набор, не общая оценка качества модели.
- `npm --prefix app/builds/typescript test -- features/context`:173PASS; backend build PASS.

Детали expected/actual/criterion/eventType/quote/latency/module hashes — в JSON отчётах. Ключи, provider headers и полный upstream response не сохранены. Отчёты записывают текущий HEAD и отдельные module hashes; до первого commit HEAD остаётся base, проверяемый working diff будет зафиксирован отдельным SHA.

## Корпус и следующий gate

Пять synthetic text источников + `demo-audio.wav` (Windows Irina TTS,50.626875с,16кГц mono16bit). Микрофон и личные записи не использовались. Настоящая расшифровка/метрики появятся только после успешного STT.

Следующий обязательный gate: audio через обычную авторизацию/UI → реальный STT → Gemini evidence → исходная quote → ручное confirm → серверный progress на конкретном интегрированном SHA. Health/отдельный HTTP запрос этот gate не закрывает. Перед финальной передачей документ будет дополнен SHA, командами запуска, метриками, ограничениями и результатом UI gate.
