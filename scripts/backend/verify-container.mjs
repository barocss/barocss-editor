import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
const suffix = randomUUID();
const image = `wonffice-api-check:${suffix}`;
const containers = [];
const docker = (...args) => execFileSync('docker', args, {
  cwd: root, encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const inspect = name => JSON.parse(docker('inspect', name))[0];

// Check before creating resources. This does not install or start a Docker daemon.
docker('version', '--format', '{{.Server.Version}}');
try {
  docker('build', '--tag', image, 'apps/office-api');
  const imageId = docker('image', 'inspect', '--format', '{{.Id}}', image);
  for (const config of ['default', 'explicit']) {
    const name = `wonffice-api-check-${suffix}-${config}`;
    // Cleanup is limited to this run's unique names. Never prune shared resources.
    containers.push(name);
    const env = config === 'explicit'
      ? ['--env', 'OFFICE_API_HOST=0.0.0.0', '--env', 'OFFICE_API_SHUTDOWN_TIMEOUT_MS=2000'] : [];
    docker('run', '--detach', '--name', name, '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--publish', '127.0.0.1::4100',
      '--health-interval=1s', '--health-start-period=1s', ...env, image);
    const started = inspect(name);
    assert.equal(started.Image, imageId, 'Both settings must run the same image');
    assert.equal(started.Config.User, 'node');
    assert.equal(started.HostConfig.ReadonlyRootfs, true);
    assert.notEqual(docker('exec', name, 'id', '-u'), '0', 'Runtime user must not be root');
    const binding = started.NetworkSettings.Ports['4100/tcp'][0];
    assert.equal(binding.HostIp, '127.0.0.1');
    const origin = `http://127.0.0.1:${binding.HostPort}`;
    let healthy = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const state = inspect(name).State;
      assert.equal(state.Running, true, 'Container stopped before becoming live');
      if (state.Health.Status === 'healthy') { healthy = true; break; }
      await delay(1000);
    }
    assert.equal(healthy, true, 'Image HEALTHCHECK did not become healthy');
    const live = await fetch(`${origin}/health/live`, { signal: AbortSignal.timeout(3000) });
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { status: 'alive' });
    const ready = await fetch(`${origin}/health/ready`, { signal: AbortSignal.timeout(3000) });
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: 'service_not_configured' });
    docker('stop', '--time', '15', name);
    const stopped = inspect(name).State;
    assert.equal(stopped.Running, false);
    assert.equal(stopped.ExitCode, 0, 'SIGTERM must exit without a forced kill');
    const events = docker('logs', name).split('\n').map(line => JSON.parse(line).event);
    assert.ok(events.includes('api_listening'));
    assert.ok(events.includes('api_stopped'));
    console.log(JSON.stringify({ result: 'passed', config, imageId,
      checks: ['non-root', 'read-only', 'healthcheck', 'live-200', 'ready-503', 'sigterm-exit-0'] }));
  }
} finally {
  for (const name of containers) {
    try { docker('rm', '--force', name); }
    catch { console.error(`Could not remove test container ${name}`); process.exitCode = 1; }
  }
  try { docker('image', 'rm', image); }
  catch { console.error(`Could not remove test image ${image}`); process.exitCode = 1; }
}
