import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repositoryRoot } from './launch-lib.mjs';

let temporary;
let exported;
const webRelative = 'app/builds/typescript/client_web';
const installedWeb = path.join(repositoryRoot, webRelative, 'node_modules');
const typecheck = (web) => execFileSync(process.execPath, [path.join(installedWeb, 'typescript/bin/tsc'), '--noEmit'], { cwd: web, encoding: 'utf8', stdio: 'pipe' });
before(() => {
  assert.ok(existsSync(installedWeb), 'Install frontend test dependencies first');
  temporary = mkdtempSync(path.join(tmpdir(), 'ryadom-source-dependencies-'));
  exported = path.join(temporary, 'release');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  // Exercise the real exporter against a committed candidate, outside the checkout.
  execFileSync(process.execPath, [path.join(repositoryRoot, 'scripts/release/build-source.mjs'), 'export', sha, exported], { stdio: 'pipe' });
});
after(() => { if (temporary) rmSync(temporary, { recursive: true, force: true }); });

test('exported source resolves the actual frontend file dependencies and compiles in isolation', () => {
  const web = path.join(exported, webRelative);
  const manifest = JSON.parse(readFileSync(path.join(web, 'package.json'), 'utf8'));
  for (const [name, specification] of Object.entries(manifest.dependencies)) {
    if (!specification.startsWith('file:')) continue;
    const dependency = JSON.parse(readFileSync(path.resolve(web, specification.slice(5), 'package.json'), 'utf8'));
    assert.equal(dependency.name, name, 'local package must exist inside the exported candidate');
  }
  // Reuse installed compiler libraries only; every checked source file comes from git archive.
  symlinkSync(installedWeb, path.join(web, 'node_modules'), 'dir');
  try { assert.doesNotThrow(() => typecheck(web)); }
  finally { rmSync(path.join(web, 'node_modules')); }
});

test('actual Docker edge COPY steps produce a frontend tree with all external imports', () => {
  const stage = path.join(temporary, 'docker-web-stage');
  mkdirSync(stage);
  let cwd = stage;
  let reachedBuild = false;
  const dockerfile = readFileSync(path.join(repositoryRoot, 'app/installer/hackathon/Dockerfile.edge'), 'utf8');
  for (const raw of dockerfile.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('FROM ') && line.includes(' AS web-build')) continue;
    if (line.startsWith('FROM ')) break;
    if (line.startsWith('WORKDIR ')) {
      cwd = path.join(stage, line.slice(8)); mkdirSync(cwd, { recursive: true });
    } else if (line.startsWith('COPY ')) {
      const entries = line.slice(5).split(/\s+/);
      const target = entries.pop();
      const destination = target.startsWith('/') ? path.join(stage, target) : path.resolve(cwd, target);
      for (const source of entries) {
        const from = path.join(exported, source);
        const to = source.endsWith('/') ? destination : target.endsWith('/') ? path.join(destination, path.basename(source)) : destination;
        mkdirSync(path.dirname(to), { recursive: true });
        cpSync(from, to, { recursive: true, dereference: false });
      }
    } else if (line === 'RUN npm ci') {
      const packageJson = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      for (const [name, specification] of Object.entries(packageJson.dependencies)) {
        if (specification.startsWith('file:')) assert.equal(JSON.parse(readFileSync(path.resolve(cwd, specification.slice(5), 'package.json'), 'utf8')).name, name, 'npm ci requires local parent package before source COPY');
      }
    } else if (line.startsWith('RUN npm run typecheck')) {
      symlinkSync(installedWeb, path.join(cwd, 'node_modules'), 'dir');
      assert.doesNotThrow(() => typecheck(cwd));
      reachedBuild = true;
    }
  }
  assert.ok(reachedBuild, 'Docker web build stage must be exercised');
});
