# Статус iOS demo «Рядом»

Обновлено: 25 октября 2026, 14:32 МСК. Состояние: **BLOCKED для сквозной приёмки; исходники и unsigned device build готовы**. Подписанная установка в процессе через Xcode. Цель не принята.

## Версия и границы

- Ветка: `codex/ios-demo`; отдельный worktree `.worktrees/ios-demo` внутри исходного workspace.
- Base SHA: `484c396e71b3fbfe2ff65c04f6260e1899aa6bd1`, актуальный `origin/codex/integration-ui` при старте.
- Ready source SHA: `a2fabcf4a534dd9a9f03bd92bd8d57bcb99014df`. Это SHA оболочки, а не принятый интегрированный MVP.
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
| Установка и запуск с иконки | NOT_RUN | Xcode готовит Air, копирует OS library symbols; успешная установка ещё не подтверждена |
| HTTPS на указанном IP | FAIL | HTTP 80: empty reply; HTTPS 443: SSL_ERROR_SYSCALL с Mac; это не диагностика listener на сервере |
| Нативная/веб-приёмка 1–8 | NOT_RUN | Нужны HTTPS UI/backend и подписанная установка на физическом iPhone |
| Аудио через реальный STT | NOT_RUN | Общий STT и file upload на iPhone не проверены; запись с микрофона в текущем web UI отсутствует |
| HTTPS/Nginx шаблон | NOT_RUN | Только предложение интегратору; не применялось, server nginx -t не выполнялся |

Unsigned build находится локально в ignored `clients/ios-demo/build/DerivedData/Build/Products/Debug-iphoneos/RyadomDemo.app`; он не является устанавливаемым пакетом. Единственное предупреждение успешной сборки: пропуск AppIntents metadata, поскольку AppIntents не используется.

## Зависимости и передача владельцу / интегратору

1. Xcode: завершить первичную подготовку Air и установить подписанное приложение. Personal Team/profile и Developer Mode уже настроены. При запросе Keychain/Apple Account подтверждает пользователь; секреты в чат не нужны.
2. Интегратор C: подтвердить реальные UI/gateway порты и опубликовать единый доверенный HTTPS origin на `77.239.111.64`; предложенный путь [HTTPS_IP.md](HTTPS_IP.md). Порты `17073/18789` пока только из плана резервирования, не подтверждённый deployment.
3. Интегратор: подтвердить SHA реально обслуживаемого web/backend и готовность STT; обычный auth, `/api` rewrite, cookies, mobile viewport/keyboard, file MIME M4A проверяются на кандидате. При необходимости правки общих файлов делает их владелец.
4. Пользователь и iOS: подписать/установить через Xcode, пройти восемь физических проверок [DEMO.md](DEMO.md). При блокировке использовать честно обозначенный Safari fallback; он не закрывает нативную приёмку.

## Реализация и ограничения

SwiftUI + WKWebView, iOS 16+, без пакетов и второго backend. Постоянный website data store; origin ограничен точным HTTPS host/port. Внешние HTTPS/mailto/tel ссылки открываются после пользовательского нажатия и native confirmation. HTTP/произвольные схемы/автоматические внешние переходы блокируются. TLS обрабатывает система; ATS exceptions нет. Ошибки сети/HTTP/process termination показывают повторную загрузку входного GET без повторной отправки импорта.

WebView остаётся в SwiftUI safe area; экранная клавиатура использует штатное изменение доступной области. При возврате из другого приложения принудительного reload нет. File input обрабатывает системный WebKit picker. Эти runtime-свойства пока не прошли физическую приёмку. Захват микрофона/камеры закрыт, разрешения не запрашиваются; текущий общий UI принимает готовые файлы. Background recording, offline AI, push и native продуктовые экраны не входят в объём.

Независимое read-only ревью выполнено GPT-6.1-Sol/high. Исправлены показ полного назначения внешней ссылки и канонические/числовые варианты loopback; исправления повторно проверены ревьюером. Блокирующих source findings нет. Порядок WebKit callbacks при cancel/target=_blank и остальные runtime-свойства требуют device smoke, review не заменяет приёмку.
