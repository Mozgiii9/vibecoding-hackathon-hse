# Открытые пункты выпуска

Base: `484c396e71b3fbfe2ff65c04f6260e1899aa6bd1`, 25 октября 2026.

## Блокирует полную приёмку

- Реальное STT в base не реализовано: `createContextProviders().transcribe` возвращает `stt_unconfigured`. Наличие audio UI/route и fake audio SourceDraft не закрывает требование. Владелец B, wiring C; A проверяет после передачи.
- Общий кандидат C ещё не принят. Проверки отдельной qa-release ветки не заменяют повтор полного пути на интегрированном SHA.
- Локальный живой Gemini UI прошёл повторный clean сценарий, production server source launch находится в работе.
- Первый live UI прогон: намерение успешно, выполненное действие вернуло `provider_failed`; пользователь увидел ошибку без частичного прогресса. Точная причина ответа не диагностирована. Второй полный проход прошёл без fallback. Это ограничение надёжности живого provider/model response; не скрыто успешным повтором. При защите доступен повтор обработки и резервная реальная запись.

## Baseline и среда

- `memory/starter-pack-draft3-layout.test.ts` падает с 19 ошибками upstream шаблонов: optional overlays, placement rules, fitness starting-position adaptation. Вне области A; исправление/решение передаётся C. Воспроизведение: cwd `app/builds/typescript`, `npm test -- memory/starter-pack-draft3-layout.test.ts`.
- Первый полный backend run: 411 PASS, 3 FAIL / 414. Два `desktop/bridge.test.ts` падали с `listen EPERM 127.0.0.1` из-за sandbox; отдельный разрешённый rerun даёт 20 PASS. Полный suite не назван зелёным.
- Node и npm не были в обычном PATH локальной машины. Локально применён bundled Node v24.22.1 и временный npm 10.9.4. Сервер: scoped Node v22.21.1, без глобальных обновлений.
- Docker отсутствует локально и на тестовом сервере. Docker packaging будет проверено статически; фактический запуск необходимо отмечать отдельно. Основной доступный вариант проверки — source build без Docker.
- Frontend production build предупреждает о JS bundle >500 kB. Сборка успешна.

## Восстановление

- Release backup намеренно исключает secrets/vault/master-key, `.env*`, `.git`, exports и backup archives. Он сохраняет доменную память, включая `hackathon/state.json`, и auth-state в preferences, но не переносит ключи провайдера/секретное хранилище. Ключи подключаются отдельным private env. Не использовать memory export API с реальными секретами для публичной передачи.
- Для согласованной multi-file копии перед backup остановить только собственный gateway/launcher. Скрипт backup сам процессы не останавливает.
- Restore принимает только новую synthetic копию; существующая пользовательская память не перезаписывается. Нужен запуск отдельной среды на восстановленном root.
- Upstream Docker backup/restore не использовать: они ссылаются на общие `braindrive_memory`/`braindrive_secrets`.
