# Реальное аудио на общем кандидате — PASS

Проверен **ef360ae0627e35ddfe615143b5409690ac222ed8** (`origin/codex/integration-ui`), а не только отдельная ветка B. Проверка выполнена в отдельном detached checkout `../integration-check`, без tracked-изменений исходников или конфигурации кандидата. Время: 25 октября 2026, **14:38:07–14:38:59 МСК**. Итог — **7 PASS, 0 FAIL, без повторных попыток**.

Артефакты: [машиночитаемый результат](common-candidate-artifacts/results.json), [точная цитата](common-candidate-artifacts/01-real-transcript-exact-quote.png), [подтверждение и прогресс](common-candidate-artifacts/02-manually-confirmed-server-progress.png), [состояние после reload](common-candidate-artifacts/03-duplicate-and-reload.png). Все три изображения просмотрены. [Копия фактически использованного runner](common-candidate-browser-audio.mjs) имеет SHA-256 `fb20e14c782f17eed3814dc8235f9f55356e9b5cf970a56c6cad2ccad9a47cbc`; для повтора её следует поместить в `docs/evaluation/` отдельного checkout проверяемого SHA и направить `AUDIO_SMOKE_OUTPUT` в новый каталог.

## Подтверждено

1. Чистая обычная регистрация в `PAA_AUTH_MODE=local`, выход и повторный вход через UI с русскими названиями кнопок.
2. Создание и подтверждение цели `demo`; серверные счётчики `cv=0`, `mock=0`, `feedback=0`.
3. Загрузка 50,6-секундного синтетического `demo-audio.wav` через UI: настоящий STT `base/ru/int8/CPU1` на тестовом сервере и настоящий Gemini `gemini-3.8-flash` через настроенный OpenAI-compatible provider. Три предложения evidence, все цитаты — точные срезы реальной расшифровки, таймкоды связаны с STT-сегментами. Без ручного подтверждения прогресс остался нулевым.
4. Открытие источника из карточки и точная выделенная цитата `Сегодня я отправил резюме на стажировку.`. Явное подтверждение через UI изменило серверный прогресс на `cv=1`, `mock=0`, `feedback=0`; evidence ID включён в прогресс, UI показывает `1 / 1`.
5. Повтор тех же audio bytes с другим названием вернул `duplicate: true`, прежние source/hash/evidence IDs, всего три evidence и прежний прогресс.
6. Reload сохранил вход, цель, evidence и подтверждённый прогресс.

Ни auth, ни STT, ни LLM не подменялись. Runner пассивно читает clone настоящего audio fetch response для совместимости установленного Chromium1243 с Playwright, ожидающим1228. Все изменения предметного состояния сделаны через UI; дополнительные проверки сервера — только authenticated GET из браузера. Cookies, tokens, credentials, заголовки, console dump и trace не сохранялись.

## Среда и воспроизведение

Backend TypeScript build кандидата на Windows `npm run build` — PASS. Backend/frontend manifests и locks совпадают с установленной средой B; зависимости подключены junctions, установка не выполнялась. Gateway `127.0.0.1:18788`, Vite из исходников кандидата `127.0.0.1:16073`, отдельный SSH loopback `19000` к существующему STT B. Runtime memory и secrets изолированы в ignored `.runtime/common-candidate/` нового checkout. `MCP_SERVERS_FILE` указывает на отдельный пустой `{"servers":[]}`: данный goal/audio pipeline не вызывает MCP. Defaults LLM30s и STT120s не переопределялись. Ключи передавались только gateway через private subprocess environment, не Vite или runner.

Использован установленный браузер через `AUDIO_SMOKE_EXECUTABLE` и отдельный `AUDIO_SMOKE_OUTPUT`; затем `node docs/evaluation/browser-audio-common.mjs` из checkout кандидата. Runtime не является публикуемым способом развёртывания. После проверки собственные gateway, Vite и SSH tunnel остановлены; удалённый STT сохранён для команды.

## Пределы результата

Это доказательство указанного сквозного аудиосценария на общем SHA, не всей MVP-приёмки. Restart процесса, backup/restore, production packaging, мобильная проверка и все отрицательные сценарии здесь не проверялись. Браузер доказывает сохранение идентичности дубля и отсутствие роста прогресса, но число вызовов STT/LLM остаётся `NOT_OBSERVABLE_FROM_BROWSER` без отдельной телеметрии. Распознавание base/CPU допускает ошибки слов: в реальном transcript есть, например, `Рекрутир` и `промашенные обучения`; исходные результаты сохранены без исправлений. Проверяемое подтверждённое действие распознано и процитировано точно.
