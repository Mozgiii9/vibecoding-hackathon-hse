import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readEnvironment } from './launch-lib.mjs';

try {
  const [filename, release, state] = process.argv.slice(2);
  if (!filename || !release || !state) throw new Error('Usage: node scripts/release/launch-source.mjs <private.env> <built-release-directory> <instance-state-directory>');
  const { values } = readEnvironment(filename);
  const resolvedRelease = path.resolve(release);
  // The supervisor and edge are part of the selected candidate, including rollback.
  const { startSourceRuntime } = await import(pathToFileURL(path.join(resolvedRelease, 'app/installer/hackathon/source-runtime.mjs')).href);
  await startSourceRuntime({ values, release: resolvedRelease, state: path.resolve(state) });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Source runtime failed');
  process.exitCode = 1;
}
