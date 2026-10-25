import { argumentsFor, backupMemory } from "./persistence.mjs";

try {
  const args = argumentsFor(process.argv.slice(2), ["memory-root", "output"]);
  console.log(JSON.stringify(await backupMemory(args["memory-root"], args.output), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
