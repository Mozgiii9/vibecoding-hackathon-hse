# Лендинг «Рядом»: передача

Дата: 25 октября 2026, МСК. Ветка: `codex/landing`. Worktree: `.worktrees/landing`. Base SHA: `ef360ae0627e35ddfe615143b5409690ac222ed8`, актуальный `origin/codex/integration-ui` на старте в 14:35. Первый проверенный срез опубликован в 14:49 МСК: `86340cd753f9aa41f1d610e5431df092ae359402` (`Add standalone Ryadom landing and verified demo`).

## Результат первого среза

- Отдельный buildless HTML/CSS/JS сайт, без новых зависимостей и backend.
- Тёплая тёмная палитра текущего интерфейса, нативная иллюстрация с явной подписью synthetic.
- Детерминированная демонстрация: намерение 0 → действие proposed 0 → confirm 1 → duplicate 1 → reject 0, reset, три критерия. Модель не вызывается.
- Публичный config `landing/config.js`. Без подтверждённого URL CTA показывает «Ссылка на демо готовится». Локальные и URL с credentials/query не активируются; разрешён только публичный HTTP(S) DNS/IPv4.
- Title/description, SVG favicon, готовая PNG Open Graph 1200×630 и редактируемый SVG-исходник.
- Документация запуска/публикации, отдельный allowlist static server и шаблон собственного systemd service.
- Атрибуция BrainDrive MIT; цитата не выдаётся за независимую проверку истинности.

## Выполненные проверки

Headless Chrome, 25 октября, 14:47–14:57 МСК. Никаких видимых окон/захвата фокуса.

| Проверка | Результат |
| --- | --- |
| Desktop/mobile: 320, 390, 760, 1024, 1440, 1920 px | PASS, scrollWidth равен viewport |
| Демонстрация мышью на 390 и клавиатурой на desktop | PASS, 0 → 0 → 1 → 1 → 0 |
| Перенос фокуса при смене/скрытии кнопки | PASS, Next → Reject → Reset → Next |
| Skip link и видимый focus | PASS, outline 3 px, ссылка видима |
| Якоря и native details | PASS |
| Reduced motion | PASS, scroll-behavior auto, transition 0s |
| Console/page errors | 0 |
| Битые ресурсы, внешние запросы при просмотре | 0 |
| URL guards, 17 ошибочных адресов / 2 публичных протокола | PASS, без перехода на внешние адреса |
| Без JavaScript | PASS, виден статический сценарий и нет неработающих кнопок |
| OG PNG HTTP/content type/размер | PASS, image/png, 1200×630 |
| Синтаксис app/config/server JavaScript | PASS, node --check |
| Локальный запуск | PASS, standalone Node server на loopback |
| Независимый review | Исправлены URL guard и слишком широкая формулировка о restart |

Артефакты: `docs/landing/evidence/browser-report.json`, `desktop.png`, `mobile.png`, `mobile-fold.png`. Это снимки лендинга, не продуктовые screenshots. Повторить: инструкция в `DEPLOYMENT.md`, runner `run-checks.mjs`.

Pre-commit: настроен `.githooks/pre-commit`; должен запускаться при каждом коммите. Область Git изменений ограничена `landing/**` и `docs/landing/**`. Приложение, shared contracts, manifests/locks и чужая работа не меняются.

## Публикация и зависимости

**Опубликовано:** http://77.239.111.64/ . Первый deployed SHA: `6b7d1bb6b33149d3f2c18650a1850d04428ec898`. Архив SHA256: `4363f9e9debeed772d241aa95f5e503282e361937c5078928378987351991887`. Внешний HTTP 200 и полный headless desktop/mobile PASS: 14:57 МСК. Публичные отчёты: `evidence/public-browser-report.json`, `public-config-report.json`, `public-http-report.json`.

Собственная среда: `/srv/ryadom-hackathon/landing`; service `ryadom-landing.service`, порт 80, Node 22.21.1, DynamicUser. Сервис enabled и active, файлы выдаются по allowlist. Служебные пути и исходники server/README не доступны по HTTP, POST запрещён. A/B/C не менялись и не перезапускались. При самом первом старте мгновенный loopback curl попал до listen и вернул connection refused; последующий внешний HTTP и браузерный проход прошли, этот стартовый запрос не засчитывается как PASS.

После внешней проверки добавлены canonical/og:url/абсолютный og:image с настоящим адресом. Следующий маленький выпуск содержит только эти метаданные и документацию; его SHA и контрольные суммы будут закреплены итоговой записью.

Открыто:

1. **Публичный URL MVP пока не передан. Владелец явно выбрал оставить «Ссылка на демо готовится» около 14:59 МСК.** Это согласованный итог текущей поставки. После передачи готового URL обновить только `landing/config.js` и повторить CTA smoke. IP статического сайта не подменяет вход в продукт. Локальные среды A/B/C не публиковались.
2. **Сквозной audio UI gate не принят.** Есть настоящий адаптер/сервис/транскрипт; это не PASS upload→STT→evidence→confirm на едином SHA. См. `FACTS.md`.
3. **Продуктовые screenshot/video не переданы.** Нужен разрешённый кадр синтетического прохода без токенов/секретов, метка SHA/режима. Не показываем фиктивное видео и не используем upstream BrainDrive screenshot.
4. Полный продуктовый релиз/приёмка остаётся команде. Технические проверки лендинга не являются приёмкой backend или проверкой качества AI.

Никаких ключей, recordings, credentials, private config и пользовательской памяти в поставке нет. SSH-реквизиты не записываются в Git и не передаются в другие чаты.
