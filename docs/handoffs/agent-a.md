# Agent A: цели, память и проверяемый прогресс

Статус на 25 октября 2026, 13:14 МСК: модуль готов к подключению интегратором. Ветка `codex/goals-core`; реализация соответствует стартовому API v1. Изменены только `app/builds/typescript/features/goals/**` и этот handoff. Общий контракт, gateway, контекст, frontend, manifests и lockfiles сохранены.

## Коммиты и SHA

- Общая стартовая точка `main` и всех трёх рабочих веток, проверенная до начала работы: `c67fe77fd2f40237a96b8a0390ff676536c691fc`.
- Первый опубликованный рабочий модуль: `589b4ec7b58fb31a05404ab86dec3fd407515c87` — atomic store, валидация, цели, импорт, review, прогресс, маршруты; сборка и первые 50 тестов прошли.
- Итоговый коммит реализации: **`3d1b7b76af9da7bbd94cbac2191ff2c838a82dca`** — HTTP regression tests, локальная обработка parsing errors, защита гонок редактирования/импорта и review; итоговые 79 тестов прошли.
- Этот handoff добавлен отдельным документационным коммитом после проверенного коммита реализации. Его SHA доступен через `git log -1 origin/codex/goals-core` после получения ветки; SHA реализации выше однозначно фиксирует весь проверенный код.

## Экспорты и подключение

Файл `app/builds/typescript/features/goals/index.ts` экспортирует:

```ts
createGoalsStore(options: { memoryRoot: string }): Promise<GoalsStore>
registerGoalsRoutes(app: FastifyInstance, deps: { store: GoalsStore }): Promise<void>
// Дополнительно re-export type ContextStore, GoalsStore из общего контракта.
```

Интегратор один раз создаёт store под memoryRoot пользователя, передаёт тот же экземпляр модулю B как `ContextStore` и регистрирует A-маршруты после существующих BrainDrive auth hooks. Регистрацию в gateway агент A не менял.

Реализованы все шесть маршрутов:

- `PUT /goals/:goalId` → `{ goal }`;
- `GET /goals/:goalId` → `{ goal }`;
- `GET /goals/:goalId/evidence` → `{ evidence }`;
- `GET /goals/:goalId/progress` → `{ progress }`;
- `GET /sources/:sourceId` → `{ source }`;
- `PATCH /evidence/:evidenceId` → `{ evidence }`.

Каждый маршрут вызывает существующий `authorize(request.authContext, "memory_access")`. Отсутствие разрешения или authContext даёт `403 { error: { code: "forbidden", message: "Недостаточно прав" } }`. Ответ 401 существующего upstream auth middleware не меняется. Parsing errors переводятся в общий формат через route-level errorHandler, не затрагивающий чужие маршруты. При неожиданной ошибке хранилища возвращается 500 `internal_error` с безопасным сообщением, без путей и деталей исключения.

## Реализованные инварианты

- GoalWrite, SourceDraft, EvidenceDraft, review payload и snapshot проходят runtime-проверки Zod. Пустые criteria, повторные criterion ID, нули/дроби/небезопасные числа, неизвестные поля и некорректные даты отклоняются. `targetCount` — положительное безопасное целое, включая `Number.MAX_SAFE_INTEGER`; искусственный маленький лимит не добавлен.
- Новая цель требует `expectedRevision: null`, получает revision 1. Изменения и review требуют актуальной revision; no-op не увеличивает её. `confirmedAt` задаётся сервером. Первый успешный импорт, в том числе без evidence, блокирует изменение всей цели; идентичный PUT с актуальной revision допустим.
- Snapshot: `<memoryRoot>/hackathon/state.json`, version 1, массивы goals/sources/evidence. Пользовательские ID используются только как данные. При загрузке проверяются схема, уникальность ID, связи и цитаты; повреждённое состояние приводит к ошибке запуска store и не затирается пустым snapshot.
- Одна очередь сериализует все mutations. Изменение готовится на копии, записывается во временный файл с mode 0600, синхронизируется и публикуется через atomic rename. Live state меняется только после успешной записи. Ошибка не отравляет очередь. Читающие операции ждут предшествующие mutations; выдаваемые объекты клонируются.
- `commitImport` перепроверяет цель, revision, criterionId, точную цитату и UTF-16 offsets. Source и весь набор evidence сохраняются вместе. Невалидное предложение отклоняет импорт целиком. Смена/отзыв подтверждения цели во время обработки возвращает `goal_changed`; актуальная неподтверждённая цель — `goal_unconfirmed`.
- SHA-256 текста перепроверяется по `kind + NUL + UTF-8 text`. Важно для B: **разделитель — один нулевой байт**, что проверено на хеше общего demo fixture. Принятый текст не нормализуется. Заголовок и capturedAt не участвуют в хеше.
- Параллельные и повторные импорты одной цели/хеша возвращают один набор ID и актуальные confirmed/rejected/disputed. Первый title/capturedAt сохраняется. Одинаковый материал для другой цели импортируется отдельно.
- Одинаковые предложения внутри импорта дедуплицируются по критерию и диапазону. Разные eventType для одного критерия/диапазона отклоняются. Начальный eventKey — SHA-256 JSON-массива `[sourceId, criterionId, textStart, textEnd]`.
- Начальный status всегда proposed, revision 1. Через импорт нельзя передать review status. Только completed_action может стать confirmed. Rejected/disputed уменьшают счётчик. Ручной дубль допустим лишь в одной цели и одном критерии, не подтверждает действие автоматически.
- Прогресс пересчитывается по уникальным eventKey confirmed + completed_action. confirmedCount не ограничивается targetCount; complete вычисляется. В evidenceIds — первая подходящая confirmed-запись каждого eventKey. nextStep — первое незавершённое условие и оставшееся количество, `kind: "rule"`; полностью завершённая цель получает null.
- Для audio time references принимаются только существующие границы переданных STT segments. При отсутствии segments время остаётся null; текстовые источники не могут иметь segments/timecodes. Raw audio не сохраняется модулем A.

## Проверки и результаты

Команды из корня репозитория:

```sh
npm --prefix app/builds/typescript run build
npm --prefix app/builds/typescript test -- features/goals
npm --prefix app/builds/typescript test
npm --prefix app/builds/typescript test -- desktop/bridge.test.ts --silent
git diff --cached --check
```

| Проверка | Фактический результат |
|---|---|
| Финальная TypeScript backend build | PASS, exit 0 |
| `features/goals` | PASS: 3 файла, **79 тестов**, exit 0 |
| Полный backend test suite | 27 файлов: 25 passed / 2 failed; 256 тестов: 253 passed / 3 failed |
| Повтор `desktop/bridge.test.ts` с разрешённым localhost | PASS: **20/20**; две ошибки `listen EPERM 127.0.0.1` первого запуска были ограничением песочницы |
| `memory/starter-pack-draft3-layout.test.ts` на чистом стартовом SHA | FAIL: тот же один тест, **19 исходных lint errors**, exit 1; воспроизведено в отдельной временной распаковке `git archive c67fe77...` без модуля A |
| Whitespace/staged diff | PASS; существующих активных git hooks и core.hooksPath в checkout не обнаружено, обход hooks не использовался |

Оставшийся общий failure относится к исходным starter-pack шаблонам: описания optional overlays для career/finance/fitness/new-project/relationships и правила размещения артефактов. Чужие шаблоны не редактировались. Полный backend suite не объявляется зелёным.

Тесты A проверяют: intention/obstacle/uncertain нельзя подтвердить; optimistic revisions; параллельные изменения цели и evidence; повторный и восемь одновременных импортов; review одновременно с повтором импорта; goal lock; потерю актуальности extraction snapshot; дубли и ручное объединение; падение счётчика; rollback при ошибке rename и восстановление очереди; reload; точные цитаты и UTF-16; STT boundaries; все шесть маршрутов и авторизацию; parsing/validation errors; отсутствие утечки пути при ошибке записи. Все данные синтетические и хранятся во временных каталогах тестов.

Локальное окружение: Node `v24.22.1` из bundled Codex runtime, npm `11.6.2` во временной папке. `npm` отсутствовал в обычном PATH; фактические запуски использовали:

```sh
PATH=/Users/egorturluchev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  node /private/tmp/hse-agent-a-tools/package/bin/npm-cli.js run build
# cwd: app/builds/typescript; для тестов заменить run build на test -- features/goals.
```

Зависимости установлены `npm ci --ignore-scripts` по имеющемуся lockfile; package.json/lockfiles не изменились. Сетевых LLM/STT запросов для A не требовалось.

## Ограничения и следующая интеграция

1. Как и в API v1, поддерживается **один экземпляр store в одном процессе gateway**, без межпроцессной блокировки/репликации. Интегратор должен передать один store обоим модулям.
2. Для audio core не может пересчитать хеш исходных байтов: ContextStore получает только расшифровку и segments. B отвечает за hash `audio + NUL + originalBytes`; A проверяет формат хеша, цитаты и временные ссылки.
3. Ручной merge по контракту меняет eventKey **только текущей записи**. Это не транзитивное объединение целых групп. При нескольких дублях UI должен выбирать один постоянный опорный evidence ID; смена опоры цепочкой A→B→C не обещает автоматического переноса всей группы.
4. Проверена работа A через отдельный Fastify instance с имитацией upstream auth. Подключение к реальному gateway, совместный запуск с B, реальные provider/STT и браузерный проход остаются интегратору.
5. Блокирующих изменений общего контракта не требуется. Source/Evidence IDs генерирует только core. Итоговый nextStep детерминирован и честно помечен rule.

Помощник 1 изменял только progress.ts/progress.test.ts. Помощник 2 делал read-only review store/гонок и нашёл parsing error gap; он исправлен и покрыт HTTP regression tests. Внешние сообщения и изменения инфраструктуры не выполнялись.
