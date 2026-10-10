import { isIP } from 'node:net';
import { readDocumentSchemaPolicyFile } from '@barocss/office-service/document-schema-policy';
import type { DocumentSchemaScopePolicy } from '@barocss/office-service/schema-registry-store';

export interface ServerConfig {
  host: string;
  port: number;
  shutdownTimeoutMs: number;
}

function integer(value: string, key: string, min: number, max: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid ${key}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${key}`);
  return parsed;
}

/** Configuration errors name keys only. Never echo environment values. */
export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const host = env.OFFICE_API_HOST ?? '127.0.0.1';
  if (!isIP(host)) throw new Error('Invalid OFFICE_API_HOST');
  return {
    host,
    port: integer(env.OFFICE_API_PORT ?? '4100', 'OFFICE_API_PORT', 1, 65535),
    shutdownTimeoutMs: integer(env.OFFICE_API_SHUTDOWN_TIMEOUT_MS ?? '10000',
      'OFFICE_API_SHUTDOWN_TIMEOUT_MS', 1, 60000),
  };
}

/** Trusted operator input; no caller or model permission data is consulted. */
export function readProjectNoteSchemaPolicy(env: NodeJS.ProcessEnv): DocumentSchemaScopePolicy[] {
  return readDocumentSchemaPolicyFile(env.OFFICE_API_NOTE_DOCUMENT_POLICY_FILE, 'OFFICE_API_NOTE_DOCUMENT_POLICY_FILE');
}
