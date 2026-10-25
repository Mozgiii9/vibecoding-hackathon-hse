import { argumentsFor, restoreSyntheticCopy } from "./persistence.mjs";

try {
  const args = argumentsFor(process.argv.slice(2), ["backup", "synthetic-copy"]);
  console.log(JSON.stringify(await restoreSyntheticCopy(args.backup, args["synthetic-copy"]), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
