# Приёмка выпуска «Рядом»

25 октября 2026, около 15:12 МСК. A, ветка `codex/qa-release`.

**Приёмка A выполнена на общем кандидате `ef360ae0627e35ddfe615143b5409690ac222ed8`.** Source-build, настоящий текст, аудио, desktop/mobile, restart и отдельный restore проверены. Аудио принято по последовательной цепочке доказательств с меткой **DIAGNOSTIC_RECOVERY_PASS**: два первоначальных FAIL сохранены, чистый audio E2E PASS задним числом не заявляется.

Base A: `484c396e71b3fbfe2ff65c04f6260e1899aa6bd1` integration-ui с 92cb8bc. Packaging export driver A `7f79d255b175432685e9f1cf099489ceda0cb091`. Latest C на момент сверки — `f875d3df976688cf9aafe23612fcaa3f459dcdc3`, содержит A7f; сравнение GitHub ef→f875 не меняет product backend/frontend/STT/source runtime, добавляет docs/evaluation/demo/packaging driver. Запущенный и принятый runtime SHA — именно ef360ae.

## Общий кандидат и сервер

| Проверка | Результат | Доказательство |
|---|---|---|
| Clean source-build ef360ae | PASS | Backend/MCP/frontend npm ci/build и web typecheck, exit0; Linux/x64, официальный scoped Node22.21.1; manifest `2026-10-25T11:47:10.783Z` |
| Точная идентичность source | PASS | Git commit/tree/blob hashes проверены; archive SHA256 `436ae171af5f5b3d400c18f2c83d6b462282f5262252f289a08a34eef034fa47`; export включает app/scripts/contracts/STT source+uv.lock/corpus/evaluation |
| Production запуск | PASS | Отдельный A instance, один gateway и три MCP подтверждены по children; static frontend, без Vite/upstream app images/auto-update |
| Health/auth/source smoke | PASS | React entrypoint, release.json с ef SHA, direct+proxy health200, bootstrap200, anonymous goals401 |
| Live text UI | PASS | 14:52 МСК, `/private/tmp/ryadom-source-ef-text.json`,1/1: русский signup/logout/wrong-password/login, три критерия, Gemini intention/action, exact quote, confirm1, duplicate1, reject0, reload,1440/390px |
| Реальное аудио через UI | DIAGNOSTIC_RECOVERY_PASS | Actual upload HTTP200, новый audio source/hash/createdAt, настоящий transcript503UTF16/9segments,3 события; отдельное продолжение UI без upload проверило все quotes/timecodes и confirm. Оба ранних FAIL сохранены; подробности ниже |
| Restart после audio confirm | PASS | Реальный stop85650→start86652 того же instance/master key; smoke и обычный UI login,1/1 resume, точное состояние 5events/3sources/counts1/0/0 на desktop/mobile |
| Backup включает state.json | PASS | Остановленный собственный gateway;49files, `hackathon/state.json`, inventory/checksums, secrets store исключён |
| Restore в новую synthetic копию | PASS | Новый `instances/restored-ef/memory`; state SHA256 `37e63c830b1672d40b4a97197a575adcc48d4870b4de255472611fb53ecb4bfb`, байты совпали до и после UI проверки; original memory сохранена |
| UI восстановленной копии | PASS |1/1 resume: ordinary login, IDs/revisions/status/counts/quotes/source kinds/timecodes совпали на 1440/390px; provider calls/reviews/uploads не выполнялись |
| STT source/health | PASS | B localhost19000 ready/base/ru; STT source+uv.lock совпали с C source. B service не менялся |
| Секреты в frontend assets | PASS |13 built assets,0 совпадений с actual LLM/STT/master values; значения env в evidence не включены |

Release: `/srv/ryadom-hackathon/agent-a/releases/ef360ae`. Сейчас работает отдельный восстановленный instance `/srv/ryadom-hackathon/agent-a/instances/restored-ef`, env `release-restored-ef.env`, historical supervisor86778. Актуальный PID читать из runtime.json. Original `full-ef` остановлен и сохранён. UI127.0.0.1:15073, gateway127.0.0.1:18787, MCP18911–18913 только loopback. B/C процессы не перезапускались.

## Цепочка аудиодоказательств

Synthetic Git WAV: Windows Irina TTS,50.626875 с,mono16kHz PCM16, SHA256 `889c89021c3a64f384a6056a7307b32faae3394dbae44882d5109561359b1577`; микрофон/личные записи не использовались. Пользователь отдельно разрешил token B→A и WAV через A UI→B STT, transcript→Gemini и test confirm. Автоматические отклонения до разрешения не запускали команды.

1. `/private/tmp/ryadom-source-ef-audio.json` — **FAIL**. UI показал ошибку, Chrome inspector потерял response body. Сервер сохранил только 2text sources/2events/counts0/0/0, partial audio commit отсутствует. Точная причина исходного provider/UI сбоя не установлена. Отчёт не переименован в успешный.
2. Отдельная **non-mutating** диагностика теми же ef providers: STT200 за 10.37 с,503UTF16/9segments; Gemini200,4grounded events; domain state unchanged. Это диагностика стадий, не UI gate и не provider fallback.
3. `/private/tmp/ryadom-source-ef-audio-retry.json` — **FAIL harness**, хотя actual audio POST получил HTTP200. Inspector снова потерял body; duplicate=false/PATCH тогда не проверялись, confirm не выполнялся. Это единственный bounded upload retry.
4. Read-only own-state audit: ровно новый audio source `0074bcea-8532-455b-8641-da1420cc9cc9`, createdAt `2026-10-25T12:03:49.647Z` внутри retry window, hash совпал с WAV,9segments/3new events, все quotes grounded. До этого источника в памяти не было. По ef ingestion source коммитится только после настоящих transcribe→extract→validate; ранний dedup возвращает старый source/createdAt. Свежесть доказана этим audit, а не неисполненным duplicate assertion.
5. `/private/tmp/ryadom-source-ef-audio-recovery.json` — **DIAGNOSTIC_RECOVERY_PASS**,12:06:18–28UTC. Обычный вход,0audioPOST, все 3source quotes/times на desktop/mobile: cv action4980–9220 мс, mock action13720–19320 мс, feedback intention32380–38380 мс. Подтверждён только cv action, actual PATCH exactID/revision1→2, server progress1/0/0, reload сохранил состояние.
6. `/private/tmp/ryadom-source-ef-restart.json` и `-restore.json` — **PASS1/1** каждый. Один и тот же checkpoint5events, включая подтверждённое audio evidence, проверен после настоящего restart и на новой restored памяти.

Inspector cache defect в future harness исправлен пассивным `fetch().clone()` observer: original request/response не изменяются, headers/auth не наблюдаются. Локальный HTTP regression с generated silent WAV1,600,044bytes PASS; typecheck PASS. Свежий live audio gate с новым reader **NOT_RUN**; функциональная приёмка выше основана на сохранённой цепочке реальных действий, без нового upload ради зелёного теста.

## Автоматические и отрицательные проверки

| Область | Результат | Область доказательства |
|---|---|---|
| Общий ef backend | PASS327/327,12files | Goals/context/STT/auth/config/integration, test providers. Source550files неизменны, dependency manifest/lock совпали |
| Frontend unit | PASS226/226 на C4ac | Runtime/unit/config/dependencies ef идентичны C4ac; отличаются только release E2E specs. Новый полный unit run ef не заявлен |
| MCP | PASS6/6 | Исходная A база, отдельный suite |
| Persistence guards | PASS | Real GoalsStore, reload/new Node process, statuses confirmed/rejected/proposed, revisions/progress; existing export содержит state; checksum/path/traversal/symlink/overlap/overwrite guards; clean demo в новом root |
| Packaging regressions | PASS3+2+1 | Static edge/env/auth isolation, real exported frontend typecheck/Docker COPY dependencies, optional STT paths |
| Browser protocol-fake | PASS6/audio1skip | Последний `/private/tmp/ryadom-release-browser-fake-final.json`: timeout/503/invalid JSON/conflict/stt_unconfigured без ложного success/progress; настоящий gateway/JWT/store, тестовый provider |
| Audio observer regression | PASS | `/private/tmp/ryadom-audio-observer-regression.json`: local HTTP only, payload>1MiB, original JSON/header unchanged, auth GET не captured; не STT/Gemini |
| Полный исторический backend suite | FAIL411PASS/3FAIL из 414 | Baseline starter-pack lint19issues и два sandbox loopbackEPERM. Отдельный разрешённый bridge rerun20PASS; полный suite зелёным не объявлен |
| Docker runtime/STT topology | NOT_RUN | Docker Engine отсутствует локально/на сервере. Реально принят source runtime |

## История и ограничения

- `f0b849b` clean source-build FAIL: exporter пропустил root docs/contracts fixture. Failed release сохранён; f93536d исправил export/Docker context/file dependency, regression2PASS. Новый C собирался отдельно без патча source files.
- `f93536d` production text/restart/backup49/isolated restore/UI PASS — предыдущий проверенный rollback baseline. Его результаты не подменяют ef.
- C4ac source-build PASS, initial main FAIL502/provider_failed; один UI retry сохранён как DIAGNOSTIC_RECOVERY_PASS. Реальный rollback C4ac→f935 и forward→C4ac на той же A памяти PASS health/identity/UI/checkpoint. Первый слишком ранний smoke при forward не подключился; после READY повтор PASS, дополнительного restart не было.
- Реальный provider иногда ошибается; исходные FAIL сохранены, автоматического fallback нет. STT сериализует inference и возвращает busy при занятом heavy.lock. Ошибки не создают partial source/progress.
- Frontend build имеет warning bundle>500kB. Git SSH intermittent; точные C объекты читались через GitHub API с проверкой hashes.
- Комплект защиты C:4HTML-слайда/сценарий прочитаны, MIT/OSS указан. Опубликован text WebM с metadata COMPLETED_TEXT38 с на ef; полный просмотр A, трёхминутный audio/text backup и человеческие репетиции **NOT_RUN**. Приёмка A не объявляет эти материалы проверенными.

Безопасная сводка: [common-c-summary.json](evidence/common-c-summary.json), историческая [source-f935-summary.json](evidence/source-f935-summary.json). Полные отчёты и synthetic checkpoints вне Git; trace/screenshots/video release-тестов отключены. Команды export/build/launch/smoke/restart/rollback/backup/restore: [RUNBOOK](RUNBOOK.md); browser runner: [browser-README](../../scripts/release/browser-README.md). Memory backup исключает secret store/master key/env; собственные synthetic secrets подключались отдельно приватной копией.
