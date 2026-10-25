# Публичный HTTPS для IP: план и границы

Состояние на 25 октября 2026: production IP-сертификат выпущен, публичный HTTPS на 443 запущен и проверен с доверенной цепочкой. Реальный текстовый проход и [аудиопроход через публичный HTTPS](evidence/c-production/https-audio-results.json) прошли. Владелец подтвердил обычный вход и цель с событиями на физическом iPhone; импорт текста и аудио на устройстве ещё не проверен. Серверные действия выполнял интегратор; автор документа проводил research. Секреты и приватные ключи в Git не помещаются.

## Исходные условия

По результатам проверки, переданным интегратором C: публичный порт 80 занимает отдельный landing Node, наблюдавшийся PID `86916`, исходник `/srv/ryadom-hackathon/landing/current/server.mjs`; порт 443 был свободен. Это снимок проверки, перед любым bind требуется повторная проверка. PID не является разрешением завершать процесс.

Landing не принадлежит задаче C: останавливать, перезапускать или менять его без отдельного разрешения нельзя. Текущий UI C использует loopback 17073, API 18789. Действующая внешняя точка входа: `https://77.239.111.64/`, UI и `/api` через один origin; приложение C не изменено.

Интегратор получил явное согласие владельца: создать ACME-аккаунт без email и принять Let’s Encrypt Subscriber Agreement v1.8 для IP `77.239.111.64`. В пределах этого согласия выполнен production issuance. Повторное согласие на то же действие не требуется. Текст договора: [v1.8, 6 июля 2026](https://letsencrypt.org/documents/LE-SA-v1.8-July-06-2026.pdf).

## Фактически выполнено интегратором

| Проверка / объект | Результат |
|---|---|
| lego 5.5.2 в собственном `integration/https/tools` | Архив проверен по SHA-256, глобальной установки нет |
| ACME account без email, IP SAN, shortlived, TLS-ALPN-01 | Production issuance успешен |
| Сертификат и ключ | `/srv/ryadom-hackathon/integration/https/lego/certificates/77.239.111.64.crt` и `.key` |
| Issuer | YE1 |
| `notBefore` | `2026-10-25T11:48:09Z` |
| `notAfter` | `2026-11-01T03:48:08Z` |
| Публичная проверка с Mac | curl/OpenSSL: доверенная цепочка, проверка IP успешна, verify code 0 |
| Приложение через HTTPS | bootstrap: account initialized; API без авторизации: 401; release: `eba453c`, PASS |
| TLS proxy C | `https/proxy.mjs`, приватная `https/private.env`, `HTTP_ENABLED=0`, только публичный 443 |
| PID proxy при запуске | `87619`; актуальный источник для будущих операций: `https/proxy.pid`, не старое число из документа |
| Логи proxy | `https/logs/proxy.log`, внутри собственного каталога |
| Соседние процессы | landing на 80 сохранён; app PID `86315`/`86366` и STT PID `82144` при переключении не менялись |
| Автоматика продления | Не создана |

Публичный браузерный аудиопроход: PASS_FRESH_AUDIO, шесть проверок за 82,23 с, без повторных попыток. Обычный вход, существующий WAV-дубль, новый synthetic WAV с секундой тишины перед исходной речью, реальные STT/Gemini, точные цитаты и grounded таймкоды, confirm cv1→2, duplicate и reload. Это проверка desktop headless через публичную сеть, физический вход на iPhone проверяется отдельно.

## Основной вариант: lego и TLS-ALPN-01 на 443

Этот вариант позволяет сохранить landing и порт 80 без изменений. Let’s Encrypt разрешает проверять IP через TLS-ALPN-01 на публичном порту 443; DNS-01 для IP не подходит. Нужна реальная внешняя доступность 443, отсутствие другого TLS listener и неизменённый ALPN `acme-tls/1`. Во время первичного issuance порт временно занимает ACME-клиент, после завершения его занимает HTTPS-прокси C. [Let’s Encrypt: challenge types](https://letsencrypt.org/docs/challenge-types/).

Проверена официальная поддержка lego: IP identifier RFC 8738, TLS-ALPN-01 RFC 8737 и ACME profiles. Зафиксирован релиз **v5.5.2**. В v5 параметры issuance указываются после `run`; Common Name по умолчанию выключен. Не переносить старые команды v4 с `--tls.port` или `--disable-cn`. [Lego](https://go-acme.github.io/lego/), [CLI](https://go-acme.github.io/lego/references/ref-flags/index.html), [pinned flags source](https://github.com/go-acme/lego/blob/v5.5.2/cmd/internal/flags/flags.go).

Для Linux x86-64, только после проверки архитектуры:

- Архив: [lego_v5.5.2_linux_amd64.tar.gz](https://github.com/go-acme/lego/releases/download/v5.5.2/lego_v5.5.2_linux_amd64.tar.gz).
- SHA-256 архива: `2a35505089e7772c92e1e9ac144df91151ef2eca8568630db0ff91fca06d9bef`.
- Список: [lego_5.5.2_checksums.txt](https://github.com/go-acme/lego/releases/download/v5.5.2/lego_5.5.2_checksums.txt), его SHA-256 `5abf833aa9cad9f7049c73c521ffdffb06c5e10360bee933aee47866b798eb82`.
- Авторитетный источник указанных digests: [GitHub release assets](https://github.com/go-acme/lego/releases/expanded_assets/v5.5.2). Имя checksums-файла содержит `lego_5.5.2`, без буквы `v`.

Бинарник, загруженный архив, checksum и ACME storage размещать только в собственном каталоге C. Не копировать бинарник в `/usr/local/bin`, не использовать чужие аккаунты, env или библиотеки. Перед исполнением проверить SHA-256, затем локальные `--version` и `run --help`. Это ещё не issuance и не регистрация.

Ниже воспроизведение использованной интегратором команды. `HTTPS_ROOT=/srv/ryadom-hackathon/integration/https`, `LEGO="$HTTPS_ROOT/tools/lego"`; это пути существующей собственной среды. `env -i` исключает наследование чужих `LEGO_*` настроек. Команда `run` использует собственный аккаунт/storage и выпускает или продлевает сертификат по правилам клиента; её не следует повторять ради проверки уже работающего HTTPS. Для аккаунта без email используется собственный `--account-id` и пустой `--email`.

```sh
# При первоначальном выпуске или согласованном ручном продлении использовать только свободный 443.
env -i PATH=/usr/bin:/bin "$LEGO" run \
  --path "$HTTPS_ROOT/lego" \
  --server https://acme-v02.api.letsencrypt.org/directory \
  --accept-tos --account-id ryadom-ip --email '' \
  --domains 77.239.111.64 --profile shortlived \
  --tls --tls.address 0.0.0.0:443
```

`--accept-tos` принимает условия CA; разрешение на это уже передано интегратором. Профиль `shortlived` обязателен для IP-сертификатов Let’s Encrypt; срок составляет **160 часов**, фактические `notBefore/notAfter` нужно прочитать после выпуска. Staging использует другой ACME directory и выдаёт недоверенный сертификат. Успешный staging не заменяет production issuance и проверку доверия. [Срок действия](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability/).

По умолчанию lego сохраняет PEM `.crt` с цепочкой, `.key`, `.issuer.crt` и metadata `.json` в собственном storage. Не задавать `--no-bundle`: HTTPS-серверу нужна полная цепочка. Фактические `.crt`/`.key` текущего выпуска перечислены выше; private key не копируется в отчёты. Прокси читает только собственные PEM. [Документация lego](https://go-acme.github.io/lego/index.print.html).

После успешного issuance интегратор запустил только собственный TLS listener C. Он проксирует `/` в UI 17073, `/api` в API 18789 со снятием префикса `/api`; proxy передаёт auth/cookies/raw audio и выставляет HTTPS forwarding context. [Публичный audio-проход](evidence/c-production/https-audio-results.json) проверен. Занятый landing port 80 не перенаправляется и не замещается.

Интегратор добавил TLS-only запуск: `HTTP_ENABLED=0` отключает HTTP listener. Поэтому действующий proxy не пытается занять порт 80. Собственная копия proxy и её private.env расположены внутри `integration/https`; их фактические пути передаются оператору C, приватное содержимое здесь не раскрывается.

## Резерв: HTTP-01 через владельца landing

Если TLS-ALPN-01 недоступен, нужен владелец существующего listener 80. Менять firewall/NAT, перехватывать порт, завершать PID или перенаправлять весь landing в рамках этого плана нельзя. HTTP-01 проверяется CA только через публичный 80; `--http-01-port 18080` не меняет порт обращения CA. [Let’s Encrypt](https://letsencrypt.org/docs/challenge-types/).

Предлагаемая делегация:

1. C подготавливает собственный challenge-only listener `127.0.0.1:18080`, предварительно проверив свободный порт. Он отдаёт только обычные token-файлы из собственного webroot и не проксирует приложение.
2. Владелец landing по отдельному согласованию делегирует только `GET`/`HEAD /.well-known/acme-challenge/<TOKEN>` на жёстко заданный `127.0.0.1:18080`. Token: ASCII `[A-Za-z0-9_-]`, до 128 символов, без `/`, `.`, percent-decoding или обхода каталога. Остальные маршруты landing сохраняются.
3. Делегация не передаёт пользовательские cookies/auth в challenge listener, не принимает произвольный upstream, имеет короткий timeout и не становится открытым proxy. При отсутствии token возвращается 404, при недоступности C возвращается ошибка, без подмены landing-контентом.
4. До ACME-аккаунта C и владелец проверяют синтетический token с внешней точки: точные bytes, GET/HEAD, invalid token/метод/ traversal, отсутствие доступа к `/api` через listener 18080, прежнее поведение остальных landing routes.

Текущий Node proxy C можно адаптировать: отдельный HTTP bind `127.0.0.1`, HTTP port 18080, отдельный TLS bind на публичном 443. Один общий `BIND_HOST` недостаточен для такой границы. Разделение listeners и делегация landing являются предложениями; в рамках документирования они не выполнялись.

Альтернатива делегации: владелец landing сам отдаёт ограниченные challenge-файлы из явно согласованного webroot. Это требует минимального доступа только к challenge-пути; C не получает права записи в произвольные файлы landing. Выбор владельца нужен до изменения его listener.

## Certbot 5.8.0 для резервного webroot

Для IP через webroot нужен Certbot 5.4 или новее; зафиксировать **5.8.0**, Python >=3.10, имеющийся Python 3.12 совместим. Инструмент установить через uv в собственную `.venv`, dependency `certbot==5.8.0`, собственный `uv.lock` и cache. Не устанавливать системные пакеты. [Официальный пример LE](https://letsencrypt.org/2026/03/11/shorter-certs-certbot), [PyPI](https://pypi.org/project/certbot/5.8.0/).

Параметры issuance после рабочей делегации: `certonly --webroot --webroot-path "$HTTPS_ROOT/acme" --ip-address 77.239.111.64 --preferred-profile shortlived`; дополнительно собственные `--config-dir`, `--work-dir`, `--logs-dir`. Без email: `--non-interactive --register-unsafely-without-email --no-eff-email`; флаг without-email совместим с 5.8.0, но с non-interactive уже необязателен. `--agree-tos` допустим в пределах полученного согласия. [Certbot CLI](https://eff-certbot.readthedocs.io/en/stable/using.html), [changelog](https://github.com/certbot/certbot/blob/v5.8.0/certbot/CHANGELOG.md).

Три directory-флага не исключают чтение глобальных `cli.ini`. Для строгой изоляции pinned 5.8.0 допустим собственный тонкий wrapper: до создания parser установить `certbot._internal.constants.CLI_DEFAULTS['config_files'] = []`, затем вызвать публичный `certbot.main.main()`. Это использование внутренней настройки, поэтому pin обязателен; при обновлении клиента повторно проверить исходник и offline help. [Defaults](https://github.com/certbot/certbot/blob/v5.8.0/certbot/src/certbot/_internal/constants.py), [parser](https://github.com/certbot/certbot/blob/v5.8.0/certbot/src/certbot/_internal/cli/helpful.py), [публичный entry point](https://github.com/certbot/certbot/blob/v5.8.0/certbot/src/certbot/main.py).

```sh
# Пример изолированного запуска собственной установленной копии; help не создаёт аккаунт.
"$HTTPS_ROOT/tooling/.venv/bin/python" -I -c \
  'from certbot._internal import constants; constants.CLI_DEFAULTS["config_files"] = []; from certbot.main import main; raise SystemExit(main())' \
  --help
```

Прямой Python ACME не является быстрым запасным CLI: библиотека содержит TLSALPN01 primitives, но потребует собственного responder, управления аккаунтом/order/CSR/profile и тестов. При доступном lego это лишняя реализация. [ACME Python API](https://acme-python.readthedocs.io/en/latest/api/challenges.html).

## Проверка и срок эксплуатации

Публичные trust/IP/scope/release проверки выполнены интегратором и [независимым помощником](evidence/c-production/https-independent.json). Обычный вход, refresh-cookie/reload, текстовый импорт, raw audio и exact quote через публичный HTTPS прошли; [результат аудио](evidence/c-production/https-audio-results.json). Владелец подтвердил обычный вход и отображение цели с событиями на физическом iPhone. Импорт текста/аудио на устройстве пока NOT_RUN. Ширина viewport и desktop-браузер его не заменяют.

Cron/systemd timer/фоновая автоматика не создавались. Текущий сертификат истекает **1 ноября 2026 в 03:48:08 UTC, 06:48:08 МСК**; без продления после этого времени доступ перестанет быть доверенным. Для длительной работы понадобится отдельное решение renewal.

Ручное продление требует короткого согласованного окна недоступности только HTTPS:

1. Проверить PID из собственного `https/proxy.pid` и его принадлежность собственной `https/proxy.mjs`; не использовать наблюдавшийся ранее `87619` без проверки. Подготовить фактическую команду перезапуска с собственной Node и `https/private.env` до остановки.
2. Завершить только этот собственный proxy штатным SIGTERM и убедиться, что 443 освободился. Landing, приложение 17073/18789, MCP и STT не останавливать.
3. Выполнить приведённую выше `lego run` с тем же собственным storage/account/profile; без `--renew-force` и без глобальных изменений. Если сертификат ещё не требует продления, клиент может сохранить текущий; exit 0 сам по себе не доказывает новый `notAfter`.
4. Проверить результат и в любом случае восстановить собственный TLS proxy с `HTTP_ENABLED=0` и последней корректной парой PEM. При ошибке issuance не затирать ранее работавшие PEM. Проверить новый PID, trust/IP/сроки, `/release.json`, API 401 и сохранность landing.

ALPN-aware multiplexing в текущей схеме не заявлен. Один reload-hook не освобождает 443 для lego. Для резервного webroot renewal нужна сохранённая делегация landing; после нового сертификата reload только конкретного собственного TLS PID. [Lego hooks](https://go-acme.github.io/lego/references/ref-flags/index.html), [Certbot deploy hooks](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).

При неуспехе сохраняются landing, loopback UI/API и исходный способ SSH tunnel. Откат касается только созданного C TLS listener и собственных файлов; чужие процессы и общесерверная конфигурация не меняются.
