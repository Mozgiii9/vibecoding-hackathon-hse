# C — общий source-кандидат «Рядом»

Состояние около15:06 МСК25октября2026: **READY_FOR_ACCEPTANCE**, production text/audio/restore PASS C; независимая финальная проверка A запрошена и остаётся отдельным пунктом. Цель C ещё не объявлена завершённой.

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

Полный backend suite не объявляется зелёным: прежний baseline starter-pack lint описан A. Прежние проверки не заменены новыми формулировками. Первый production audio harness упал до signup из-за старого English selector; failure сохранён отдельно, после canonical B fix7PASS. Ошибка harness не называлась ошибкой STT/продукта.

Доказательства: [C production summary](../demo/evidence/c-production/summary.json), [audio](../demo/evidence/c-production/audio-results.json), [restore](../demo/evidence/c-production/restore-proof.json), [desktop](../demo/evidence/c-production/restored-desktop.png), [mobile](../demo/evidence/c-production/restored-mobile.png).

## Защита и остаток

Готовы автономные4экрана, трёхминутныйscript, проверенные реальные текстовые записи dev и production, checklist2человеческих репетиций. Репетиции и физический проектор **NOT_RUN**, фиктивных отметок нет. PPTX/PDF не создавались. Личные записи и ключи в артефактах отсутствуют; все источники synthetic.

Нужно закрыть: финальный независимый A4 на eba453c, актуализировать последний экран/речь по его результату, выполнить человеческие репетиции. Аудио работает через сохранённый sidecar B; его native inference не отменяется клиентским abort, что документировано. Цель ручная, nextStep по правилу; LLM-интервью/коучинг, continuous recording и OAuth не реализованы и не обещаются.
