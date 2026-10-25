import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ContextChatMessage } from "./contracts.js";
import { checkAbort } from "./errors.js";

const citationSchema = z.object({
  sourceId: z.string(), sourceTitle: z.string().max(200), kind: z.enum(["text", "audio", "goal", "progress"]),
  quote: z.string().min(1).max(2000), textStart: z.number().int().nonnegative(), textEnd: z.number().int().positive(),
  startMs: z.number().int().nonnegative().nullable(), endMs: z.number().int().nonnegative().nullable(),
}).strict();
const messageSchema = z.object({
  id: z.string().uuid(), role: z.enum(["user", "assistant"]), text: z.string().min(1).max(10_000),
  createdAt: z.string().datetime(), citations: z.array(citationSchema).max(4),
  outcome: z.enum(["grounded", "insufficient_context"]).optional(),
}).strict();
const historySchema = z.object({
  version: z.literal(1), messages: z.array(messageSchema).max(40),
  requests: z.array(z.object({ requestId: z.string().uuid(), messageHash: z.string().regex(/^[a-f0-9]{64}$/), replyId: z.string().uuid() }).strict()).max(64),
}).strict();
export type ChatHistory = z.infer<typeof historySchema>;
export const emptyHistory = (): ChatHistory => ({ version: 1, messages: [], requests: [] });
export const hashText = (text: string): string => createHash("sha256").update(text).digest("hex");

export function historyFilename(memoryRoot: string, actorId: string, goalId: string): string {
  return path.join(path.resolve(memoryRoot), "hackathon", "context-chat", hashText(actorId), `${hashText(goalId)}.json`);
}

async function guardDirectories(filename: string, create: boolean): Promise<boolean> {
  const actorDirectory = path.dirname(filename);
  const contextDirectory = path.dirname(actorDirectory);
  const hackathonDirectory = path.dirname(contextDirectory);
  if (create) await mkdir(path.dirname(hackathonDirectory), { recursive: true, mode: 0o700 });
  for (const directory of [hackathonDirectory, contextDirectory, actorDirectory]) {
    try {
      if (create) await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unsafe chat directory");
    } catch (error) {
      if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  return true;
}

export async function readHistory(filename: string): Promise<ChatHistory> {
  if (!await guardDirectories(filename, false)) return emptyHistory();
  let file;
  try { file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHistory(); throw error; }
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 2_000_000) throw new Error("Invalid chat history");
    return historySchema.parse(JSON.parse(await file.readFile("utf8")));
  } finally { await file.close(); }
}

/** The user/assistant pair and idempotency record share one atomic commit. */
export async function writeHistory(filename: string, history: ChatHistory, signal?: AbortSignal): Promise<void> {
  const validated = historySchema.parse(history);
  const bytes = Buffer.from(`${JSON.stringify(validated)}\n`);
  if (bytes.length > 2_000_000) throw new Error("Chat history is too large");
  checkAbort(signal);
  await guardDirectories(filename, true);
  const temporary = path.join(path.dirname(filename), `.chat-${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    checkAbort(signal);
    await rename(temporary, filename);
  } finally { await unlink(temporary).catch(() => undefined); }
}

export function messagesForClient(history: ChatHistory): ContextChatMessage[] {
  return structuredClone(history.messages);
}
