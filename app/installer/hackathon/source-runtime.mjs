import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createSourceEdge } from './source-edge.mjs';

export async function startSourceRuntime({ values, release, state }) {
  const manifest = JSON.parse(readFileSync(path.join(release, 'build-manifest.json'), 'utf8'));
  if (manifest.source_sha !== values.HACKATHON_SOURCE_SHA) throw new Error('Built source SHA does not match the private environment');
  if (state === release || state.startsWith(`${release}${path.sep}`)) throw new Error('Keep instance state outside the immutable release directory');
  const runtime = path.join(release, 'app/builds/typescript');
  const mcp = path.join(release, 'app/builds/mcp_release/dist/src/index.js');
  const webRoot = path.join(runtime, 'client_web/dist');
  for (const artifact of [mcp, path.join(runtime, 'dist/gateway/server.js'), path.join(webRoot, 'index.html')]) {
    if (!existsSync(artifact)) throw new Error('Missing built runtime artifact; run build-source.mjs build first');
  }
  const defaults = { 'agent-a': 18911, 'agent-b': 18921, 'agent-c': 18931 };
  const kinds = ['memory', 'auth', 'project'];
  const ports = kinds.map((kind, i) => Number(values[`HACKATHON_MCP_${kind.toUpperCase()}_PORT`] || defaults[values.HACKATHON_OWNER] + i));
  const allPorts = [Number(values.HACKATHON_UI_PORT), Number(values.HACKATHON_GATEWAY_PORT), ...ports];
  if (new Set(allPorts).size !== 5 || allPorts.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535)) throw new Error('Runtime ports must be five distinct ports between 1024 and 65535');
  // Inspect every listener before starting any child. Never stop an occupied service.
  await Promise.all(allPorts.map((port) => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', () => reject(new Error(`Loopback port ${port} is occupied; preserve that process`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  })));
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const lock = path.join(state, 'runtime.lock');
  try { closeSync(openSync(lock, 'wx', 0o600)); }
  catch { throw new Error('Instance runtime.lock exists; verify its recorded PID is stopped before removing only this stale lock'); }
  const children = [];
  let stopping = false;
  let edge;
  const cleanup = async (exitCode) => {
    if (stopping) return;
    stopping = true;
    if (edge) edge.close();
    for (const child of children) child.kill('SIGTERM');
    await Promise.race([Promise.all(children.map((child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((resolve) => child.once('exit', resolve)))),
      new Promise((resolve) => setTimeout(resolve, 5000).unref())]);
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    rmSync(lock, { force: true });
    rmSync(path.join(state, 'runtime.json'), { force: true });
    process.exit(exitCode);
  };
  process.once('SIGTERM', () => void cleanup(0));
  process.once('SIGINT', () => void cleanup(0));
  const launch = (entrypoint, env, cwd) => {
    const child = spawn(process.execPath, [entrypoint], { cwd, env, stdio: 'inherit' });
    children.push(child);
    child.once('error', () => void cleanup(1));
    child.once('exit', () => { if (!stopping) { console.error('Required runtime child exited; stopping this instance'); void cleanup(1); } });
    return child;
  };
  const waitForHealth = async (port, healthPath) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/${healthPath}`, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Runtime health did not become ready on port ${port}`);
  };
  try {
    const memory = path.join(state, 'memory');
    const secrets = path.join(state, 'secrets');
    mkdirSync(memory, { recursive: true, mode: 0o700 }); mkdirSync(secrets, { recursive: true, mode: 0o700 });
    const mcpConfig = JSON.parse(readFileSync(path.join(runtime, 'mcp/servers.full-mcp.json'), 'utf8'));
    for (const server of mcpConfig.servers) server.url = `http://127.0.0.1:${ports[kinds.indexOf(server.id)]}/mcp`;
    const mcpConfigPath = path.join(state, 'mcp-servers.json');
    writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2) + '\n', { mode: 0o600 });
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(HACKATHON_|PAA_|BRAINDRIVE_|MCP_|BD_|HOST$|PORT$|SERVER_KIND$|MEMORY_ROOT$)/.test(key)));
    const shared = { ...inherited, NODE_ENV: 'production', PAA_MEMORY_ROOT: memory, PAA_SECRETS_HOME: secrets };
    kinds.forEach((kind, i) => launch(mcp, { ...shared, HOST: '127.0.0.1', PORT: String(ports[i]), SERVER_KIND: kind, MEMORY_ROOT: memory, VERSION: manifest.source_sha }, runtime));
    await Promise.all(ports.map((port) => waitForHealth(port, 'healthz')));
    launch(path.join(runtime, 'dist/gateway/server.js'), { ...shared, ...values,
      BRAINDRIVE_INSTALL_MODE: 'local', BRAINDRIVE_BIND_ADDRESS: '127.0.0.1', BRAINDRIVE_PORT: values.HACKATHON_GATEWAY_PORT,
      BRAINDRIVE_TRUST_PROXY: 'true', BRAINDRIVE_CLIENT_GATEWAY_URL: '/api', BRAINDRIVE_APP_VERSION: `ryadom-${manifest.source_sha}`,
      PAA_SECRETS_MASTER_KEY_B64: values.HACKATHON_SECRETS_MASTER_KEY_B64, PAA_SECRETS_MASTER_KEY_ID: 'ryadom-owner-v1',
      PAA_STARTER_PACK_DIR: path.join(runtime, 'memory/starter-pack'), PAA_AUTH_ALLOW_FIRST_SIGNUP_ANY_IP: 'true', MCP_SERVERS_FILE: mcpConfigPath,
    }, runtime);
    await waitForHealth(Number(values.HACKATHON_GATEWAY_PORT), 'health');
    edge = createSourceEdge({ webRoot, gatewayPort: Number(values.HACKATHON_GATEWAY_PORT), sourceSha: manifest.source_sha });
    await new Promise((resolve, reject) => { edge.once('error', reject); edge.listen(Number(values.HACKATHON_UI_PORT), '127.0.0.1', resolve); });
    writeFileSync(path.join(state, 'runtime.json'), JSON.stringify({ pid: process.pid, source_sha: manifest.source_sha, instance: values.HACKATHON_INSTANCE_ID, ports: allPorts }, null, 2) + '\n', { mode: 0o600 });
    console.log(`Source runtime ready: ${manifest.source_sha} http://127.0.0.1:${values.HACKATHON_UI_PORT}; supervisor PID ${process.pid}`);
  } catch (error) { console.error(error instanceof Error ? error.message : 'Source startup failed'); await cleanup(1); }
}
