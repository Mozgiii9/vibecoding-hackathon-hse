# Лендинг «Рядом»: передача

Дата: 25 октября 2026, МСК. Ветка: `codex/landing`. Worktree: `.worktrees/landing`. Base SHA: `ef360ae0627e35ddfe615143b5409690ac222ed8`, актуальный `origin/codex/integration-ui` на старте в 14:35. SHA поставки: первый коммит с сообщением `Add standalone Ryadom landing and verified demo`; точный SHA фиксируется следующей записью после коммита, без самоссылки на ещё не существующий hash.

## Результат первого среза

- Отдельный buildless HTML/CSS/JS сайт, без новых зависимостей и backend.
- Тёплая тёмная палитра текущего интерфейса, нативная иллюстрация с явной подписью synthetic.
- Детерминированная демонстрация: намерение 0 → действие proposed 0 → confirm 1 → duplicate 1 → reject 0, reset, три критерия. Модель не вызывается.
- Публичный config `landing/config.js`. Без подтверждённого URL CTA показывает «Ссылка на демо готовится». Локальные и URL с credentials/query не активируются; разрешён только публичный HTTPS DNS/IPv4.
- Title/description, SVG favicon, готовая PNG Open Graph 1200×630 и редактируемый SVG-исходник.
- Документация запуска/публикации, отдельный allowlist static server и шаблон собственного systemd service.
- Атрибуция BrainDrive MIT; цитата не выдаётся за независимую проверку истинности.

## Выполненные проверки

Headless Chrome, 25 октября, около 14:47 МСК. Никаких видимых окон/захвата фокуса.

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
| OG PNG HTTP/content type/размер | PASS, image/png, 1200×630 |
| Синтаксис app/config/server JavaScript | PASS, node --check |
| Локальный запуск | PASS, standalone Node server на loopback |
| Независимый review | Исправлены URL guard и слишком широкая формулировка о restart |

Артефакты: `docs/landing/evidence/browser-report.json`, `desktop.png`, `mobile.png`, `mobile-fold.png`. Это снимки лендинга, не продуктовые screenshots. Повторить: инструкция в `DEPLOYMENT.md`, runner `run-checks.mjs`.

Pre-commit: настроен `.githooks/pre-commit`; должен запускаться при каждом коммите. Область Git изменений ограничена `landing/**` и `docs/landing/**`. Приложение, shared contracts, manifests/locks и чужая работа не меняются.

## Публикация и зависимости

Владелец отдельно разрешил публикацию на предоставленном IP. На первом read-only осмотре порт 80 свободен; A и B работают на loopback. Публикация готовится в собственной среде `/srv/ryadom-hackathon/landing`, без перезапуска A/B/C. Проверенный публичный адрес и deployed SHA появятся после фактического HTTP/headless PASS, до этого сайт не называется опубликованным.

Открыто:

1. **Публичный HTTPS URL MVP не передан.** IP статического сайта не заменяет обычный вход в работающий продукт. Не публиковать loopback/test memory A/B как будто это общий demo candidate. CTA пока честно неактивен.
2. **Сквозной audio UI gate не принят.** Есть настоящий адаптер/сервис/транскрипт; это не PASS upload→STT→evidence→confirm на едином SHA. См. `FACTS.md`.
3. **Продуктовые screenshot/video не переданы.** Нужен разрешённый кадр синтетического прохода без токенов/секретов, метка SHA/режима. Не показываем фиктивное видео и не используем upstream BrainDrive screenshot.
4. Полный продуктовый релиз/приёмка остаётся команде. Технические проверки лендинга не являются приёмкой backend или проверкой качества AI.

Никаких ключей, recordings, credentials, private config и пользовательской памяти в поставке нет. SSH-реквизиты не записываются в Git и не передаются в другие чаты.
