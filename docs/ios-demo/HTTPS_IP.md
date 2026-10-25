# HTTPS на публичном IP для iPhone

Запрошенный владельцем адрес: `77.239.111.64`. Домен для него не обязателен: Let’s Encrypt выпускает сертификаты с IP SAN. Это предложение интегратору C, **не отчёт об установленном HTTPS**. Общие серверные настройки iOS-ветка не меняет.

Проверка с Mac 25 октября 2026 около 14:14 МСК: `curl -I http://77.239.111.64/` → `Empty reply from server`; `curl -I https://77.239.111.64/` → `SSL_ERROR_SYSCALL`. Это не определяет занятость портов внутри сервера или причину ошибки; нужно проверить сервер и сетевой путь. Проверка с iPhone ещё `NOT_RUN`.

Повтор 15:26 МСК: пользователь показал на физическом iPhone экран ошибки TLS. С Mac `curl` снова `SSL_ERROR_SYSCALL`, `openssl s_client` → `unexpected eof while reading`, `no peer certificate available`, прочитано 0 байт TLS. Сертификат не был передан; проверка его сроков/SAN пока невозможна. Свежий статус C сообщает активные loopback UI17073/gateway18789 и candidate `eba453c`, доступный ноутбуку через SSH tunnel; публичный HTTPS в этот выпуск C пока не включён. Шаблон ниже соответствует этим портам, однако его установку согласует и проверяет владелец среды.

## Что требуется от интегратора

1. Проверить существующие listener на 80/443, reverse proxy и фактический запуск **нашего** web-кандидата. Не останавливать чужой сервис ради выдачи сертификата.
2. Подтвердить UI и gateway loopback-порты. В `SHARED_SERVER.md` для C **зарезервированы**, но не подтверждены `17073` и `18789`. В шаблоне ниже они использованы как план; перед применением заменить фактическими.
3. Опубликовать UI и API под одним origin `https://77.239.111.64/`: `/api/auth/login` должен идти в gateway `/auth/login`. Так работает rewrite существующего `vite.config.ts`. Вход остаётся обычным, без local-owner обхода и без ключей в клиенте.
4. Получить доверенный сертификат именно на IP, проверить TLS с iPhone. Самоподписанный сертификат, staging CA, исключения ATS и отключение TLS-проверки для показа не использовать.
5. Записать SHA web/backend, endpoint, STT readiness и результат входа/импорта. Передать владельцу iOS, не публикуя credentials.

## Вариант Nginx + существующий Certbot

[Шаблон Nginx](https/ryadom-ip.nginx.conf.example) содержит единый origin, ограничение тела 12 MiB (общий UI всё равно ограничивает файл 10 MiB), проксирование API без буферизации и доверенный `X-Forwarded-Proto: https`. Заголовки клиента перезаписываются proxy. Gateway/UI остаются на loopback.

Шаблон не применялся и не проходил `nginx -t` на сервере. Интегратор сначала проверяет существующий proxy, путь сертификата, порты, обычную авторизацию и поддержку SSE. Новые глобальные компоненты в рамках iOS-задачи не устанавливались. Если Nginx/Certbot отсутствуют, способ установки и изменение общего listener определяет владелец среды.

До первого сертификата TLS-блок не включать: отсутствующие PEM-файлы сломают проверку Nginx. Сначала в существующем HTTP-listener открыть только `/.well-known/acme-challenge/` с webroot из шаблона; остальное можно отвечать `503`. Уже работающие listener не заменять вслепую. Для IP-проверки нужен публично доступный HTTP challenge на порту 80.

```bash
# Проверить версию установленного Certbot; для IP webroot нужна 5.4+.
certbot --version
# Получить тестовый НЕдоверенный сертификат отдельным именем после настройки HTTP challenge.
certbot certonly --staging --cert-name ryadom-ip-staging \
  --preferred-profile shortlived --webroot \
  --webroot-path /srv/ryadom-hackathon/integration/https/acme \
  --ip-address 77.239.111.64
# После успешного challenge получить доверенный сертификат; условия CA принимает владелец.
certbot certonly --cert-name 77.239.111.64 \
  --preferred-profile shortlived --webroot \
  --webroot-path /srv/ryadom-hackathon/integration/https/acme \
  --ip-address 77.239.111.64
# Проверить конфигурацию перед согласованным graceful reload существующего Nginx.
nginx -t
```

Команды выполняет интегратор на тестовом сервере после проверки текущей среды; здесь они не запускались. Certbot может запросить согласие с условиями и данные ACME account — владелец выполняет этот шаг сам. Без флага `--staging` используется публичный CA с rate limits. Сертификат IP shortlived действителен 160 часов; для дальнейшей эксплуатации нужны автоматическое продление и deploy-hook graceful reload Nginx. Наличие таймера и реальное продление проверить отдельно. Не использовать `--standalone`, если это потребует остановить общий web-listener.

## Проверка перед подключением оболочки

```bash
# Проверить обычный TLS и HTML без обхода проверки сертификата.
curl --fail --head --connect-timeout 5 --max-time 15 https://77.239.111.64/
# Проверить, что API доступен через тот же HTTPS origin; тело не содержит credentials.
curl --fail --connect-timeout 5 --max-time 15 https://77.239.111.64/api/auth/bootstrap-status
```

После этого открыть адрес на iPhone в Safari через сеть показа, пройти обычный вход и текстовый сценарий. Даже успешный `curl` на Mac не подтверждает доступ с iPhone и работу модели. Затем в ignored `clients/ios-demo/Config/Local.xcconfig` указать:

```xcconfig
RYADOM_APP_URL = https:/$()/77.239.111.64/
```

Пересобрать и подписать оболочку. Cookie сессии сохраняются в постоянном `WKWebsiteDataStore`, но фактическое восстановление нужно проверить на живом gateway после закрытия приложения.

Источники: [Let’s Encrypt: IP certificates, 15.01.2026](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability), [Certbot IP/webroot support, 11.03.2026](https://letsencrypt.org/2026/03/11/shorter-certs-certbot). Поддержка IP webroot требует Certbot 5.4+, сертификат вручную подключается в webserver config.
