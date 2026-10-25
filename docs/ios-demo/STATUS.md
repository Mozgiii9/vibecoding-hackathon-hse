# Статус iOS demo «Рядом»

Обновлено: 25 октября 2026, 14:38 МСК. Состояние: **BLOCKED для сквозной приёмки; оболочка установлена и запущена на физическом iPhone**. Пользователь подтвердил открытие с иконки и экран «Не удалось загрузить». Настоящий web UI недоступен. Полная цель не принята.

Повторная диагностика 25 октября, 15:26 МСК: пользователь прислал фото экрана ошибки проверки защищённого соединения. `curl -I https://77.239.111.64/` по-прежнему завершился `SSL_ERROR_SYSCALL`; `openssl s_client` завершился `unexpected eof while reading`, **no peer certificate available**, 0 байт TLS-ответа. Строка OpenSSL `Verify return code: 0` здесь не означает валидный сертификат: сертификат вообще не получен, cipher `(NONE)`. На текущем сетевом пути TLS endpoint не обслуживает клиента. Не предлагать доверять неизвестному сертификату или менять дату телефона без свидетельств.

Свежие `docs/status/agent-c.md` и `docs/demo/OPERATIONS.md` общего checkout сообщают готовый source-кандидат `eba453caec424c47a31c8f8947a83ed9389dc8a3`: UI17073/gateway18789/MCP18931–33 только loopback, доступ через SSH tunnel; STT19000 готов. Это сведения C, не повторная серверная проверка iOS-агентом. Теперь upstream-порты подтверждены отчётом владельца, но публичный HTTPS всё ещё блокирует физический сценарий. Повторной установки оболочки при сохранении `https://77.239.111.64/` не требуется.

15:29 МСК: владелец явно разрешил передачу запроса интегратору C. Запрос с диагностикой/портами/ссылками на HTTPS-шаблон отправлен через Codex в чат «Проверь связь с GitHub» (`01a171e6-b22c-7990-96eb-52182ed1a93e`). API принял отправку; принятие задачи агентом и готовность HTTPS пока не подтверждены. Это единственное разрешённое внешнее сообщение iOS-чата; прежние записи «сообщений не отправляли» относятся к состоянию до этого согласия.

## Версия и границы

- Ветка: `codex/ios-demo`; отдельный worktree `.worktrees/ios-demo` внутри исходного workspace.
- Base SHA: `484c396e71b3fbfe2ff65c04f6260e1899aa6bd1`, актуальный `origin/codex/integration-ui` при старте.
- Ready source SHA: `a2fabcf4a534dd9a9f03bd92bd8d57bcb99014df`. Это SHA оболочки, а не принятый интегрированный MVP.
- Первые исходники и инструкции опубликованы: `a2fabcf` и `9542e0f` в `origin/codex/ios-demo`; последующие изменения статуса не меняют native исходники.
- Изменяемые пути: только `clients/ios-demo/**` и `docs/ios-demo/**`.
- Общий checkout с незакоммиченными изменениями команды не переключался; frontend, gateway, contracts и manifests не менялись. Серверные процессы не менялись. Внешних сообщений не отправляли.

## Фактические проверки

| Проверка | Результат | Свидетельство / ограничение |
|---|---|---|
| Xcode / iOS SDK | PASS | Xcode 27.0 (27A266a), iPhoneOS SDK 27.0 |
| Обнаружение физического устройства | PASS | iPhone Air, iOS 27.0.1, wired/paired; идентификаторы устройства не публикуем |
| Готовность Developer Mode | PASS | В начале был Disabled, после действий пользователя CoreDevice подтвердил Enabled (1) |
| Конфигурация URL / policy переходов | PASS | `clients/ios-demo/scripts/check.sh`: 24 URL + 13 navigation checks; Info.plist/pbxproj lint OK |
| Device build, arm64, без подписи | PASS | `xcodebuild ... -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build` → BUILD SUCCEEDED |
| Сборка внутри sandbox | FAIL окружения | SwiftUI macro plugin блокируется sandbox-exec; та же сборка вне sandbox проходит |
| Настройка Personal Team/profile | PASS | Через Computer Use выбрана личная команда, Xcode показал Managed Profile и Apple Development certificate; ID команды только в ignored Local.xcconfig |
| Подписанная установка на iPhone | PASS | CoreDevice apps показывает «Рядом», `ru.mozgiii9.ryadom.iosdemo`, версия 1.0 / build 1 |
| Запуск через Xcode | PASS | После доверия Developer App на телефоне Xcode показал Running RyadomDemo on iPhone; работает WebContent process |
| Запуск с иконки / экран ошибки | PASS | Пользователь открыл приложение с домашнего экрана и сообщил: «Постоянно пишет “Не удалось загрузить”» |
| HTTPS на указанном IP | FAIL | HTTP 80: empty reply; HTTPS 443: SSL_ERROR_SYSCALL с Mac; это не диагностика listener на сервере |
| Подключение с физического iPhone | FAIL | Xcode WebKit console: NSURLErrorDomain -1004 (cannot connect to host); пользователь видит экран сетевой ошибки |
| Пункт 1 физической приёмки | PASS | Запуск с иконки состоялся; загрузка настоящего UI отдельно FAIL |
| Пункты 2–7 физической приёмки | NOT_RUN | Нужен доступный HTTPS UI/backend; обычный вход, модель, цитаты, прогресс и сессия не проверены |
| Аудио через реальный STT | NOT_RUN | Общий STT и file upload на iPhone не проверены; запись с микрофона в текущем web UI отсутствует |
| HTTPS/Nginx шаблон | NOT_RUN | Только предложение интегратору; не применялось, server nginx -t не выполнялся |
| SSH read-only preflight | FAIL | BatchMode со штатными ключами → Permission denied (publickey,password); серверные команды не выполнились, доступ не менялся |

Unsigned build находится локально в ignored `clients/ios-demo/build/DerivedData/Build/Products/Debug-iphoneos/RyadomDemo.app`; он не является устанавливаемым пакетом. Единственное предупреждение успешной сборки: пропуск AppIntents metadata, поскольку AppIntents не используется.

## Зависимости и передача владельцу / интегратору

1. Установка завершена: Personal Team/profile, Developer Mode и доверие Developer App настроены. После успешного запуска через Xcode отладчик остановлен; пользователь открыл приложение с иконки. Пароли/коды Apple не запрашивались и не вводились агентом.
2. Интегратор C: подтвердить реальные UI/gateway порты и опубликовать единый доверенный HTTPS origin на `77.239.111.64`; предложенный путь [HTTPS_IP.md](HTTPS_IP.md). Порты `17073/18789` пока только из плана резервирования, не подтверждённый deployment.
3. Интегратор: подтвердить SHA реально обслуживаемого web/backend и готовность STT; обычный auth, `/api` rewrite, cookies, mobile viewport/keyboard, file MIME M4A проверяются на кандидате. При необходимости правки общих файлов делает их владелец.
4. После HTTPS: пройти оставшиеся физические проверки [DEMO.md](DEMO.md) на той же установленной оболочке. Веб-версия Safari сейчас тоже зависит от готовности HTTPS; резерв не закрывает нативную приёмку. При изменении URL потребуется пересборка, при сохранении IP `/` — достаточно повторной загрузки.

Точная передача интегратору: получить `docs/ios-demo/HTTPS_IP.md` и шаблон из `codex/ios-demo`; проверить listeners/реальные порты, выпустить IP SAN certificate и опубликовать UI + `/api` под `https://77.239.111.64/`. Нужен владелец с серверным доступом: в этом чате SSH-ключ не принят. По исходным границам общие настройки и перезапуски принадлежат интегратору; пароль в Git/чат не нужен. После готовности передать endpoint, web/backend SHA и STT status владельцу iOS. В другие чаты сообщения не отправлялись.

## Реализация и ограничения

SwiftUI + WKWebView, iOS 16+, без пакетов и второго backend. Постоянный website data store; origin ограничен точным HTTPS host/port. Внешние HTTPS/mailto/tel ссылки открываются после пользовательского нажатия и native confirmation. HTTP/произвольные схемы/автоматические внешние переходы блокируются. TLS обрабатывает система; ATS exceptions нет. Ошибки сети/HTTP/process termination показывают повторную загрузку входного GET без повторной отправки импорта.

WebView остаётся в SwiftUI safe area; экранная клавиатура использует штатное изменение доступной области. При возврате из другого приложения принудительного reload нет. File input обрабатывает системный WebKit picker. Эти runtime-свойства пока не прошли физическую приёмку. Захват микрофона/камеры закрыт, разрешения не запрашиваются; текущий общий UI принимает готовые файлы. Background recording, offline AI, push и native продуктовые экраны не входят в объём.

Независимое read-only ревью выполнено GPT-6.1-Sol/high. Исправлены показ полного назначения внешней ссылки и канонические/числовые варианты loopback; исправления повторно проверены ревьюером. Блокирующих source findings нет. Порядок WebKit callbacks при cancel/target=_blank и остальные runtime-свойства требуют device smoke, review не заменяет приёмку.
