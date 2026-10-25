# Ограничения проверенного выпуска

Принятый общий runtime SHA: `ef360ae0627e35ddfe615143b5409690ac222ed8`,25 октября 2026. Подробные доказательства: [ACCEPTANCE](ACCEPTANCE.md).

## Реальная модель и аудиопроверка

- Audio functional acceptance — **DIAGNOSTIC_RECOVERY_PASS**. Первый UI audio FAIL не создал source/evidence/progress. Единственный upload retry вернул HTTP200 и свежий audio source, но Chrome inspector снова потерял response body. Отдельное продолжение через UI без upload проверило transcript/3quotes/timecodes/confirm/progress/reload; true restart и новая restored копия PASS. Оба ранних FAIL сохранены.
- Точная причина первого audio provider/UI сбоя не установлена. Отдельная non-mutating STT/Gemini диагностика PASS не объясняет его задним числом. Ранее local live и C4ac initial main имели provider_failed; повторные успехи не доказывают устранение временной нестабильности endpoint/model response.
- Future harness читает clone фактического fetch response в странице, сохраняя original response; local>1MiB regression и typecheck PASS. Новый fresh live audio E2E с этим reader NOT_RUN. В принятом audio свежесть подтверждена source hash/createdAt/new IDs, не неисполненным duplicate=false assertion.
- STT base/ru ошибается в словах, его transcript не исправляется под эталон. Цитата показывает основание из распознанного текста; перед confirm пользователь проверяет событие. Таймкоды только из реальных STT segments.
- Один активный native inference. При занятом shared heavy.lock/concurrent request STT возвращает busy; gateway не коммитит partial source. HTTP timeout/abort не убивает уже начатый native inference: он завершится под lock. Decode bounded120 с, hard process deadline отсутствует. Внешний flock вокруг STT HTTP caller запрещён: inference lock берёт сервис.

## Сборка, baseline и среда

- Полный исторический backend suite:411PASS/3FAIL из 414. Starter-pack lint падает с 19 upstream template issues. Два sandbox loopbackEPERM закрыты отдельным разрешённым bridge rerun20PASS; полный suite не назван зелёным. Текущий ef focused backend327/327 PASS.
- Docker Engine отсутствует: Docker build/runtime/container→host STT topology **NOT_RUN**. Рабочий принятый вариант — clean source-build нашего SHA. Docker packaging проверен статически и regression tests.
- Frontend production bundle>500kB warning; build successful.
- Первый source release f0b849b FAIL из-за отсутствующего docs/contracts fixture; сохранён без патча. Исправление f93536d и optional export7f79d25 включены в C f875; ef построен полным архивом с актуальным driver без изменения source files.
- Git SSH иногда закрывает соединение до auth. Общие C Git objects получены read-only через API и проверены hashes; origin tracking ref может отставать. Задержка наблюдения SSH не означает остановку процесса: проверять PID/READY/health перед новым запуском.

## Сохранность и демонстрация

- Backup включает domain state и разрешённую память/auth preferences, исключает secret store/vault/master key/env/.git/exports/backup archives. Для decrypt/provider нужны отдельные приватные secrets/master key/env. Их нельзя включать в публичные материалы.
- Для согласованной multi-file копии сначала остановить только свой supervisor. Restore только в новый synthetic root; original память никогда не перезаписывается. Использование upstream backup/restore с общими braindrive_* volumes для этой проверки запрещено.
- Текущий A restored-ef runtime проверен; original full-ef и старые candidates сохранены/остановлены. Перед управлением читать актуальный runtime.json, historical PID не использовать автоматически.
- C имеет 4 слайда/сценарий и опубликованный 38 с text WebM COMPLETED_TEXT. Полный просмотр A, трёхминутный резервный text+audio показ и человеческие репетиции **NOT_RUN**. Это отдельный остаток комплекта защиты C; A source/text/audio/restart/restore приёмка завершена.
