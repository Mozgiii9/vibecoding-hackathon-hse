import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GoalsStore, SourceDraft } from "../../app/builds/typescript/features/contracts.js";
import { createGoalsStore } from "../../app/builds/typescript/features/goals/store.js";
import { exportMigrationArchive } from "../../app/builds/typescript/memory/migration.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(directory, "../..");
const tsx = path.join(repo, "app/builds/typescript/node_modules/tsx/dist/loader.mjs");
const self = fileURLToPath(import.meta.url);
const goalId = "release-synthetic";

async function inspect(store: GoalsStore) {
  const evidence = await store.listEvidence(goalId);
  const sources = await Promise.all(evidence.map((entry) => store.getSource(entry.sourceId)));
  for (const source of sources) {
    assert.ok(source);
    const found = await store.findImport(goalId, source.contentHash);
    assert.equal(found?.source.id, source.id);
    assert.equal(found?.duplicate, true);
  }
  return { goal: await store.getGoal(goalId), evidence, sources, progress: await store.getProgress(goalId) };
}

function child(args: string[], expectedSuccess = true) {
  const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 30_000 });
  if (result.error) throw result.error;
  if (expectedSuccess) assert.equal(result.status, 0, result.stderr || result.stdout);
  else assert.notEqual(result.status, 0, "Unsafe operation unexpectedly succeeded");
  return result;
}

function restart(memoryRoot: string) {
  return JSON.parse(child(["--import", tsx, self, "--inspect-copy", memoryRoot]).stdout);
}

async function absent(candidate: string) {
  await assert.rejects(lstat(candidate), { code: "ENOENT" });
}

if (process.argv[2] === "--inspect-copy" && process.argv[3]) {
  console.log(JSON.stringify(await inspect(await createGoalsStore({ memoryRoot: process.argv[3] }))));
} else {
  assert.equal(process.argv.length, 2, "This check accepts no runtime paths; it creates only temporary synthetic data");
  const workspace = await mkdtemp(path.join(tmpdir(), "ryadom-persistence-"));
  const memoryRoot = path.join(workspace, "synthetic-memory");
  const backup = path.join(workspace, "backup");
  const restored = path.join(workspace, "synthetic-restored");
  try {
    await mkdir(memoryRoot, { mode: 0o700 });
    for (const name of ["conversations", "documents", "preferences"]) await mkdir(path.join(memoryRoot, name));
    const store = await createGoalsStore({ memoryRoot });
    await store.saveGoal(goalId, {
      title: "Синтетическая проверка выпуска", deadline: "2026-11-01T17:30:00+03:00",
      criteria: [
        { id: "cv", description: "Отправить резюме", targetCount: 2, unit: "отправка" },
        { id: "mock", description: "Пройти пробное интервью", targetCount: 1, unit: "интервью" },
        { id: "plan", description: "Составить план", targetCount: 1, unit: "план" },
      ], confirm: true, expectedRevision: null,
    });
    const drafts = [
      { text: "Я отправил тестовое резюме.", criterionId: "cv", kind: "text" as const },
      { text: "Я прошёл синтетическое пробное интервью.", criterionId: "mock", kind: "audio" as const },
      { text: "Я составил синтетический план.", criterionId: "plan", kind: "text" as const },
    ];
    for (const [index, draft] of drafts.entries()) {
      const source: SourceDraft = {
        kind: draft.kind, title: `Синтетический источник ${index + 1}`, text: draft.text,
        contentHash: createHash("sha256").update(`${draft.kind}\0`).update(draft.text).digest("hex"),
        capturedAt: null,
        segments: draft.kind === "audio" ? [{ startMs: 0, endMs: 2000, textStart: 0, textEnd: draft.text.length }] : [],
      };
      const result = await store.commitImport({
        goalId, expectedGoalRevision: 1, source,
        evidence: [{ criterionId: draft.criterionId, eventType: "completed_action", summary: draft.text,
          quote: draft.text, textStart: 0, textEnd: draft.text.length,
          startMs: draft.kind === "audio" ? 0 : null, endMs: draft.kind === "audio" ? 2000 : null }],
      });
      if (index < 2) {
        await store.reviewEvidence(result.evidence[0].id, { status: "confirmed", expectedRevision: 1 });
        if (index === 1) await store.reviewEvidence(result.evidence[0].id, { status: "rejected", expectedRevision: 2 });
      }
    }
    const expected = await inspect(store);
    assert.deepEqual(expected.evidence.map(({ status, revision }) => ({ status, revision })), [
      { status: "confirmed", revision: 2 }, { status: "rejected", revision: 3 }, { status: "proposed", revision: 1 },
    ]);
    assert.deepEqual(expected.progress.criteria.map((entry) => entry.confirmedCount), [1, 0, 0]);
    const originalState = await readFile(path.join(memoryRoot, "hackathon/state.json"));
    assert.deepEqual(await inspect(await createGoalsStore({ memoryRoot })), expected);
    console.log("PASS reload: goal, sources, text/audio evidence, review revisions and progress");
    assert.deepEqual(restart(memoryRoot), expected);
    console.log("PASS process restart: exact domain state and duplicate lookup");

    // Exercise the existing export with explicitly absent synthetic secrets paths.
    const fakeSecrets = path.join(workspace, "absent-synthetic-secrets");
    const exported = await exportMigrationArchive(memoryRoot, { secretsPaths: {
      homeDir: fakeSecrets, vaultPath: path.join(fakeSecrets, "vault.json"), keyPath: path.join(fakeSecrets, "master-key.json"),
    } });
    assert.deepEqual(exported.includes.secrets, { vault: false, master_key: false });
    const exportedCopy = path.join(workspace, "synthetic-export-copy");
    await mkdir(exportedCopy);
    const extracted = spawnSync("tar", ["-xzf", exported.archive_path, "-C", exportedCopy], { encoding: "utf8", timeout: 30_000 });
    assert.equal(extracted.status, 0, extracted.stderr);
    assert.deepEqual(restart(path.join(exportedCopy, "memory")), expected);
    console.log("PASS existing export: hackathon/state.json included; only synthetic copy extracted");

    await writeFile(path.join(memoryRoot, ".env.synthetic"), "SYNTHETIC_EXCLUDED=1\n");
    await mkdir(path.join(memoryRoot, "secrets"));
    await writeFile(path.join(memoryRoot, "secrets/vault.json"), "synthetic exclusion sentinel\n");
    child([path.join(directory, "backup.mjs"), "--memory-root", memoryRoot, "--output", backup]);
    const manifest = JSON.parse(await readFile(path.join(backup, "manifest.json"), "utf8"));
    assert.ok(manifest.files.some((entry: { path: string }) => entry.path === "hackathon/state.json"));
    await absent(path.join(backup, "memory/.env.synthetic"));
    await absent(path.join(backup, "memory/secrets"));
    await absent(path.join(backup, "memory/exports"));
    child([path.join(directory, "restore.mjs"), "--backup", backup, "--synthetic-copy", restored]);
    assert.deepEqual(restart(restored), expected);
    assert.deepEqual(await readFile(path.join(restored, "hackathon/state.json")), originalState);
    for (const name of ["conversations", "documents", "preferences"]) assert.ok((await lstat(path.join(restored, name))).isDirectory());
    console.log("PASS release backup/restore: SHA256 inventory and exact state in new synthetic copy");

    child([path.join(directory, "restore.mjs"), "--backup", backup, "--synthetic-copy", memoryRoot], false);
    child([path.join(directory, "restore.mjs"), "--backup", backup, "--synthetic-copy", restored], false);
    child([path.join(directory, "backup.mjs"), "--memory-root", memoryRoot, "--output", path.join(memoryRoot, "nested-backup")], false);
    await symlink(memoryRoot, path.join(workspace, "memory-link"));
    child([path.join(directory, "restore.mjs"), "--backup", backup, "--synthetic-copy", path.join(workspace, "memory-link", "nested-copy")], false);
    const badBackup = path.join(workspace, "damaged-backup");
    await cp(backup, badBackup, { recursive: true });
    await writeFile(path.join(badBackup, "memory/hackathon/state.json"), "{}\n");
    const failedCopy = path.join(workspace, "must-not-exist");
    child([path.join(directory, "restore.mjs"), "--backup", badBackup, "--synthetic-copy", failedCopy], false);
    await absent(failedCopy);
    const badManifest = JSON.parse(await readFile(path.join(badBackup, "manifest.json"), "utf8"));
    badManifest.files[0].path = "../escape";
    await writeFile(path.join(badBackup, "manifest.json"), JSON.stringify(badManifest));
    child([path.join(directory, "restore.mjs"), "--backup", badBackup, "--synthetic-copy", failedCopy], false);
    await absent(failedCopy);
    console.log("PASS guardrails: existing targets, overlap, symlink parent, corruption and traversal refused");

    const cleanDemoRoot = path.join(workspace, "new-clean-synthetic-demo");
    await mkdir(cleanDemoRoot, { mode: 0o700 });
    assert.equal(await (await createGoalsStore({ memoryRoot: cleanDemoRoot })).getGoal(goalId), null);
    assert.deepEqual(await readFile(path.join(memoryRoot, "hackathon/state.json")), originalState);
    assert.deepEqual(restart(memoryRoot), expected);
    console.log("PASS clean demo: new empty memory root; original memory unchanged");
    console.log("PASS all persistence checks (synthetic only; no HTTP/UI, live STT or provider invoked)");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
