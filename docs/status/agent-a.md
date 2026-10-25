# Статус A второй итерации

- Состояние: RUNNING, A1/A2/A3; поручение владельца активировано 25 октября 2026, около 14:04 МСК.
- Ветка: codex/qa-release, создана без изменения старых веток; исходное рабочее дерево было чистым.
- Base SHA: 484c396e71b3fbfe2ff65c04f6260e1899aa6bd1, origin/codex/integration-ui; содержит 92cb8bc.
- Ready SHA: `83108ad3f7d42b08c089ad79043163baeba7a26d` (A3), `f0b849bb326689e1d3dd8496e15b494bb9600dcd` (source/Docker packaging), оба опубликованы в собственной ветке.
- PASS: backend build, MCP build; focused goals/context 209/209; отдельные goals+memory backup 62/62.
- PASS A3: реальный GoalsStore reload/отдельный процесс, backup включает hackathon/state.json, restore в новую synthetic копию, проверки checksum/path/symlink/overlap; детали готовятся в docs/release/ACCEPTANCE.md.
- FAIL baseline: полный backend suite 411 PASS / 3 FAIL из 414; starter-pack lint (19 нарушений шаблонов), два desktop bridge теста первоначально заблокированы sandbox loopback EPERM. Отдельный desktop bridge rerun вне sandbox PASS 20/20; baseline lint остаётся открытым.
- PASS: MCP suite 6/6.
- Сервер осмотрен: 1 CPU, 1967 МБ RAM, около 24 ГБ свободно; Node/Docker глобально отсутствуют; чужая среда B сохраняется. В A установлен scoped Node v22.21.1 с проверкой checksum под общим flock.
- Порты A: UI 127.0.0.1:15073, gateway 127.0.0.1:18787; на момент первичного осмотра свободны. MCP планируются только loopback, отдельные 18911–18913.
- Gemini: локальный live UI clean проход PASS с desktop→390px mobile, intention/action/quote/confirm/duplicate/reject/reload; один предыдущий provider_failed честно показан UI и сохранён в KNOWN_ISSUES. Production source SHA ещё проверяется.
- PASS: backend/MCP/web build; frontend suite 215/215; packaging static/proxy/env tests 3/3 и независимый read-only review.
- Серверный source-build f0b849b завершился FAIL frontend typecheck: exporter не включал корневой docs/contracts fixture; backend/MCP PASS. Ошибка нашей упаковки исправляется в новом коммите/кандидате, старый release не патчится. Log в собственном agent-a/logs/build-f0b849b.log.
- PASS browser protocol-fake: 6 сценариев, 1 audio skipped; timeout/503/invalid JSON, revision conflict, stt_unconfigured не дают ложного прогресса. Evidence summary: docs/release/evidence/local-browser-summary.json.
- Blocker: STT пока не передан B; финальный интегрированный кандидат C ещё не принят. Docker route NOT_RUN, готовится source launcher без Docker.
- Следующее: браузерная приёмка live Gemini, source-build зафиксированного SHA, server health/auth smoke, restart; отдельно audio после передачи B/C.
