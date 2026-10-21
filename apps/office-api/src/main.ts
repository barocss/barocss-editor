import { CriterionVerificationStore } from '@barocss/office-service/criterion-verification-store';
import { createCriterionBrowserExecutor } from '@barocss/office-service/criterion-browser-executor';
import { CriterionConfirmationStore } from '@barocss/office-service/criterion-confirmation-store';
import { ProjectExecutionStore } from '@barocss/office-service/project-execution';
import { createLocalAgent } from './local-agent.js';
import { createNative2AgentProposal } from './native2-agent-proposal.js';
import { ProjectStore } from '@barocss/office-service/project-store';
import { readConfig, readProjectNoteSchemaPolicy } from './config.js';
import { readAuthConfig } from './auth-config.js';
import { createOidcVerifier } from './oidc.js';
import { createApiServer } from './server.js';
import { MembershipStore } from '@barocss/office-service/membership-store';
import { PlatformOperatorStore } from '@barocss/office-service/platform-operator-store';
import { CompanyMemberStore } from '@barocss/office-service/company-member-store';
import { DocumentStore } from '@barocss/office-service/document-store';
import pg from 'pg';

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const noteSchemaPolicy = readProjectNoteSchemaPolicy(process.env);
  const authConfig = readAuthConfig(process.env);
  const pool = authConfig ? new pg.Pool({ connectionString: authConfig.databaseUrl,
    max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }) : null;
  const projects = pool ? new ProjectStore(pool, { noteSchemaPolicy }) : null;
  const agent = authConfig && pool ? createLocalAgent(process.env) : null;
  const executionAgent = agent ? { ...agent, ...createNative2AgentProposal(process.env) } : null;
  const app = createApiServer(authConfig && pool && projects ? {
    verifier: createOidcVerifier(authConfig),
    memberships: new MembershipStore(pool),
    workspaces: new MembershipStore(pool),
    operators: new PlatformOperatorStore(pool),
    companyMembers: new CompanyMemberStore(pool),
    documents: new DocumentStore(pool), criterionConfirmations: new CriterionConfirmationStore(pool), criterionVerifications: new CriterionVerificationStore(pool, createCriterionBrowserExecutor()),
    projects,
    projectExecutions: new ProjectExecutionStore(pool, executionAgent, projects),
  } : undefined);
  if (pool) app.addHook('onClose', async () => { await pool.end(); });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      app.server.closeAllConnections();
      console.error(JSON.stringify({ event: 'api_shutdown_timeout' }));
      process.exit(1);
    }, config.shutdownTimeoutMs);
    try {
      await app.close();
      console.log(JSON.stringify({ event: 'api_stopped' }));
    } catch {
      console.error(JSON.stringify({ event: 'api_stop_failed' }));
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  };
  process.on('SIGTERM', () => { void stop(); });
  process.on('SIGINT', () => { void stop(); });
  await app.listen({ port: config.port, host: config.host });
  console.log(JSON.stringify({ event: 'api_listening', port: config.port }));
}

main().catch(() => {
  console.error(JSON.stringify({ event: 'api_start_failed' }));
  process.exitCode = 1;
});
