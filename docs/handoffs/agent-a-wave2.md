# A — проверенный выпуск и приёмка

25 октября 2026 около 15:15 МСК. **Поручение A выполнено** на общем C `ef360ae0627e35ddfe615143b5409690ac222ed8`: clean source-build, реальный text/audio, desktop/mobile, restart, backup и новая synthetic restore. Audio принят с **DIAGNOSTIC_RECOVERY_PASS**, оба первоначальных FAIL сохранены. Полный журнал: [ACCEPTANCE](../release/ACCEPTANCE.md).

## Что передаётся

- Ветка `codex/qa-release`, base `484c396e71b3fbfe2ff65c04f6260e1899aa6bd1` integration-ui с 92cb8bc; обычные scoped commits, без force/reset/чужих веток.
- Ready driver `7f79d255b175432685e9f1cf099489ceda0cb091`; frozen harness `59041cc9cf71d3ac3e5d3ab0e2e89725eb26d2f0`. C f875 уже содержит driver A7f; следующие specs/evidence/docs передать обычным merge qa-release.
- Packaging под `app/installer/hackathon`, builders/launchers/backup/restore и отдельный release Playwright runner под `scripts/release`, два release specs, acceptance/runbook/limitations/evidence. Goals-core изменений не потребовал.
- UI/gateway/context/contracts/manifests не менялись. Brand output и чужая память сохранены. Пароли/ключи/private env/runtime memory/node_modules не включаются в Git.

## Проверенный runtime

Source release `/srv/ryadom-hackathon/agent-a/releases/ef360ae`. Архив SHA256 `436ae171af5f5b3d400c18f2c83d6b462282f5262252f289a08a34eef034fa47`; build manifest11:47:10UTC, Linux/x64 официальный scoped Node22.21.1. Git objects проверены hashes, app source не патчился. В export включены STT source+uv.lock, synthetic corpus и evaluation. Backend/MCP/frontend ci/build/typecheck exit0.

Сейчас работает отдельная restored копия `instances/restored-ef`, env `release-restored-ef.env` mode600. Historical PID86778 только для evidence; перед управлением читать runtime.json. Original full-ef сохранён/остановлен. Один gateway+три MCP, static frontend edge, без Vite/upstream app images/auto-update. UI127.0.0.1:15073, gateway127.0.0.1:18787, MCPloopback18911–18913. Health/auth/release smoke PASS. B/C не перезапускались.

STT B localhost19000 ready/base/ru, deployed public source/uv.lock совпали с C. Передан только STT_AUTH_TOKEN в private A с прямого разрешения пользователя. Отдельное разрешение на synthetic WAV→UI→STT B→Gemini/confirm получено; автоматически отклонённые команды до этого не запускались.

Latest C f875d3df976688cf9aafe23612fcaa3f459dcdc3 при read-only API compare содержит A7f и не меняет ef product/runtime/STT code. Он добавляет docs/evaluation/harness/demo и export driver; принятый runtime SHA остаётся ef, запуск f875 не заявляется.

## Приёмка и сохранность

- Live text main PASS1/1: обычная русская авторизация, три критерия, намерение 0, действие/exactquote, confirm1, duplicate1, reject0, reload,1440/390px.
- Audio first FAIL не создал partial state; единственный retry получил HTTP200 и свежий audio source, но inspector body cache прервал harness. Сохранены оба FAIL. Audit source/hash/createdAt/new IDs/9real segments подтвердил свежесть; отдельное UI-продолжение без upload открыло все 3quotes/timecodes, подтвердило cv action revision1→2 и progress1/0/0, затем reload PASS. Итог DIAGNOSTIC_RECOVERY_PASS; чистый audio E2E задним числом не заявлен.
- Real post-audio restart PASS1/1 UI resume: точный checkpoint5events/3sources/1confirmed/counts1/0/0, все source IDs/quotes/status/timecodes на desktop/mobile.
- Backup49files включает hackathon/state.json; restore только в новый synthetic root. State SHA256 `37e63c830b1672d40b4a97197a575adcc48d4870b4de255472611fb53ecb4bfb`, байты совпали до/после restored UI resume PASS1/1. Own synthetic secrets подключены отдельной приватной копией, не memory backup.
- Предыдущий f935 production text/restart/restore PASS. C4ac initial text FAIL502/provider_failed сохранён отдельно от recovery. Реальный rollback C4ac→f935→C4ac на той же A памяти health/identity/checkpoint PASS.
- Future native fetch observer исправляет inspector dependence, local1.6MiB WAV HTTP regression/typecheck PASS. Никаких новых live uploads ради повторения зелёного harness; fresh live test с новым reader NOT_RUN.

## Проверки и ограничения

- PASS ef focused backend327/327 в 12 файлах. Неизменённый frontend unit scope имеет C4ac226/226 PASS; новый полный unit run ef не заявлен.
- PASS protocol-fake6/audio1skip: timeout/503/invalidJSON/conflict/STTunconfigured без ложного success/progress. Не live provider quality. PASS MCP6, packaging3/export2/optional1, store/export/backup/path/checksum guards и независимый review.
- Исторический full backend411PASS/3FAIL: baseline starter-pack lint19issues, два sandbox loopbackEPERM; отдельный bridge20PASS. Полный suite не назван зелёным.
- Docker Engine отсутствует, Docker runtime/STT topology NOT_RUN. Рабочий выпуск — source runtime. Bundle warning>500kB. Реальный provider иногда ошибается; первоначальные FAIL сохранены, automatic fallback отсутствует. При занятом heavy.lock STT возвращает busy.
- C имеет 4 слайда/сценарий и опубликованный 38 с text WebM с metadata COMPLETED_TEXT. Полный просмотр A, трёхминутный text+audio backup и человеческие репетиции NOT_RUN; этот остаток комплекта защиты остаётся C.

## Действия интегратора

1. Объединить финальную опубликованную qa-release обычным merge; source/runtime baseline ef принят в изоляции A. Использовать свои instance/порты/private env/master key, не A/B каталоги.
2. Следовать [RUNBOOK](../release/RUNBOOK.md): fixed SHA export/build/launch/smoke, restart/rollback, clean demo в новом root, backup/restore только в отдельную копию. Не использовать upstream общие braindrive_* volumes/backup.
3. Завершить и проверить комплект защиты. Не переименовывать C text-only WebM в полное трёхминутное audio demo.

Безопасные доказательства: [common-c-summary.json](../release/evidence/common-c-summary.json), [source-f935-summary.json](../release/evidence/source-f935-summary.json). Полные synthetic reports/checkpoints остаются в private/tmp; release trace/screenshots/video отключены. [KNOWN_ISSUES](../release/KNOWN_ISSUES.md) содержит ограничения и все существенные FAIL.
