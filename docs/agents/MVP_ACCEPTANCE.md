# Готовность полноценного MVP «Рядом»

Проверка входа на iPhone: после сообщения владельца об ошибке интегратор повторно вошёл через публичный Chrome с теми же демоданными. В собственном audit C недавние отказы имеют причину `password_mismatch`; логин совпадал. В 16:19 МСК зафиксирован последующий успешный вход, его принадлежность телефону ожидает подтверждения владельца. Физические text/audio пока NOT_RUN. [Текущий результат устройства](../demo/evidence/c-production/https-iphone-status.json).

**Основной MVP ACCEPTED интегратором, 25 октября 2026, 15:24 МСК.** Production source **eba453c** прошёл C-проверки текста, реального аудио, review/duplicate, reload, backup и старта восстановленной копии; mobile390 без переполнения. [Точные доказательства](../demo/evidence/c-production/summary.json), [handoff C](../handoffs/agent-c-wave2.md), [запуск](../demo/OPERATIONS.md).

Происхождение финальной проверки: независимый A выполнил **ef360ae**, его audio-результат **DIAGNOSTIC_RECOVERY_PASS**, первоначальные FAIL сохранены. C выполнил **семь чистых аудиопроверок PASS на eba453c**. [Перечисленные runtime-исходники](../demo/evidence/c-production/runtime-equivalence.json) ef360ae и eba453c идентичны, но A не запускал точный deployment SHA eba453c. [Resume-тест A на точном eba453c](../demo/evidence/c-production/a-authored-resume.json) выполнил C: **PASS 1/1**. Финальный handoff A `ad779d9` объединён.

**Отдельное расширение ACTIVE:** публичный [HTTPS](https://77.239.111.64/) имеет статус **PUBLIC_HTTPS_READY**. Доверенный сертификат Let’s Encrypt с IP SAN, UI/SPA/ресурсы, точный source SHA, initialized local JWT bootstrap и отказ защищённого API анонимному запросу/поддельным actor-заголовкам независимо проверены, PASS. [План HTTPS](../demo/HTTPS_PLAN.md), [deployment](../demo/evidence/c-production/https-deployment.json), [независимый отчёт](../demo/evidence/c-production/https-independent.json). Приложение остаётся на eba453c; HTTPS-proxy работает отдельно, без новой функции приложения после freeze.

Публичный реальный text-сценарий **COMPLETED_TEXT**: новый источник, точная цитата, confirm и mock **1→2**, [проверки публичного текста](../demo/defense/recordings/https-eba453c/metadata.json) и [проверенная HTTPS-запись](../demo/defense/recordings/https-eba453c/completed-text/demo.webm). Независимое декодирование: **11,20 с, 1440×900**, реальный UI в начале/середине/конце; небольшое серое поле, как у оригинала. Белое изображение было артефактом Chrome media viewer; QA файла закрыта. Прежняя production-текстовая запись также остаётся резервом.

Свежая публичная аудиопроверка **PASS_FRESH_AUDIO**: [6 проверок за 82,23 с](../demo/evidence/c-production/https-audio-results.json), обычный вход, старый WAV duplicate с прежними ID/counts, свежий WAV с изменёнными байтами и реальными STT/Gemini, точные цитаты и таймкоды, proposals без роста; confirm cv1→2, повтор с теми же ID/counts, reload сохраняет auth/данные. Итог **cv2/mock2/feedback0**. Владелец сообщил: «Приложение открылось, требуется вход». Физический iPhone **PHONE_LOGIN_SCREEN_CONFIRMED**, обычная авторизация, текст и аудио на устройстве ещё не проверены. Основной MVP принят, вся расширенная цель остаётся ACTIVE.

Согласованный основной объём включает текст **и** короткое аудио. Ручная форма цели и следующий шаг по правилу допустимы в v1. LLM-интервью/модельный коучинг, continuous recording и OAuth не входят в текущую реализацию.

| Возможность | Реализация | Фактическая проверка | Ответственность |
|---|---|---|---|
| Вход и первая цель | Existing auth, форма с тремя критериями, API/store | PASS: обычный signup/logout/login, цель и состояние после reload | C; независимо A на ef360ae |
| Текст и модель | Import/extraction/валидация, Gemini transport | PASS C: реальный UI, новый источник, цитата, confirm, server mock0→1; production WebM COMPLETED_TEXT | C+B; независимо A на ef360ae |
| События и основания | Классификация, source/quote, ручное review | PASS C: намерение не увеличивает прогресс, точная цитата и source focus | A+B+C |
| Дубли и пересмотр | Hash/event dedup, reject/revisions, пересчёт | PASS C: duplicate сохраняет ID/counts, audio CV reject1→0 и reconfirm0→1 | A; UI C |
| Короткое аудио | Настроенный STT B, audio route/UI и расшифровка | C eba453c: 7 чистых проверок PASS, реальные quotes/timecodes. A ef360ae: DIAGNOSTIC_RECOVERY_PASS, не чистый audio E2E | B; wiring/UI C; packaging/независимая проверка A |
| Надёжность и ошибки | Атомарный JSON-store, bounded transport, состояния ошибок | Restart/restore PASS. A отдельно проверил protocol-fake негативные сценарии, это не live provider quality | A+B+C |
| Наш воспроизводимый выпуск | Source-built Linux/x64 Node22.21.1, без Vite/upstream images | PASS C: manifest/release identity, backup49files, restore только в новую synthetic копию, совпадение core-state SHA256 | A; общий выпуск C |
| Интерфейс | Тёплый тёмный responsive React | PASS C: desktop/mobile390, точный source/quote и counts после restore. A-authored resume на точном C выполнен C, PASS1/1 | C; независимо A на ef360ae |
| Публичный HTTPS | Отдельный TLS proxy на 443, source UI/API eba453c неизменён, HTTP landing сохранён | PUBLIC_HTTPS_READY: trusted IP SAN/TLS1.3, UI/assets/SHA и auth guard PASS; реальный text COMPLETED_TEXT, mock1→2; public audio PASS_FRESH_AUDIO 6/6, cv1→2; физический iPhone PHONE_LOGIN_SCREEN_CONFIRMED, auth/text/audio pending | C; независимая HTTP(S)-проверка C2; устройство проверяет владелец |
| Защита | Четыре экрана, script, synthetic корпус и короткие text WebM | Материалы есть. Полный трёхминутный text+audio ролик, человеческие репетиции и физический проектор NOT_RUN | B корпус; C комплект |

## Сквозной сценарий приёмки

1. Запустить наш зафиксированный SHA в изолированной среде; пройти обычную авторизацию и создать цель с тремя критериями.
2. Импортировать намерение реальной моделью: счётчик не изменился. Импортировать выполненное действие: открыть точную исходную цитату, подтвердить, увидеть изменение прогресса.
3. Повторить импорт: прогресс не вырос. Отклонить ранее подтверждённое действие: прогресс пересчитан.
4. Загрузить короткую синтетическую аудиозапись через UI; получить настоящую расшифровку и evidence, открыть источник, подтвердить. Не выдумывать таймкоды.
5. Проверить ошибку/таймаут и отсутствие частично записанного источника, сохранность после reload/restart, backup/restore на отдельной копии.
6. Повторить ключевые действия на узком экране. Сохранить результат PASS/FAIL/NOT_RUN с SHA и способом воспроизведения без секретов.

Основной функциональный MVP принят по C evidence одного eba453c с независимой проверкой A на runtime-эквивалентном ef360ae и дополнительным выполнением A-authored resume на точном eba453c агентом C. Отдельные зелёные ветки и mock integration tests сами по себе этого не доказывают. Короткое text-only видео остаётся текстовым резервом, оно не подменяет проверку аудио или полный трёхминутный показ.

## Что остаётся после core-приёмки

- Публичный HTTPS — PUBLIC_HTTPS_READY; свежий public audio — PASS_FRESH_AUDIO. На физическом iPhone подтверждён только экран входа: PHONE_LOGIN_SCREEN_CONFIRMED; обычная авторизация, текст и аудио pending. Расширенная цель ACTIVE, не COMPLETE.
- Сертификат shortlived действует до 2026-11-01T03:48:08Z. Автопродление и старт proxy после перезагрузки не настроены, см. HTTPS_PLAN.md.
- Команда: две человеческие репетиции, физический проектор и полный резервный text+audio ролик, без фиктивных отметок PASS.
- Ограничения: Docker runtime не запускался, полный backend suite не объявлен зелёным из-за документированного baseline. Sidecar B не отменяет native inference при клиентском abort.

Gemini через приватный OpenAI-compatible endpoint и STT настроены для принятого кандидата. Ключи остаются в приватном environment, резервный OpenRouter автоматически не включается. Изолированные серверные тесты разрешены по `SHARED_SERVER.md`; общую среду обновляет C.

Сабагенты GPT‑6.1‑Sol/high — без проектного численного лимита и лимита глубины, с непересекающимися файлами/worktrees. Ресурсный lock сервера сохраняется. Первый проверенный slice через 20–30 минут работы; blocker дольше 5 минут — зафиксировать и взять независимую задачу. Feature freeze 15:45 МСК; после него только P0 исправления, полная готовность 17:15, дедлайн 17:30. Если объём не закрыт, указываем конкретные открытые пункты, не переименовываем частичный результат в полный.
