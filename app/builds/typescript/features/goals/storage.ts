import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { snapshotSchema, type Snapshot } from "./schemas.js";
import { validateSnapshot } from "./validation.js";

export async function readSnapshot(memoryRoot: string): Promise<Snapshot> {
  let contents: string;
  try {
    contents = await readFile(path.join(memoryRoot, "hackathon", "state.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, goals: [], sources: [], evidence: [] };
    }
    throw error;
  }
  const state = snapshotSchema.parse(JSON.parse(contents));
  validateSnapshot(state);
  return state;
}

/** A failed write never replaces the last committed file or the store's live state. */
export async function writeSnapshot(memoryRoot: string, state: Snapshot): Promise<void> {
  const directory = path.join(memoryRoot, "hackathon");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.state-${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(state)}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path.join(directory, "state.json"));
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
