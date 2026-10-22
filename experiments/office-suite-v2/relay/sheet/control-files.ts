import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { updateHash } from '../../src/durable-store.ts';
import type { SheetRelayReceipt } from '../../src/sheet-preview-protocol.ts';

function regular(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('control-file-not-regular');
}
function read(path: string): unknown {
  regular(path); if (lstatSync(path).size > 128_000) throw new Error('control-file-limit');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function syncDirectory(directory: string): void { const fd = openSync(directory, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`).join(',')}}`;
  const encoded = JSON.stringify(value); if (encoded === undefined) throw new Error('invalid-control-value'); return encoded;
}
function write(directory: string, name: string, value: unknown, immutable = false): void {
  const path = join(directory, name), temporary = join(directory, `.relay-control-${randomUUID()}`);
  if (existsSync(path)) regular(path);
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
  try { if (immutable) linkSync(temporary, path); else renameSync(temporary, path); syncDirectory(directory); }
  finally { if (existsSync(temporary)) { unlinkSync(temporary); syncDirectory(directory); } }
}
const ownerName = 'relay-owner.json';
export function checkOwner(directory: string): void {
  const path = join(directory, ownerName); if (!existsSync(path)) return;
  const value = read(path);
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'pid,token,version' || Reflect.get(value, 'version') !== 1 ||
      typeof Reflect.get(value, 'token') !== 'string' || !Number.isSafeInteger(Reflect.get(value, 'pid')) || Reflect.get(value, 'pid') < 1) throw new Error('invalid-owner-claim');
  try { process.kill(Reflect.get(value, 'pid'), 0); }
  catch (error) {
    if (error && typeof error === 'object' && Reflect.get(error, 'code') === 'ESRCH') return;
    throw new Error('owner-state-unknown');
  }
  throw new Error('relay-writer-active');
}
export function claimOwner(directory: string): string {
  // Called only AFTER acquiring the original native SQLite exclusive writer.
  checkOwner(directory); const token = randomUUID();
  write(directory, ownerName, { version: 1, pid: process.pid, token }); return token;
}
export function releaseOwner(directory: string, token: string): void {
  const path = join(directory, ownerName), value = read(path);
  if (!value || typeof value !== 'object' || Reflect.get(value, 'pid') !== process.pid || Reflect.get(value, 'token') !== token) throw new Error('owner-claim-changed');
  unlinkSync(path); syncDirectory(directory);
}

function markerDirectory(directory: string, create = false): string {
  const target = join(directory, 'receipt-audit');
  if (create && !existsSync(target)) { mkdirSync(target, { mode: 0o700 }); syncDirectory(directory); }
  const stat = lstatSync(target); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('receipt-audit-directory');
  return target;
}
function markerName(updateId: string): string { return `${updateHash(new TextEncoder().encode(updateId))}.json`; }
export function initializeReceiptMarkers(directory: string): void { markerDirectory(directory, true); }
/** Marker must be durable before returning either a receipt or injected ACK loss. */
export function recordReceipt(directory: string, receipt: SheetRelayReceipt): void {
  const target = markerDirectory(directory), path = join(target, markerName(receipt.updateId));
  const value = { version: 1, receipt };
  if (existsSync(path)) {
    if (canonical(read(path)) !== canonical(value)) throw new Error('receipt-marker-collision');
    // A previous link may have succeeded before its directory fsync failed.
    // Matching bytes alone do not establish that directory entry's durability.
    syncDirectory(target);
    return;
  }
  write(target, markerName(receipt.updateId), value, true);
}
/** Confirmed receipt removal/alteration is checked independently of orphan packet audits. */
export function validateReceiptMarkers(directory: string, receipts: readonly SheetRelayReceipt[]): void {
  const target = markerDirectory(directory), expected = new Map(receipts.map(receipt => [markerName(receipt.updateId), canonical({ version: 1, receipt })]));
  for (const name of readdirSync(target)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) throw new Error('receipt-marker-name');
    const actual = canonical(read(join(target, name)));
    if (expected.get(name) !== actual) throw new Error('confirmed-receipt-missing-or-changed');
  }
  // A native COMMIT may precede marker persistence/process death. Such accepted
  // rows are replay-validated from prepared audits; no old response is invented.
}
