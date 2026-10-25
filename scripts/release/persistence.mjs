import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

const STATE = "hackathon/state.json";
const EXCLUSIONS = [".git", "exports", "system/updates/backups", "secrets", ".env*", "vault.json", "master-key.json", ".synthetic-restore.json"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);

function allowed(relative) {
  const parts = relative.split("/");
  return !parts.some((part) => [".git", "secrets", "vault.json", "master-key.json", ".synthetic-restore.json"].includes(part)
    || part === ".env" || part.startsWith(".env."))
    && !["exports", "system/updates/backups"].some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
}

async function treeIn(root, prefix = "") {
  const files = [];
  const directories = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!allowed(relative)) continue;
    const info = await lstat(path.join(root, relative));
    if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${relative}`);
    if (info.isDirectory()) {
      directories.push(relative);
      const nested = await treeIn(root, relative);
      files.push(...nested.files);
      directories.push(...nested.directories);
    } else if (info.isFile()) files.push(relative);
    else throw new Error(`Refusing non-regular memory entry: ${relative}`);
  }
  return { files: files.sort(), directories: directories.sort() };
}

function safeRelative(relative) {
  return typeof relative === "string" && !relative.split("/").some((part) => !part || part === "." || part === "..")
    && !relative.includes("\\") && !path.isAbsolute(relative) && allowed(relative);
}

async function newDestination(target) {
  const resolved = path.resolve(target);
  const parent = await realpath(path.dirname(resolved));
  const canonical = path.join(parent, path.basename(resolved));
  try {
    await lstat(canonical);
  } catch (error) {
    if (error.code === "ENOENT") return canonical;
    throw error;
  }
  throw new Error("Destination already exists; choose a new directory (existing memory is never replaced)");
}

async function publishDirectory(destination, populate) {
  const staging = path.join(path.dirname(destination), `.persistence-${randomUUID()}`);
  await mkdir(staging, { mode: 0o700 });
  try {
    const result = await populate(staging);
    // Reserve the final name exclusively, then publish into that empty directory.
    await mkdir(destination, { mode: 0o700 });
    try { await rename(staging, destination); }
    catch (error) { await rmdir(destination).catch(() => undefined); throw error; }
    return result;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Explicit local memory copy. Stop the isolated gateway first for a coherent multi-file backup. */
export async function backupMemory(memoryRoot, target) {
  const source = await realpath(memoryRoot);
  const destination = await newDestination(target);
  if (inside(source, destination) || inside(destination, source)) throw new Error("Backup and memory must be separate directories");
  const tree = await treeIn(source);
  if (!tree.files.includes(STATE)) throw new Error(`Required ${STATE} is missing; create the demo goal before backing up`);
  return publishDirectory(destination, async (staging) => {
    const files = [];
    for (const name of tree.directories) await mkdir(path.join(staging, "memory", name), { recursive: true, mode: 0o700 });
    for (const name of tree.files) {
      const bytes = await readFile(path.join(source, name));
      if (name === STATE) JSON.parse(bytes.toString("utf8"));
      const output = path.join(staging, "memory", name);
      await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
      await writeFile(output, bytes, { mode: 0o600, flag: "wx" });
      files.push({ path: name, bytes: bytes.length, sha256: digest(bytes) });
    }
    const manifest = {
      format: "ryadom-memory-backup-v1", createdAt: new Date().toISOString(),
      sourceMemoryRoot: source, excludes: EXCLUSIONS, directories: tree.directories, files,
    };
    await writeFile(path.join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    return { backup: destination, files: files.length, requiredState: STATE, secretsStoreIncluded: false };
  });
}

/** Restores only into a new synthetic directory, never into an existing runtime. */
export async function restoreSyntheticCopy(backupRoot, target) {
  const backup = await realpath(backupRoot);
  const destination = await newDestination(target);
  const manifestPath = path.join(backup, "manifest.json");
  if (!(await lstat(manifestPath)).isFile()) throw new Error("Backup manifest must be a regular file");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.format !== "ryadom-memory-backup-v1" || !Array.isArray(manifest.files) || !Array.isArray(manifest.directories)
      || typeof manifest.sourceMemoryRoot !== "string" || !path.isAbsolute(manifest.sourceMemoryRoot)) {
    throw new Error("Unsupported backup manifest");
  }
  if (inside(backup, destination) || inside(destination, backup)
      || inside(manifest.sourceMemoryRoot, destination) || inside(destination, manifest.sourceMemoryRoot)) {
    throw new Error("Synthetic copy must be separate from backup and source memory");
  }
  const memory = path.join(backup, "memory");
  if ((await lstat(memory)).isSymbolicLink()) throw new Error("Backup memory must not be a symbolic link");
  const actual = await treeIn(memory);
  const expected = [];
  for (const entry of manifest.files) {
    if (!entry || !safeRelative(entry.path)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error("Invalid backup file entry");
    }
    expected.push(entry.path);
  }
  if (manifest.directories.some((name) => !safeRelative(name))
      || new Set(manifest.directories).size !== manifest.directories.length
      || JSON.stringify(actual.directories) !== JSON.stringify([...manifest.directories].sort())) {
    throw new Error("Backup directory inventory mismatch");
  }
  if (!expected.includes(STATE) || new Set(expected).size !== expected.length
      || JSON.stringify(actual.files) !== JSON.stringify([...expected].sort())) throw new Error("Backup file inventory mismatch");
  return publishDirectory(destination, async (staging) => {
    for (const name of manifest.directories) await mkdir(path.join(staging, name), { recursive: true, mode: 0o700 });
    for (const entry of manifest.files) {
      const bytes = await readFile(path.join(memory, entry.path));
      if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error(`Backup checksum mismatch: ${entry.path}`);
      if (entry.path === STATE) JSON.parse(bytes.toString("utf8"));
      const output = path.join(staging, entry.path);
      await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
      await writeFile(output, bytes, { mode: 0o600, flag: "wx" });
    }
    await writeFile(path.join(staging, ".synthetic-restore.json"), `${JSON.stringify({ format: manifest.format, restoredAt: new Date().toISOString() })}\n`, { mode: 0o600, flag: "wx" });
    return { syntheticMemoryRoot: destination, files: expected.length, requiredState: STATE };
  });
}

export function argumentsFor(argv, names) {
  const values = {};
  if (argv.length !== names.length * 2) throw new Error(`Required arguments: ${names.map((name) => `--${name} <path>`).join(" ")}`);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index].replace(/^--/, "");
    if (argv[index] !== `--${name}` || !names.includes(name) || values[name] || !argv[index + 1]) throw new Error("Invalid command arguments");
    values[name] = argv[index + 1];
  }
  return values;
}
