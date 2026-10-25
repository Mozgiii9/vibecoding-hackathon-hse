import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep the local demo's memory and credentials inside the hackathon checkout.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
process.env.PAA_MEMORY_ROOT ||= path.join(repositoryRoot, ".runtime", "memory");
process.env.PAA_SECRETS_HOME ||= path.join(repositoryRoot, ".runtime", "secrets");

await import("./dev-runtime.mjs");
