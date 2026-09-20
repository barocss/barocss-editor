import pg from 'pg';
import { migrate } from './migrate.js';

const connectionString = process.env.OFFICE_MIGRATION_DATABASE_URL;
if (!connectionString) {
  console.error(JSON.stringify({ event: 'migration_failed', reason: 'missing_database_url' }));
  process.exitCode = 1;
} else {
  let client: pg.Client | undefined;
  try {
    client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    const applied = await migrate(client);
    console.log(JSON.stringify({ event: 'migration_complete', applied }));
  } catch {
    // Driver errors may contain database URLs, SQL, or customer values.
    console.error(JSON.stringify({ event: 'migration_failed' }));
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
