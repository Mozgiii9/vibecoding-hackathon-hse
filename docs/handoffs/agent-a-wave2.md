# A, вторая волна — выпуск и приёмка

Состояние: READY_FOR_INTEGRATION упаковка/сохранность; A1/A4 продолжаются. 25 октября 2026, около 14:22 МСК. Полный MVP пока не принят, реальное аудио остаётся открытым.

## Ветка и исходники

- Ветка: `codex/qa-release`, обычные scoped commits, без force/reset и изменения чужих веток.
- Base: `484c396e71b3fbfe2ff65c04f6260e1899aa6bd1` из `origin/codex/integration-ui`.
- A3: `83108ad3f7d42b08c089ad79043163baeba7a26d`.
- Source release с исправленным архивом: `f93536db9091f10236221aba5901fbbdd0486f59`.
- Изменения только в A путях: packaging, release scripts/specs и собственные release/status/handoff docs. Goal core правок не потребовал. UI, gateway, context, shared contracts/manifests не менялись.

## Проверенный source запуск без Docker

Сервер не имел Node/Docker. Scoped официальный Node v22.21.1 установлен только под `agent-a/tools`, archive проверен SHASUMS256. System packages и чужие процессы не менялись.

Сборка выполнена из `git archive` полного SHA в новой папке под heavy.lock. Последовательно `npm ci/build` backend/MCP/web и frontend typecheck — PASS, build exit 0. Фактический manifest:

```json
{
  "source_sha": "f93536db9091f10236221aba5901fbbdd0486f59",
  "git_archive_sha256": "ea04f24d0e26817c1218c94737f7bfeff611e11071572dfc818c95b21a5c3aa5",
  "node": "v22.21.1",
  "platform": "linux/x64",
  "built_at": "2026-10-25T11:20:01.400Z"
}
```

- Release: `/srv/ryadom-hackathon/agent-a/releases/f93536d`.
- Собственная память/secrets: `/srv/ryadom-hackathon/agent-a/instances/demo-f935/{memory,secrets}`.
- Private env A: `/srv/ryadom-hackathon/agent-a/release-f935.env`, mode600, не передаётся в Git.
- Запущен supervisor PID81963; в момент проверки один gateway PID82006 и три MCP children. Для будущего управления читать актуальный `INSTANCE/runtime.json`, PID может измениться после restart.
- Только loopback: UI15073, gateway18787, MCP18911/18912/18913; чужие среды не затронуты.
- PASS smoke: built React entrypoint, `/release.json` с нужным SHA, direct/proxied health, auth bootstrap200, анонимный goals401.
- Никаких upstream application images, Vite dev server или auto-update при production запуске.

Команды builder/launcher/smoke и restart/rollback описаны в [RUNBOOK.md](../release/RUNBOOK.md) и `app/installer/hackathon/README.md`. Для C использовать собственные owner/instance/порты, не перезапускать A/B.

## Приёмка и сохранность

- PASS локально: backend/MCP/web builds; 209 goals/context tests, 215 frontend tests, 6 MCP tests; packaging edge/env3 и export/frontend dependencies2.
- Полный backend suite не зелёный: baseline starter-pack lint19 нарушений; два sandbox loopback EPERM исчезли в focused разрешённом bridge rerun20/20.
- PASS A3: настоящий store reload/отдельный процесс; source/evidence/review/revisions/progress; existing export включает state; новый backup/restore в synthetic copy; checksum/inventory/path guards; clean demo без удаления памяти.
- PASS локальный browser protocol-fake6: обычная авторизация, точные server counts/IDs/revisions, timeout/503/invalid JSON, conflict, unconfigured STT. Не live LLM/STT.
- PASS локальный live Gemini desktop/mobile390: intention0 → action/quote → confirm1 → duplicate1 → reject0 → reload. Один первоначальный provider_failed сохранён как известная нестабильность; повтор без fallback успешен.
- Production live browser f93536d PASS main1/6skipped (14:21 МСК), реальные Gemini вызовы, точные counts/IDs/revisions, desktop/mobile390. После реального stop/restart того же instance resume1/1PASS (14:23). Backup49файлов, новая restored memory и отдельная приватная копия собственных synthetic secrets; SHA256 state совпал. Restored-instance UI resume1/1PASS (14:24), те же IDs/revisions/status/counts/quotes. Evidence: `docs/release/evidence/source-f935-summary.json`.
- Сейчас работает отдельный restored-f935 supervisor82655; original demo-f935 остановлен/сохранён. PID в handoff исторический, для управления читать runtime.json соответствующего instance.

## Ошибка первого candidate и исправление

`f0b849b` clean build FAIL: exporter не включал корневой docs/contracts fixture, используемый frontend preview. Старый failed release сохранён без патча. В `f93536d` исправлены exporter и Docker context/file dependency; regression typechecks2/2 PASS. Docker Engine отсутствует: build/Compose runtime NOT_RUN, source runtime реально PASS.

## Что требуется C/B

1. C4ac9740 уже объединил раннюю A packaging f0. Для clean source build также взять исправление f93536d и последующие release specs/status обычным merge qa-release. Новые русские auth/draft changes C670ec69 ещё не входят в принятую A text f93536d. Release specs поддерживают точные English/Russian auth labels. Нужен конкретный общий SHA с B audio для A4.
2. B передаёт рабочую STT реализацию/service source и synthetic audio; пока её отдельный health/adapter не означает audio UI PASS. Сначала source runtime→loopback STT, затем audio upload/transcript/quote/confirm/restart на общем SHA.
3. После передачи STT включить services/stt в source package и описать scoped запуск. Docker topology STT отдельно не проверена; container loopback не достигает host STT.
4. Финальный общий кандидат, четыре слайда и реальное резервное видео C ещё требуют проверки A. Полная цель остаётся активной.

Подробные PASS/FAIL/NOT_RUN: [ACCEPTANCE.md](../release/ACCEPTANCE.md), ограничения: [KNOWN_ISSUES.md](../release/KNOWN_ISSUES.md). Ключи, токены, пароль SSH, raw provider responses и личные записи в handoff не включены.
