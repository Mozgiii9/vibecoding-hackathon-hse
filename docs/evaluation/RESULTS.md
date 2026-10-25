# Проверенные результаты B, 25 октября 2026

Это приёмка конкретного синтетического корпуса, а не общая оценка качества Gemini или Whisper.

## Текст

Модель: `gemini-3.8-flash`, подтверждённый OpenAI-compatible chat completions. Ключ передавался только через process environment.

- `live-results-initial.json`: 9 настоящих запросов, 8 parser/validation случаев; 16/17 PASS. Future-date был отклонён. Контрольный повтор вернул пустой массив вместо intention.
- Уточнение prompt сохраняет планы/будущее время как intention и предпочитает quote-only для уникальной цитаты. Проверка точного вхождения и неоднозначности не ослаблялась.
- `live-results.json`: 9 настоящих запросов + 8 parser/validation = **17/17 PASS**. Есть expected/actual criterionId, eventType, quote и точные offsets.
- `parser-results.json`: **8/8 PASS**, сетевых вызовов 0. Не выдавать parser cases за проверку качества модели.
- Report sourceSha первоначально равен base92cb8bc: прогон происходил до первого commit. Хеши фактически импортированных built modules записаны отдельно. Prompt/provider implementation этого прогона зафиксированы в a14d4fb; последующее ужесточение blank title/zero duration — в7d5c109.

## Реальное аудио

`docs/demo/sources/demo-audio.wav` — синтетическая русская озвучка Microsoft Irina Desktop, 50.626875с, WAV PCM16, 16кГц, mono, 1 620 106байт. Микрофон, личные разговоры и готовый provider response не использовались.

Запись реально обработана faster-whisper1.2.1, base, ru, CPU/int8,1thread на выделенном сервере с1CPU/1967МиБRAM. Первый успешный запрос занял15 641мс; повтор с загруженной моделью —11 973мс. После первого прогона RSS процесса297484КиБ; available RAM1341МиБ. Запись не сохранялась сервисом: bytes пришли через SSH stdin/HTTP, декодирование и inference выполнялись в памяти под shared heavy.lock.

Фактический результат: `demo-audio-transcript.json`,9реальных временных сегментов от0до50380мс. `audio-metrics.json` хранит параметры первого прогона. `stt-runtime-facts.json` подтверждает PyAV18.1.0, наличие PCM/MP3/AAC/Opus decoder и побайтное совпадение6Python source files на сервере с7d5c109. **Живой сквозной формат — WAV**; остальные MIME приняты HTTP/unit tests и декодеры присутствуют, отдельный live проход каждого контейнера не заявляется.

Первый live запрос обнаружил TypeError в faster-whisper decode_audio с PyAV19 (`metadata_errors` удалён). Исправление: собственный bounded decoder, передача mono NumPy в модель, lock PyAV18.1. Decode прекращается после120с и ограничивает накопленный PCM7.68МБ; raw recordings на диск не пишутся.

### Ground truth озвучки

> Это учебная запись для демонстрации помощника. Сегодня я отправил резюме на стажировку. Рекрутер подтвердил, что получил резюме. Сегодня мы также провели первое пробное интервью с другом. Во время интервью я ответил на вопросы про машинное обучение. После встречи я записал замечания, но правки по обратной связи пока не внёс. Завтра хочу повторить сложные темы и подготовить исправления. Второе пробное интервью ещё не проводили. Мне нужно сначала разобрать ошибки, а затем договориться о новой встрече.

STT не идеален: «Рекрутер» распознан как «Рекрутир», «первое пробное интервью» как «первые пробные интервью», «про машинное обучение» как «промашенные обучения». Сохранён настоящий вывод, он не исправлялся под эталон. Цитата относится к расшифровке; это не доказательство точности распознавания или факта во внешнем мире. Пользователь должен проверить событие перед подтверждением.

## Браузерный gate

`browser-audio-artifacts/results.json`: **PASS**, чистый tracked tree, SHA `a6291e7024089342cd2d4b41d86539a0eb75de06`,14:33:18–14:33:48МСК. Продуктовый контекст/STT-код —7d5c109; последующие коммиты меняли только проверочный runner.

Действия выполнялись через настоящий UI, без route mocks/API writes/auth bypass:

1. Чистая регистрация владельца, выход, обычный вход.
2. Подтверждение цели и3критериев через форму; серверные счётчики0/0/0.
3. Загрузка WAV через file input → реальный STT → реальный Gemini → proposed evidence с точными цитатами. Прогресс остаётся0/0/0.
4. «Посмотреть источник» → точный mark в расшифровке и настоящий timestamp → ручной клик «Подтвердить» → PATCH и серверный прогресс cv1/mock0/feedback0.
5. Повтор исходных audio bytes с другим title → duplicate=true, прежние source/hash/evidence IDs, число evidence и прогресс неизменны.
6. Reload сохранил auth, цель, evidence и прогресс.

Скриншоты01/02/03 сохраняют цитату, подтверждение и reload. В ранних попытках Chromium1243 с Playwright, ожидающим1228, ломал CDP response.json после фактически успешного backend commit. Runner читает clone настоящего fetch response в странице, не заменяя original request/response; auth payload/headers не наблюдаются. Ошибка не скрыта: ранний безопасный FAIL report сохранён в `browser-audio-initial`.

Отдельная неуспешная попытка при занятом heavy.lock получила HTTP502 от gateway (STT503stt_busy). В её реальном state.json проверены1goal/0sources/0evidence и нулевой прогресс. Runner также проверяет видимую ошибку и неизменные evidence/progress перед ограниченным повтором через ту же форму. Это поведение не означает автоматический provider fallback.

Общий кандидат C `ef360ae` независимо проверен: **7PASS/0FAIL/без retries**, trackedTreeDirty=false,14:38:07–14:38:59МСК. Отдельный checkout, русский UIвход, настоящий audio pipeline, ручное подтверждение, серверный cv1, дубль и reload. Артефакты — `common-candidate-*`; его результат не подменён отчётом ветки B.

## Автоматические проверки

```sh
npm --prefix app/builds/typescript test -- features/context features/goals gateway/hackathon
# 283 PASS, 11 test files
npm --prefix app/builds/typescript run build
# PASS
```

STT:17unittest PASS, ruff PASS, strict mypy PASS (8files). На локальной dev `.venv` тесты выполнялись с PYTHONPATH=src; серверный uv sync устанавливает editable project и использует project .venv. Прямой запуск unittest без установки проекта/PYTHONPATH локально был NOT_READY, а не зелёной проверкой. Документированные uv sync/run команды — основной путь установки.

## Ограничения

- Только1активное inference; при чужой тяжёлой операции сервис возвращает busy вместо конкуренции за CPU.
- Клиентский timeout/abort не убивает уже начавшийся native inference. Он завершится под lock; decode bounded120с, но hard process deadline в MVP нет. Ingestion после отмены не коммитит Source.
- Silence/нет речи не создаёт успешный пустой источник. STT server может вернуть пустой text, gateway отвергает его.
- Смысловые дубли разных пересказов автоматически не решены. Повтор одинаковых bytes проверен отдельно.
- Browser reload не доказывает restart/backup/restore; это приёмка A. Отсутствие второго STT вызова не измеряется браузером напрямую: ID/progress gate дополняется ранней дедупликацией в unit tests.
- Ни OpenRouter, ни локальный Whisper на другой машине не подменяли выбранный путь.
