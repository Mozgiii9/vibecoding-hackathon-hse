# C — общий source-кандидат «Рядом»

Разделение URL выполнено: [панель](https://77.239.111.64/) и [лендинг](https://77.239.111.64/landing/). Адрес iPhone сохранён, кнопка лендинга открывает панель. При финальной проверке обнаружен параллельный выпуск **15ab6eb** из main; public login/reload/API401 на нём PASS. Собственная операция обновила только HTTPS proxy до3ad21b4, 11тестовPASS. [Текущая маршрутизация](../demo/evidence/c-production/landing-routing.json); подробные eba453c-проверки ниже — история предыдущего кандидата.

Физический iPhone: владелец подтвердил обычный вход и отображение цели с событиями — **PHONE_AUTH_AND_WORKSPACE_CONFIRMED**, login **PASS_BY_OWNER**. Предшествовавшие отказы имели причину `password_mismatch`; аккаунт и приложение не менялись. Импорт текста и выбор/загрузка аудио на устройстве — **PENDING_OWNER_CHECK**. [Текущий результат устройства](../demo/evidence/c-production/https-iphone-status.json).

Состояние 25 октября 2026: **основной MVP ACCEPTED** интегратором, запись принятия 15:24 МСК в [summary](../demo/evidence/c-production/summary.json). Финальный handoff A `ad779d9` объединён. Отдельный публичный HTTPS имеет статус **PUBLIC_HTTPS_READY**, реальный публичный текст — **COMPLETED_TEXT**, mock1→2. Свежий public audio **PASS_FRESH_AUDIO** 6/6, итогcv2/mock2/feedback0. Физический iPhone **PHONE_AUTH_AND_WORKSPACE_CONFIRMED**, login **PASS_BY_OWNER**. Импорт текста и выбор/загрузка аудио на устройстве — **PENDING_OWNER_CHECK**. Вся расширенная цель остаётся **ACTIVE**, не COMPLETE.

## Реализация и версия

- Deployment SHA: **eba453caec424c47a31c8f8947a83ed9389dc8a3**; source-built Linux/x64 Node22.21.1, без Docker/Vite/upstream app images. Manifest и actual `/release.json` совпадают.
- Включены A goals-core/backup/source packaging и B context/STT/quality. C улучшил русский первый вход, bootstrap retry, возврат в goal workspace, сохранение draft при ошибке save и guard ошибки первой загрузки/пустого title.
- Последующие merge B меняют runner/evidence/docs, не deployment application code. `runnerCheckoutSha` в audio report не является deployment SHA; точная версия цели указана в [summary](../demo/evidence/c-production/summary.json).
- Запуск и фактические пути: [OPERATIONS.md](../demo/OPERATIONS.md), [HTTPS_PLAN.md](../demo/HTTPS_PLAN.md). Публичный адрес [https://77.239.111.64/](https://77.239.111.64/); отдельный Node proxy на443, HTTP_ENABLED=0, существующий HTTP landing на80 сохранён. UI17073/API18789/STT19000 остаются приватными. Source UI/API **eba453c** не менялся; proxy расположен вне приложения, новых функций приложения после freeze не добавлено.
- [HTTPS deployment](../demo/evidence/c-production/https-deployment.json) и [независимая проверка](../demo/evidence/c-production/https-independent.json): trusted Let’s Encrypt IP SAN, сертификат до2026-11-01T03:48:08Z. Автопродление и автоматический старт proxy после reboot не настроены.

## Проверки

| Проверка | Фактический результат |
|---|---|
| Frontend полный suite после C2/guards |226/226PASS; typecheck/buildPASS |
| После merge audio: context/gateway/config |204/204PASS; backend buildPASS |
| Packaging/export |5/5PASS плюс optional STT archive1/1PASS; начальный sandbox listenEPERM устранён разрешённым rerun |
| Независимый B common-code gate |ef360ae:7PASS, обычный UI→реальныеSTT/Gemini→quote→confirm→duplicate→reload, сохранено B |
| Production C audio |eba453c:7PASS, clean signup/logout/login/goal0, WAV→настоящая расшифровка и4evidence, всеquotes точные, UIconfirmcv1, duplicate IDs/counts прежние, reload сохраняет auth/data |
| Production C text |eba453c: обычный login, новый text→quote→confirmmock0→1, реальный WebM; intention не увеличивает cv1/mock1/feedback0 |
| Публичный HTTPS C |PUBLIC_HTTPS_READY: обычная проверка TLS1.3/IP SAN, UI/SPA/same-origin assets200, exactSHAeba453c, bootstrap initialized/local, anonymous401 и x-actor-spoof401; config schema-safe/no credential fields; старый HTTP landing200 |
| Публичный реальный text C |COMPLETED_TEXT: новый источник → exactquote → confirm, mock1→2; [проверки публичного текста](../demo/defense/recordings/https-eba453c/metadata.json), [проверенный WebM](../demo/defense/recordings/https-eba453c/completed-text/demo.webm):11,20с/1440×900; реальный UI в начале/середине/конце подтверждён независимым декодированием |
| Публичный свежий audio C |[PASS_FRESH_AUDIO](../demo/evidence/c-production/https-audio-results.json):6/6 за82,23с. Обычный login; старый WAVduplicate сохраняетID/counts; свежий WAV с изменёнными байтами → реальныеSTT/Gemini/exactquotes/groundedtimes, proposals без роста; confirmcv1→2; repeat сохраняетID/counts; reload сохраняетauth/данные. Итогcv2/mock2/feedback0 |
| Физический iPhone |PHONE_AUTH_AND_WORKSPACE_CONFIRMED, login PASS_BY_OWNER по новому сообщению «Да, на iPhone вижу цель и события». Предшествовавшие password_mismatch сохранены в истории, аккаунт и приложение не менялись. Импорт текста и выбор/загрузка аудио на устройстве PENDING_OWNER_CHECK |
| Production C review |audioCVreject1→0, затем reconfirm0→1; серверные counts и UI совпадают |
| Production restore |SIGTERM толькоC,49файлов backup, новая synthetic копия, corestate SHA256 идентичен; secrets отдельно приватно, исходная память сохранена |
| UI после restore |сессия восстановлена,6events/reviews иcounts1/1/0; exactaudioquote, настоящий0:04–0:09, sourcekeyboardfocus |
| Mobile после restore |390px без horizontal overflow, текст≥12px, counts/source сохранены |
| Финальная независимая проверка A |ef360ae: text/restart/restore PASS, audio **DIAGNOSTIC_RECOVERY_PASS**, исходные FAIL сохранены. [Перечисленные runtime-исходники](../demo/evidence/c-production/runtime-equivalence.json) идентичны eba453c. A не запускал точный deployment SHA eba453c |
| Тест восстановления A на точном C |Автор теста A, исполнитель **C** на eba453c: [PASS 1/1](../demo/evidence/c-production/a-authored-resume.json), обычный вход, точные ID/revisions/status/quotes/timecodes при1440и390px |

Полный backend suite не объявляется зелёным: прежний baseline starter-pack lint описан A. Прежние проверки не заменены новыми формулировками. Первый production audio harness упал до signup из-за старого English selector; failure сохранён отдельно, после canonical B fix7PASS. Ошибка harness не называлась ошибкой STT/продукта.

Доказательства: [C production summary](../demo/evidence/c-production/summary.json), [audio](../demo/evidence/c-production/audio-results.json), [restore](../demo/evidence/c-production/restore-proof.json), [desktop](../demo/evidence/c-production/restored-desktop.png), [mobile](../demo/evidence/c-production/restored-mobile.png).

## Защита и остаток

Готовы автономные4экрана, трёхминутныйscript, реальные текстовые записи dev ef360ae **15,04 с** и production eba453c **16,12 с**, обе1440×900 и COMPLETED_TEXT, checklist2человеческих репетиций. Это короткие текстовые резервы, полного трёхминутного text+audio фильма нет. Репетиции и физический проектор **NOT_RUN**, фиктивных отметок нет. PPTX/PDF не создавались. Личные записи и ключи в артефактах отсутствуют; все источники synthetic.

После обновления экранов повторная локальная headless-проверка: все4экрана1280×720 помещаются выше toolbar;390×844 без горизонтального переполнения, конец длинного экрана доступен прокруткой. Стрелки/пробел/прямой переход/заметки/Escape PASS, JS errors0, external HTTP requests0. Метаданные обоих WebM прочитаны браузером:15,04/16,12с и1440×900. Третья, публичная HTTPS-запись отдельно декодирована существующим Playwright ffmpeg:11,20с/1440×900, early/mid/end содержат реальный UI; C лично просмотрел end-frame с цитатой и подтверждённым действием. Небольшое серое поле соответствует прежним записям. Белое изображение Chrome media viewer было артефактом просмотра, QA файла закрыта. Это проверка артефактов, не физического проектора или iPhone.

Core-приёмка закрыта с указанным выше происхождением A/C. Публичный HTTPS — PUBLIC_HTTPS_READY, публичный реальный text — COMPLETED_TEXT, свежий public audio — PASS_FRESH_AUDIO. На физическом iPhone подтверждены обычный вход и рабочая область с целью и событиями (PHONE_AUTH_AND_WORKSPACE_CONFIRMED, login PASS_BY_OWNER); импорт текста и выбор/загрузка аудио ещё PENDING_OWNER_CHECK. Вся расширенная цель остаётся ACTIVE. Третья HTTPS-запись проверена и добавлена к текстовым резервам, прежняя production-запись сохранена; открытой QA-проблемы видео нет. Остаются человеческие репетиции и полный резервный ролик.

Аудио работает через сохранённый sidecar B; его native inference не отменяется клиентским abort, что документировано. Цель ручная, nextStep по правилу; LLM-интервью/коучинг, continuous recording и OAuth не реализованы и не обещаются.

## Точка входа для владельца landing

Публичный адрес приложения проверен: https://77.239.111.64/. В публичном HTTP `config.js` лендинга при отдельной проверке C ещё был пустой `appUrl`; владелец landing может настроить эту ссылку по своему процессу. C не менял его файлы или процесс. Обычная авторизация приложения сохранена, credentials в публичную конфигурацию не помещать.
