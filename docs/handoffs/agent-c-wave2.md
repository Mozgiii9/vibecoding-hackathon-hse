# C — общий source-кандидат «Рядом»

Состояние после финальной сверки 25 октября 2026: **основной MVP ACCEPTED** интегратором, запись принятия 15:24 МСК в [summary](../demo/evidence/c-production/summary.json). Финальный handoff A `ad779d9` объединён. Новая явно добавленная владельцем задача публичного HTTPS/TLS-доступа для iPhone находится **IN_PROGRESS**. Полная расширенная цель ещё не завершена: публичный HTTPS не принят, физический iPhone **NOT_RUN**.

## Реализация и версия

- Deployment SHA: **eba453caec424c47a31c8f8947a83ed9389dc8a3**; source-built Linux/x64 Node22.21.1, без Docker/Vite/upstream app images. Manifest и actual `/release.json` совпадают.
- Включены A goals-core/backup/source packaging и B context/STT/quality. C улучшил русский первый вход, bootstrap retry, возврат в goal workspace, сохранение draft при ошибке save и guard ошибки первой загрузки/пустого title.
- Последующие merge B меняют runner/evidence/docs, не deployment application code. `runnerCheckoutSha` в audio report не является deployment SHA; точная версия цели указана в [summary](../demo/evidence/c-production/summary.json).
- Запуск и фактические пути: [OPERATIONS.md](../demo/OPERATIONS.md). UI http://127.0.0.1:17073/ через активный SSH tunnel; публичный hosting не заявляется.

## Проверки

| Проверка | Фактический результат |
|---|---|
| Frontend полный suite после C2/guards |226/226PASS; typecheck/buildPASS |
| После merge audio: context/gateway/config |204/204PASS; backend buildPASS |
| Packaging/export |5/5PASS плюс optional STT archive1/1PASS; начальный sandbox listenEPERM устранён разрешённым rerun |
| Независимый B common-code gate |ef360ae:7PASS, обычный UI→реальныеSTT/Gemini→quote→confirm→duplicate→reload, сохранено B |
| Production C audio |eba453c:7PASS, clean signup/logout/login/goal0, WAV→настоящая расшифровка и4evidence, всеquotes точные, UIconfirmcv1, duplicate IDs/counts прежние, reload сохраняет auth/data |
| Production C text |eba453c: обычный login, новый text→quote→confirmmock0→1, реальный WebM; intention не увеличивает cv1/mock1/feedback0 |
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

После обновления экранов повторная локальная headless-проверка: все4экрана1280×720 помещаются выше toolbar;390×844 без горизонтального переполнения, конец длинного экрана доступен прокруткой. Стрелки/пробел/прямой переход/заметки/Escape PASS, JS errors0, external HTTP requests0. Метаданные обоих WebM прочитаны браузером:15,04/16,12с и1440×900. Это проверка артефактов, не физического проектора или iPhone.

Core-приёмка закрыта с указанным выше происхождением A/C. Последний экран актуализирован под рабочий MVP. Остаются человеческие репетиции и полный резервный ролик. Новая публичная HTTPS-задача включает отдельную проверку сертификата/TLS и обычного входа, текста и загрузки короткого аудио на физическом iPhone. До её результатов готовность публичного iPhone-сценария не заявляется.

Аудио работает через сохранённый sidecar B; его native inference не отменяется клиентским abort, что документировано. Цель ручная, nextStep по правилу; LLM-интервью/коучинг, continuous recording и OAuth не реализованы и не обещаются.
