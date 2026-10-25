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
| Контраст 17 основных текстов, 390 px | PASS, минимум 6,50:1; подписи от 12 px. Это выборочная проверка, не полный WCAG audit |
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

После внешней проверки добавлены canonical/og:url/абсолютный og:image с настоящим адресом. **Промежуточный deployed SHA:** `c4e5cb59c26c87a54c1758a92364844522e348b8`; архив SHA256 `d3cd1daebc720c794f6bb33474e289be2efa914f4a32776632c67c1089d6c51a`. Атомарно переключена только ссылка своего `current`; предыдущий выпуск сохранён. Собственный сервис перезапущен, health с ограниченным retry дождался listen и вернул 200. Статус enabled/active/running, DynamicUser=yes, PID на момент проверки 86439. В 15:02 МСК каждый из 6 публичных файлов побайтно сверён SHA256 с этим коммитом, canonical/og:url/og:image PASS. См. `evidence/deployment-manifest.json`. Затем перед завершением найдена новая приёмка B и настоящий кадр; они включаются отдельным исправлением фактического статуса (см. ниже). Итог этого исправления закреплён следующей записью.

Открыто:

1. **Публичный URL MVP пока не передан. Владелец явно выбрал оставить «Ссылка на демо готовится» около 14:59 МСК.** Это согласованный итог текущей поставки. После передачи готового URL обновить только `landing/config.js` и повторить CTA smoke. IP статического сайта не подменяет вход в продукт. Локальные среды A/B/C не публиковались.
2. **Audio UI gate B закрыт: 7 PASS на ef360ae.** Финальная сверка в 15:07 МСК обнаружила новый отчёт и разрешённый синтетический кадр. Публичный текст обновлён; приёмка общего серверного выпуска C остаётся отдельной. См. `FACTS.md` и `evidence/audio-source-summary.json`.
3. **Продуктовый кадр получен и включён.** Проверенный PNG из аудиопрохода B, без редактирования пикселей, с меткой synthetic/SHA и SHA256 происхождения. Видео не встроено, публичный файл для лендинга не передан. Фиктивной кнопки воспроизведения нет.
4. Полный продуктовый релиз/приёмка остаётся команде. Технические проверки лендинга не являются приёмкой backend или проверкой качества AI.

Финальная сверка Git: изменены только `landing/**` и `docs/landing/**`; свой checkout остаётся `codex/landing`, общий checkout остаётся `codex/integration-ui`. Настроенный pre-commit hook отработал при всех коммитах; `git diff --check` PASS. Поиск стандартных маркеров ключей/секретов в поставке совпадений не дал.

Никаких ключей, recordings, credentials, private config и пользовательской памяти в поставке нет. SSH-реквизиты не записываются в Git и не передаются в другие чаты.

## Итоговая публикация, 15:12 МСК

- Адрес: **http://77.239.111.64/**. Опубликованный source SHA: **7a3b82f8ab9bb736149998fe14a029e6d6d03918**.
- Архив SHA256: `02c880425bcfad0b325f056bcd38bd86c6b7e7a25847afcc549a90f4dad896d5`. Отдельный release-каталог и current указывают на этот SHA; два предыдущих выпуска сохранены для отката.
- Service enabled/active/running, DynamicUser=yes, PID на момент проверки 86916. Перезапущен только свой ryadom-landing; health дождался listen ограниченным retry.
- Семь публичных файлов побайтно совпадают с source SHA: `evidence/deployment-manifest.json`. Canonical/OG и новый кадр возвращают 200.
- Финальный headless Chrome **15:11:38–15:11:51 МСК**: шесть ширин без overflow, desktop keyboard flow и mobile flow PASS, reset/focus/details/anchors/reduced motion PASS, ошибок/битых ресурсов/внешних запросов 0, PNG декодирован как 1440×1100. 17 запрещённых URL и 2 разрешённых протокола проверены без перехода на них, no-JS fallback PASS.
- В финальном содержимом есть настоящий кадр и актуальное ограниченное утверждение об audio gate B. Это приёмка лендинга, не серверного MVP.
- По прямому выбору владельца CTA остаётся **«Ссылка на демо готовится»**. Функциональный сценарий доступен. Публичный URL MVP можно подключить позже без изменения архитектуры сайта.
- Этот заключительный коммит меняет только handoff/отчёты, поэтому повторный серверный выпуск для него не нужен.

## Итерация v2 по новому запросу владельца

- Удалена указанная подпись BrainDrive из footer; app/LICENSE сохранён.
- В hero добавлены 3 синтетических кейса: ML / 300 000 ₽ / повышение. Autoplay8с, native выбор Enter/Space, pause; hover/focus/hidden/offscreen останавливают цикл, manual выбор сохраняется, reduced motion начинает с паузы. Основная демонстрация подтверждения независима.
- Добавлен модуль записи дня/суммаризации/компоновки, **явно концепция следующего этапа**, текущий ручной импорт текста/короткого аудио указан рядом.
- Сохранённый pixelfirefly02 извлечён через ImageGen с прозрачностью, добавлена предметная 3D-иллюстрация в цветах сайта. Оба PNG alpha проверены, промпты в ASSETS_V2.md.
- Созданы A/B/C SVG-логотипы через logo-design skill с источником и headless-проверками. Владелец ответил «Пока никакой», поэтому новые знаки на сайт не ставились.
- Независимое статическое ревью v2: блокирующих проблем нет. Headless desktop/mobile и keyboard flow прошли; точный deployed SHA и внешний прогон будут закреплены после публикации v2.

### Опубликованный результат v2

- Адрес http://77.239.111.64/; deployed SHA `26a3e0d0814ca80f0625c5c346cb0b5cf9cd6861`. Архив SHA256 `124cb2df87f7baaa11fb533aad937646c9c3abefb5ccc8b9127825e77ecbd1dd`.
- 10 публичных файлов побайтно совпадают с коммитом; footer-подписи нет, future concept label присутствует. `evidence/v2/public-manifest.json`.
- Внешний headless Chrome 15:51 МСК: 6 ширин PASS, 0 overflow, 0 console/resource errors, 0 внешних запросов; keyboard/reduced motion/anchors/details/demo flow PASS. Три кейса, fade, авто8с, hover/focus/offscreen/manual pause и reduce opt-in PASS; отдельные public-отчёты в evidence/v2/.
- Собственная служба enabled/active/running, DynamicUser=yes, PID при публикации87709. Релизы v1 сохранены. Перезапущен только ryadom-landing. Истёкший SSH control channel восстановлен; до успешного атомарного переключения оставалась рабочая v1.
- Все изменения интерфейса закоммичены до feature freeze; последующие операции только публикация/проверки/документация. Проверки браузера headless. Физические устройства не проверялись.
- Новые логотипы по выбору владельца **не установлены**. Исходные варианты остаются docs/landing/logo-options/, SVG-native и monochrome/16/32 проверки PASS.
- Заключительный коммит только с отчётами не требует новой публикации статических файлов.
