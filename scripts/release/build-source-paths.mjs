import { execFileSync } from 'node:child_process';
import { fullSha, repositoryRoot } from './launch-lib.mjs';

/** Optional deliveries are selected from the commit, never the working tree. */
export function sourceArchivePaths(sha, root = repositoryRoot) {
  if (!fullSha.test(sha)) throw new Error('Source archive requires a full commit SHA');
  const paths = ['app', 'scripts/release', 'docs/contracts'];
  for (const optional of ['services/stt', 'docs/demo/sources', 'docs/evaluation']) {
    try {
      const kind = execFileSync('git', ['cat-file', '-t', `${sha}:${optional}`], {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (kind === 'tree') paths.push(optional);
    } catch { /* A base release remains exportable before the optional delivery. */ }
  }
  return paths;
}
