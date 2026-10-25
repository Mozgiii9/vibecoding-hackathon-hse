import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanEnvironment, docker, fullSha, repositoryRoot } from './launch-lib.mjs';

const [owner, sha, manifestArgument] = process.argv.slice(2);
let staging;
try {
  if (!/^agent-[abc]$/.test(owner ?? '') || !fullSha.test(sha ?? '')) throw new Error('Usage: node scripts/release/build-hackathon.mjs agent-a <full-commit-sha> [manifest.json]');
  const git = (args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', env: cleanEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
  if (git(['rev-parse', `${sha}^{commit}`]).trim() !== sha) throw new Error('Commit SHA could not be verified');
  try { git(['cat-file', '-e', `${sha}:app/installer/hackathon/compose.yml`]); }
  catch { throw new Error('Candidate commit must contain app/installer/hackathon packaging; commit the release before building'); }
  docker(['compose', 'version']);
  for (const kind of ['app', 'edge']) {
    let exists = false;
    try { docker(['image', 'inspect', `ryadom-${owner}/${kind}:${sha}`]); exists = true; } catch {}
    if (exists) throw new Error(`Refusing to replace immutable ${kind} image tag; keep it for rollback`);
  }
  const pinBase = (reference) => {
    docker(['pull', reference], { stdio: 'inherit' });
    const pinned = docker(['image', 'inspect', reference, '--format', '{{index .RepoDigests 0}}']).trim();
    if (!/^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(pinned)) throw new Error('Base image digest could not be resolved');
    return pinned;
  };
  const nodeImage = pinBase(process.env.HACKATHON_NODE_IMAGE || 'node:22-bookworm-slim');
  const edgeImage = pinBase(process.env.HACKATHON_EDGE_IMAGE || 'caddy:2.8-alpine');
  staging = mkdtempSync(path.join(tmpdir(), 'ryadom-source-'));
  const archive = path.join(staging, 'source.tar');
  git(['archive', '--format=tar', `--output=${archive}`, sha, 'app', 'docs/contracts']);
  execFileSync('tar', ['-xf', archive, '-C', staging], { stdio: 'inherit' });
  rmSync(archive);
  const context = staging;
  const images = {};
  for (const kind of ['app', 'edge']) {
    const tag = `ryadom-${owner}/${kind}:${sha}`;
    docker(['build', '--file', path.join(context, 'app/installer/hackathon', `Dockerfile.${kind === 'app' ? 'gateway' : 'edge'}`),
      '--build-arg', `NODE_IMAGE=${nodeImage}`, '--build-arg', `EDGE_IMAGE=${edgeImage}`,
      '--build-arg', `SOURCE_SHA=${sha}`, '--tag', tag, context], { stdio: 'inherit' });
    images[kind] = { tag, id: docker(['image', 'inspect', tag, '--format', '{{.Id}}']).trim() };
  }
  const manifest = path.resolve(manifestArgument || path.join(repositoryRoot, '.runtime/release-images', `${owner}-${sha}.json`));
  mkdirSync(path.dirname(manifest), { recursive: true });
  writeFileSync(manifest, JSON.stringify({ source_sha: sha, owner, built_at: new Date().toISOString(),
    platform: docker(['info', '--format', '{{.OSType}}/{{.Architecture}}']).trim(),
    bases: { node: nodeImage, edge: edgeImage }, images }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Source build complete: ${sha}\nManifest: ${manifest}`);
} catch (error) {
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'Release build failed');
  process.exitCode = 1;
} finally {
  if (staging) rmSync(staging, { recursive: true, force: true });
}
