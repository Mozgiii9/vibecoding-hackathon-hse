import net from 'node:net';
import { cleanEnvironment, composeArguments, docker, readEnvironment, verifyImages } from './launch-lib.mjs';

async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Reserved loopback port ${port} is occupied; preserve the existing process`)));
    server.listen(Number(port), '127.0.0.1', () => server.close(resolve));
  });
}
try {
  const [action, filename, previousSha] = process.argv.slice(2);
  if (!['check', 'up', 'down', 'restart', 'status', 'rollback'].includes(action) || !filename) throw new Error('Usage: node scripts/release/launch-hackathon.mjs <check|up|down|restart|status|rollback> <private.env> [previous-full-sha]');
  const config = readEnvironment(filename);
  // Supply defaults for B/C too; shell variables never override this file.
  const environment = { ...config.values };
  const runCompose = (args, options = {}) => docker(composeArguments(config, args), { ...options, env: { ...cleanEnvironment(), ...environment } });
  if (action === 'check') {
    // Do not print `compose config`: it contains provider credentials.
    runCompose(['config', '--quiet']);
    verifyImages(environment);
    console.log(`Configuration and local image revisions verified: ${environment.HACKATHON_SOURCE_SHA}`);
  } else if (action === 'up' || action === 'rollback') {
    if (action === 'rollback') {
      if (!/^[a-f0-9]{40}$/.test(previousSha ?? '')) throw new Error('Rollback requires the previous full SHA');
      environment.HACKATHON_SOURCE_SHA = previousSha;
    }
    verifyImages(environment);
    runCompose(['config', '--quiet']);
    const running = runCompose(['ps', '--quiet']).trim();
    if (!running) await Promise.all([checkPort(environment.HACKATHON_UI_PORT), checkPort(environment.HACKATHON_GATEWAY_PORT)]);
    runCompose(['up', '--detach', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180'], { stdio: 'inherit' });
    console.log(`Running ${environment.HACKATHON_SOURCE_SHA}: http://127.0.0.1:${environment.HACKATHON_UI_PORT}`);
    if (action === 'rollback') console.log('Rollback applies to this invocation. Set HACKATHON_SOURCE_SHA in the private environment before the next up.');
  } else {
    const commands = { down: ['down', '--remove-orphans'], restart: ['restart'], status: ['ps'] };
    runCompose(commands[action], { stdio: 'inherit' });
  }
} catch (error) {
  // Avoid emitting a captured command/config/env that could contain credentials.
  console.error(error instanceof Error && !('status' in error) ? error.message : 'Docker Compose operation failed; inspect this instance without dumping its environment');
  process.exitCode = 1;
}
