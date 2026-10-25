import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const composeFile = path.join(repositoryRoot, 'app/installer/hackathon/compose.yml');
export const fullSha = /^[a-f0-9]{40}$/;
export function cleanEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(HACKATHON_|PAA_|BRAINDRIVE_|COMPOSE_)/.test(key)));
}
export function parseEnvironment(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || !match[1].startsWith('HACKATHON_')) throw new Error('Environment must contain only HACKATHON_KEY=value lines');
    const [, key, raw] = match;
    if (Object.hasOwn(values, key)) throw new Error(`Duplicate environment field: ${key}`);
    let value = raw;
    if (raw.startsWith("'") && raw.endsWith("'")) value = raw.slice(1, -1);
    else if (raw.startsWith('"') && raw.endsWith('"')) {
      value = raw.slice(1, -1);
      if (/[\\$]/.test(value)) throw new Error(`Use single quotes for special characters: ${key}`);
    } else if (/[\s$'"\\#]/.test(raw)) throw new Error(`Use a single-quoted value: ${key}`);
    if (/[\r\n\0]/.test(value) || value.includes("'")) throw new Error(`Unsupported environment value format: ${key}`);
    values[key] = value;
  }
  return values;
}
export function validateEnvironment(values) {
  if (!/^agent-[abc]$/.test(values.HACKATHON_OWNER ?? '')) throw new Error('HACKATHON_OWNER must be agent-a, agent-b or agent-c');
  const owner = values.HACKATHON_OWNER.slice(-1);
  if (!new RegExp(`^ryadom_${owner}(?:_[a-z0-9_]+)?$`).test(values.HACKATHON_INSTANCE_ID ?? '')) throw new Error('Instance ID must use its owner namespace, e.g. ryadom_a_demo2');
  if (!fullSha.test(values.HACKATHON_SOURCE_SHA ?? '')) throw new Error('HACKATHON_SOURCE_SHA must be a full 40-character SHA');
  const master = values.HACKATHON_SECRETS_MASTER_KEY_B64 ?? '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(master) || Buffer.from(master, 'base64').length !== 32) throw new Error('HACKATHON_SECRETS_MASTER_KEY_B64 must encode exactly 32 bytes');
  const assignments = { a: [15073, 15079, 18787], b: [16073, 16079, 18788], c: [17073, 17079, 18789] };
  const [min, max, gateway] = assignments[owner];
  const ui = Number(values.HACKATHON_UI_PORT ?? min);
  if (!Number.isInteger(ui) || ui < min || ui > max) throw new Error('UI port is outside the reserved owner range');
  if (Number(values.HACKATHON_GATEWAY_PORT ?? gateway) !== gateway) throw new Error('Gateway port must match the reserved owner port');
  return { ...values, HACKATHON_UI_PORT: String(ui), HACKATHON_GATEWAY_PORT: String(gateway) };
}
export function readEnvironment(filename) {
  const resolved = path.resolve(filename);
  const info = statSync(resolved);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error('Private environment must be a regular file with mode 600 (or stricter)');
  return { filename: resolved, values: validateEnvironment(parseEnvironment(readFileSync(resolved, 'utf8'))) };
}
export function composeArguments(config, action = []) {
  return ['compose', '--project-name', config.values.HACKATHON_INSTANCE_ID, '--env-file', config.filename, '-f', composeFile, ...action];
}
export function docker(args, options = {}) {
  return execFileSync('docker', args, { cwd: repositoryRoot, env: cleanEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
export function verifyImages(values) {
  for (const kind of ['app', 'edge']) {
    const image = `ryadom-${values.HACKATHON_OWNER}/${kind}:${values.HACKATHON_SOURCE_SHA}`;
    let revision;
    try { revision = docker(['image', 'inspect', image, '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}']).trim(); }
    catch { throw new Error(`Local release image missing: ${kind}; run build-hackathon.mjs for the candidate SHA`); }
    if (revision !== values.HACKATHON_SOURCE_SHA) throw new Error(`Source revision mismatch for local ${kind} image`);
  }
}
