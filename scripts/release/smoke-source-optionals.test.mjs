import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sourceArchivePaths } from './build-source-paths.mjs';

test('archive keeps a pre-STT commit exportable and includes optional deliveries only in their selected SHA', () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'ryadom-optional-source-'));
  const repository = path.join(temporary, 'repository');
  mkdirSync(repository);
  const git = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const put = (filename, contents) => {
    const target = path.join(repository, filename); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, contents);
  };
  const commit = () => {
    git(['add', '.']);
    git(['-c', 'user.name=Synthetic test', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Synthetic source fixture']);
    return git(['rev-parse', 'HEAD']).trim();
  };
  try {
    git(['init', '--quiet']);
    for (const directory of ['app', 'scripts/release', 'docs/contracts']) put(`${directory}/marker.txt`, directory);
    const before = commit();
    const delivery = {
      'services/stt/uv.lock': 'synthetic lock',
      'docs/demo/sources/demo-audio.wav': 'synthetic audio bytes',
      'docs/evaluation/browser-audio.mjs': 'synthetic runner',
    };
    for (const [filename, contents] of Object.entries(delivery)) put(filename, contents);
    const after = commit();
    for (const [sha, includesOptional] of [[before, false], [after, true]]) {
      const archive = path.join(temporary, `${sha}.tar`);
      const destination = path.join(temporary, sha); mkdirSync(destination);
      git(['archive', '--format=tar', `--output=${archive}`, sha, ...sourceArchivePaths(sha, repository)]);
      execFileSync('tar', ['-xf', archive, '-C', destination]);
      for (const [filename, contents] of Object.entries(delivery)) {
        assert.equal(existsSync(path.join(destination, filename)), includesOptional);
        if (includesOptional) assert.equal(readFileSync(path.join(destination, filename), 'utf8'), contents);
      }
      assert.equal(readFileSync(path.join(destination, 'app/marker.txt'), 'utf8'), 'app');
    }
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
