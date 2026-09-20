import { readConfig } from './config.js';
import { createApiServer } from './server.js';

function main(): void {
  const config = readConfig(process.env);
  const server = createApiServer();
  let stopping = false;
  server.on('error', () => {
    console.error(JSON.stringify({ event: 'api_error' }));
    process.exitCode = 1;
  });
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exitCode = 1;
    }, config.shutdownTimeoutMs);
    deadline.unref();
    server.close(() => {
      clearTimeout(deadline);
      console.log(JSON.stringify({ event: 'api_stopped' }));
    });
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  server.listen(config.port, config.host, () => {
    console.log(JSON.stringify({ event: 'api_listening', port: config.port }));
  });
}

try {
  main();
} catch {
  console.error(JSON.stringify({ event: 'api_start_failed' }));
  process.exitCode = 1;
}
