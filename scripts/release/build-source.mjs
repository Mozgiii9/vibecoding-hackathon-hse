import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { cleanEnvironment, fullSha, repositoryRoot } from './launch-lib.mjs';

try {
  const [action, first, second] = process.argv.slice(2);
  if (action === 'export') {
    const sha = first;
    if (!fullSha.test(sha ?? '') || !second) throw new Error('Usage: build-source.mjs export <full-sha> <new-release-directory>');
    const destination = path.resolve(second);
    if (existsSync(destination)) throw new Error('Release destination already exists; preserve previous candidates');
    execFileSync('git', ['cat-file', '-e', `${sha}:app/installer/hackathon/source-runtime.mjs`], { cwd: repositoryRoot, stdio: 'pipe' });
    mkdirSync(destination, { recursive: true, mode: 0o700 });
    const archive = path.join(destination, 'source.tar');
    execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, sha, 'app', 'scripts/release', 'docs/contracts'], { cwd: repositoryRoot, stdio: 'inherit' });
    const archiveSha = createHash('sha256').update(readFileSync(archive)).digest('hex');
    execFileSync('tar', ['-xf', archive, '-C', destination], { stdio: 'inherit' });
    rmSync(archive);
    writeFileSync(path.join(destination, 'source-manifest.json'), JSON.stringify({ source_sha: sha, git_archive_sha256: archiveSha }, null, 2) + '\n', { mode: 0o600 });
    console.log(`Exported committed source ${sha}: ${destination}`);
  } else if (action === 'build') {
    if (!first) throw new Error('Usage: build-source.mjs build <exported-release-directory>');
    const release = path.resolve(first);
    const manifest = JSON.parse(readFileSync(path.join(release, 'source-manifest.json'), 'utf8'));
    if (!fullSha.test(manifest.source_sha ?? '')) throw new Error('Invalid source manifest SHA');
    if (existsSync(path.join(release, 'build-manifest.json'))) throw new Error('Candidate was already built; preserve it and export a new directory');
    const nodeDirectory = path.dirname(process.execPath);
    const npmCli = path.resolve(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js');
    if (!existsSync(npmCli)) throw new Error('Use the full official Node archive including npm, with its bin directory on PATH');
    for (const [directory, commands] of [
      ['app/builds/typescript', [['ci'], ['run', 'build']]],
      ['app/builds/mcp_release', [['ci'], ['run', 'build']]],
      ['app/builds/typescript/client_web', [['ci'], ['run', 'typecheck'], ['run', 'build']]],
    ]) {
      for (const command of commands) execFileSync(process.execPath, [npmCli, ...command], {
        cwd: path.join(release, directory), env: { ...cleanEnvironment(), PATH: `${nodeDirectory}${path.delimiter}${process.env.PATH || ''}` }, stdio: 'inherit',
      });
    }
    writeFileSync(path.join(release, 'build-manifest.json'), JSON.stringify({ ...manifest, node: process.version,
      platform: `${process.platform}/${process.arch}`, built_at: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
    console.log(`Source build complete: ${manifest.source_sha}`);
  } else throw new Error('Usage: build-source.mjs export <full-sha> <new-directory> | build <exported-directory>');
} catch (error) {
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'Source build failed');
  process.exitCode = 1;
}
