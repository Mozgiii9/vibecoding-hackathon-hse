const ports = process.argv.includes('--mcp-only') ? [8911, 8912, 8913] : [8787, 8911, 8912, 8913];
try {
  await Promise.all(ports.map(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/${port === 8787 ? 'health' : 'healthz'}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('unhealthy');
  }));
} catch { process.exitCode = 1; }
