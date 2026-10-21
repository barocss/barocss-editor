// Integration-only disposable setup. No IdP mutation, synthetic JWT or implicit inference.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../../office-service/dist/migrate.js';
import { applyMembershipChange } from '../../office-service/dist/membership-admin.js';
import { SchemaRegistryStore } from '../../office-service/dist/schema-registry-store.js';
import { readNoteSnapshotFile } from '../../../packages/office-note-file/dist/index.js';
import { createOidcVerifier } from '../dist/oidc.js';

assert.equal(process.versions.node, '22.22.0');
assert.ok(!process.env.DATABASE_URL && !process.env.OFFICE_API_DATABASE_URL, 'Shared database settings are forbidden');
const runDriver = process.env.NATIVE2_AGENT_RUN_DRIVER ?? 'false';
assert.ok(['true', 'false'].includes(runDriver), 'Inference requires an explicit boolean');
// New subset requires NATIVE2_AGENT_CASES=registered-source-negative, one explicit
// NATIVE2_AGENT_NEGATIVE_CASE and an absolute NATIVE2_AGENT_NEGATIVE_DATA_ROOT.
// Each invocation owns one fresh PG. Root alone may opt into live setup/driver execution.
const cases = process.env.NATIVE2_AGENT_CASES ?? 'four-call';
assert.ok(['four-call', 'predispatch', 'response-loss', 'registered-source-negative', 'held-read', 'target-authority-refusals', 'supported-proposal'].includes(cases), 'Explicit supported case subset required');
const heldReadControl = process.env.NATIVE2_AGENT_HELD_READ_SOURCE_CONTROL;
assert.ok(cases === 'held-read' ? heldReadControl === 'revision-plus-one' : heldReadControl === undefined,
  'Held-read revision control requires its exact explicit subset and value');
const negativeCase = process.env.NATIVE2_AGENT_NEGATIVE_CASE;
const negativeDataRoot = process.env.NATIVE2_AGENT_NEGATIVE_DATA_ROOT;
const negativeSelected = cases === 'registered-source-negative';
const hash = text => createHash('sha256').update(text).digest('hex');
// Frozen DATA12 and Root contract. Input data cannot choose its own oracle.
const negativeContract = {
  "dataManifestSha256": "8577ffa82148e2d83687733670a3707716606bd08c4c1e6719b2997ba1d5a33e",
  "files": [
    {
      "file": "SOURCE_A.json",
      "sha256": "50ff9dc77c5fbbeaafeaad597e6ca1622e2f31177bfb71305580eb8a38e9a7f3",
      "bytes": 9060
    },
    {
      "file": "SOURCE_B.json",
      "sha256": "6253f30d80007a297910a88a8377d04388a14f007dffc5dea02ec3cf33b31f90",
      "bytes": 6837
    },
    {
      "file": "missing-bundle.json",
      "sha256": "354ac65f9d261b633fb6931f80f3616eff3edebe0b7b0d13142dd425a2a4c46c",
      "bytes": 5134
    },
    {
      "file": "partial-bundle.json",
      "sha256": "ac05cce5c09c5c2ef471cfe70e164ef4893af2a220ff555fd375d7bc82b2d17d",
      "bytes": 6835
    },
    {
      "file": "duplicate-same-id-version.json",
      "sha256": "1ec3ea949ad64e4ed89cb722202ee005bde03a78cb1ec8fb34a51acacd438242",
      "bytes": 9852
    },
    {
      "file": "unsupported-sibling.json",
      "sha256": "4cc6c8f10be5ccb6bb98adc03c200ec84083e7bbe29e1f41b739d77ede8984bd",
      "bytes": 9185
    },
    {
      "file": "review-capture-oversize.json",
      "sha256": "9db26adb71457fd0cc43ecf468749452b231e809273cfe6130f3a7d6ef3aa75e",
      "bytes": 74572
    },
    {
      "file": "malformed-json.json",
      "sha256": "f5c03c4fbb55b7dcc0a0c3e289d93326525ab16515010254928a87bf97fb1c53",
      "bytes": 9059
    },
    {
      "file": "immutable-version-conflict.definition.json",
      "sha256": "834ddbb4867552d05ae42fd1b097fdfe8301c32399b4f23b3824e7e87b8a7f22",
      "bytes": 1080
    },
    {
      "file": "unregistered-dependency.definition.json",
      "sha256": "2aa8ba19c3ff8334646585cc89168163666c9d67dff7ad1950ef2026e59ed455",
      "bytes": 1037
    },
    {
      "file": "self-dependency-cycle.definition.json",
      "sha256": "4ae6c30ccdb93e0f98752548046845d04225b7135f0d2a8a9acc3b8206fd5058",
      "bytes": 1037
    },
    {
      "file": "definition-oversize.definition.json",
      "sha256": "1019d7b9cbb69927c8b512d670622cbe2a54f020316cd2014896b9120a58a24f",
      "bytes": 66561
    }
  ],
  "versions": [
    {
      "schemaId": "11111111-1111-1111-1111-111111111111",
      "version": 1,
      "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a",
      "definitionTextBytes": 1037,
      "definitionTextRawSha256": "9954b93d86763a8de3b826b63ba64db20f3465aefb04da8c222f66e3802ad3de"
    },
    {
      "schemaId": "22222222-2222-2222-2222-222222222222",
      "version": 1,
      "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9",
      "definitionTextBytes": 467,
      "definitionTextRawSha256": "6e01051d513209291216f4b5ff37d979183337a2ddeeed92fd7022b6ece1ff72"
    },
    {
      "schemaId": "22222222-2222-2222-2222-222222222222",
      "version": 2,
      "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305",
      "definitionTextBytes": 994,
      "definitionTextRawSha256": "ab26d16af65ef784bd15e6e5958e39cd66c18470a87701aea18da7c9052e53bc"
    }
  ],
  "canonicalCases": [
    {
      "caseId": "missing-bundle",
      "dataFile": "missing-bundle.json",
      "sha256": "354ac65f9d261b633fb6931f80f3616eff3edebe0b7b0d13142dd425a2a4c46c",
      "bytes": 5134,
      "entry": "Project PATCH link-result",
      "expectedStatus": 422,
      "expectedReason": "invalid_snapshot",
      "qualification": "Private fixture installs this full invalid sourceA BEFORE baseline; not a product-accepted edit or paragraph-dispatch bound proof"
    },
    {
      "caseId": "partial-bundle",
      "dataFile": "partial-bundle.json",
      "sha256": "ac05cce5c09c5c2ef471cfe70e164ef4893af2a220ff555fd375d7bc82b2d17d",
      "bytes": 6835,
      "entry": "Project PATCH link-result",
      "expectedStatus": 422,
      "expectedReason": "invalid_snapshot",
      "qualification": "Private fixture installs this full invalid sourceA BEFORE baseline; not a product-accepted edit or paragraph-dispatch bound proof"
    },
    {
      "caseId": "duplicate-same-id-version",
      "dataFile": "duplicate-same-id-version.json",
      "sha256": "1ec3ea949ad64e4ed89cb722202ee005bde03a78cb1ec8fb34a51acacd438242",
      "bytes": 9852,
      "entry": "Project PATCH link-result",
      "expectedStatus": 422,
      "expectedReason": "invalid_snapshot",
      "qualification": "Private fixture installs this full invalid sourceA BEFORE baseline; not a product-accepted edit or paragraph-dispatch bound proof"
    },
    {
      "caseId": "unsupported-sibling",
      "dataFile": "unsupported-sibling.json",
      "sha256": "4cc6c8f10be5ccb6bb98adc03c200ec84083e7bbe29e1f41b739d77ede8984bd",
      "bytes": 9185,
      "entry": "Project PATCH link-result",
      "expectedStatus": 422,
      "expectedReason": "invalid_snapshot",
      "qualification": "Private fixture installs this full invalid sourceA BEFORE baseline; not a product-accepted edit or paragraph-dispatch bound proof"
    },
    {
      "caseId": "review-capture-oversize",
      "dataFile": "review-capture-oversize.json",
      "sha256": "9db26adb71457fd0cc43ecf468749452b231e809273cfe6130f3a7d6ef3aa75e",
      "bytes": 74572,
      "entry": "Project PATCH comment",
      "expectedStatus": 413,
      "expectedReason": "native2_paragraph_review_too_large",
      "qualification": "Valid full native2 source; signed empty Project creation and successful exact link-result200 are deliberate setup BEFORE fresh refusal baseline. Then real native2 review comment must fail before comment/execution reservation/inference. No product limits raised or valid source forced invalid.",
      "preBaselineSetup": {
        "type": "link-result",
        "expectedStatus": 200,
        "projectRevisionAfter": 2,
        "resultId": "actual signed link result UUID, independently verified document/source/pins",
        "idempotencyKey": "negative-review-capture-oversize-link-setup-v1"
      },
      "refusalAction": {
        "type": "comment",
        "resultId": "literal placeholder resolved from actual setup result before baseline",
        "target": {
          "kind": "note-native2-paragraph-review",
          "id": "fixed independently declared UUID in manifest",
          "quote": "JSON.stringify full installedSourceA.document.content[1], exact complete paragraph",
          "selector": {
            "version": 2,
            "pageId": "declared metadata pageId",
            "paragraphIndex": 1
          }
        },
        "body": "Review this exact complete paragraph without writing the document.",
        "source": {
          "documentId": "actual declared A UUID",
          "revision": 1,
          "snapshotHash": "full installedSourceA raw hash"
        }
      }
    },
    {
      "caseId": "malformed-json",
      "dataFile": "malformed-json.json",
      "sha256": "f5c03c4fbb55b7dcc0a0c3e289d93326525ab16515010254928a87bf97fb1c53",
      "bytes": 9059,
      "entry": "Project PATCH link-result",
      "expectedStatus": 422,
      "expectedReason": "invalid_snapshot",
      "qualification": "Private fixture installs this full invalid sourceA BEFORE baseline; not a product-accepted edit or paragraph-dispatch bound proof"
    },
    {
      "caseId": "missing-registered-root",
      "dataFile": "SOURCE_A.json",
      "entry": "Project PATCH link-result",
      "expectedStatus": 422,
      "expectedReason": "dependency_missing",
      "qualification": "Unchanged full A/B, actually registered two-version dependency subset; shared root absent for both"
    }
  ],
  "registryCases": [
    {
      "file": "immutable-version-conflict.definition.json",
      "sha256": "834ddbb4867552d05ae42fd1b097fdfe8301c32399b4f23b3824e7e87b8a7f22",
      "bytes": 1080,
      "schemaId": "11111111-1111-1111-1111-111111111111",
      "version": 1,
      "expected": {
        "http": 409,
        "status": "immutable_version_conflict",
        "prerequisite": "original A root version1 already actually registered; unchanged actual dependency closure; new idempotency key"
      },
      "idempotencyKey": "negative-immutable-version-conflict-v1"
    },
    {
      "file": "unregistered-dependency.definition.json",
      "sha256": "2aa8ba19c3ff8334646585cc89168163666c9d67dff7ad1950ef2026e59ed455",
      "bytes": 1037,
      "schemaId": "99999999-9999-9999-9999-999999999999",
      "version": 1,
      "expected": {
        "http": 422,
        "status": "dependency_missing",
        "prerequisite": "dependency UUID/version independently absent in disposable registry; no counterfeit registry rows"
      },
      "idempotencyKey": "negative-unregistered-dependency-v1"
    },
    {
      "file": "self-dependency-cycle.definition.json",
      "sha256": "4ae6c30ccdb93e0f98752548046845d04225b7135f0d2a8a9acc3b8206fd5058",
      "bytes": 1037,
      "schemaId": "99999999-9999-9999-9999-999999999999",
      "version": 1,
      "expected": {
        "http": 422,
        "status": "dependency_cycle",
        "prerequisite": "intrinsic parse rejects self-reference before registration; cannot call this an admitted cyclic stored registry"
      },
      "idempotencyKey": "negative-self-dependency-cycle-v1"
    },
    {
      "file": "definition-oversize.definition.json",
      "sha256": "1019d7b9cbb69927c8b512d670622cbe2a54f020316cd2014896b9120a58a24f",
      "bytes": 66561,
      "schemaId": "11111111-1111-1111-1111-111111111111",
      "version": 1,
      "expected": {
        "http": 413,
        "status": "definition_too_large",
        "prerequisite": "request transport bound must independently allow this request to reach parser; no raised budgets"
      },
      "idempotencyKey": "negative-definition-oversize-v1"
    }
  ]
};
const negativeCaseIds = ['registry-requests', 'missing-bundle', 'partial-bundle', 'duplicate-same-id-version',
  'unsupported-sibling', 'review-capture-oversize', 'malformed-json', 'missing-registered-root'];
assert.deepEqual(negativeCaseIds, ['registry-requests', ...negativeContract.canonicalCases.map(item => item.caseId)]);
function readNegativeData(selectedCases, caseId, dataRoot) {
  if (selectedCases !== 'registered-source-negative') {
    assert.equal(caseId, undefined, 'Negative case requires the explicit negative subset');
    assert.equal(dataRoot, undefined, 'Negative data root requires the explicit negative subset');
    return undefined;
  }
  assert.ok(negativeCaseIds.includes(caseId), 'NATIVE2_AGENT_NEGATIVE_CASE must select one explicit frozen case');
  assert.ok(dataRoot && isAbsolute(dataRoot), 'NATIVE2_AGENT_NEGATIVE_DATA_ROOT must be absolute');
  const rootStat = lstatSync(dataRoot);
  assert.ok(rootStat.isDirectory() && !rootStat.isSymbolicLink() && rootStat.uid === process.getuid());
  assert.equal(realpathSync(dataRoot), dataRoot);
  const read = name => {
    const path = join(dataRoot, name), stat = lstatSync(path);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid());
    assert.equal(realpathSync(path), path);
    return readFileSync(path);
  };
  const manifestBytes = read('MANIFEST.json');
  assert.equal(hash(manifestBytes), negativeContract.dataManifestSha256, 'Exact immutable DATA12 manifest required');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.sourceCommit, 'fdd58fa326994dee24d9fa843dc11b5cfc269ccc');
  assert.deepEqual(manifest.cases.map(({ file, sha256, bytes }) => ({ file, sha256, bytes })), negativeContract.files);
  const files = {};
  for (const item of negativeContract.files) {
    const bytes = read(item.file), text = bytes.toString('utf8');
    assert.equal(bytes.byteLength, item.bytes); assert.equal(hash(bytes), item.sha256);
    assert.equal(Buffer.byteLength(text, 'utf8'), item.bytes); assert.equal(hash(text), item.sha256);
    files[item.file] = { text, sha256: item.sha256, bytes: item.bytes, dataFile: item.file };
  }
  return files;
}
const negativeData = readNegativeData(cases, negativeCase, negativeDataRoot);
function privateJSON(path) {
  assert.ok(path && isAbsolute(path), 'Explicit protected input required');
  const file = lstatSync(path), parent = lstatSync(dirname(path));
  assert.ok(file.isFile() && !file.isSymbolicLink() && file.uid === process.getuid() && (file.mode & 0o777) === 0o600);
  assert.ok(parent.isDirectory() && !parent.isSymbolicLink() && parent.uid === process.getuid() && (parent.mode & 0o777) === 0o700);
  assert.equal(realpathSync(path), path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
const real = privateJSON(process.env.OFFICE_AUTH_REAL_FILE);
const tokens = privateJSON(process.env.NATIVE2_AGENT_TOKEN_FILE);
assert.deepEqual(Object.keys(tokens).sort(), ['editor', 'viewer']);
assert.match(real.issuer, /^http:\/\/127\.0\.0\.1:\d+\/realms\/wonffice-local$/);
assert.equal(real.clientId, 'wonffice-browser');
assert.equal(real.audience, 'wonffice-api');
const auth = { issuer: real.issuer, audience: real.audience,
  jwksUrl: new URL(`${real.issuer}/protocol/openid-connect/certs`), algorithms: ['RS256'], databaseUrl: 'postgresql://unused-fixture-config' };
const verifier = createOidcVerifier(auth);
const actor = await verifier.verify(tokens.editor), viewer = await verifier.verify(tokens.viewer);
assert.equal(actor.issuer, real.issuer); assert.equal(viewer.issuer, real.issuer);
assert.equal(actor.subject, real.users['alpha-editor'].id);
assert.equal(viewer.subject, real.users['beta-viewer'].id);
assert.notEqual(actor.subject, viewer.subject);

const literal = readFileSync(new URL('../../note/src/native2-scenario-fixtures.ts', import.meta.url), 'utf8');
const start = literal.indexOf('{'), end = literal.indexOf('\n};', start);
assert.ok(start >= 0 && end > start, 'Full independently authored corpus required');
const declared = JSON.parse(literal.slice(start, end + 2));
const corpus = { SOURCE_A: declared.SOURCE_A, SOURCE_B: declared.SOURCE_B };
const raw = Object.fromEntries(Object.entries(corpus).map(([key, file]) => [key, JSON.stringify(file, null, 2) + '\n']));
const nativeJSON = value => JSON.parse(JSON.stringify(value), (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item) ? Object.assign(Object.create(null), item) : item);
for (const [key, file] of Object.entries(corpus)) {
  const admitted = readNoteSnapshotFile(raw[key]);
  assert.ok(!('error' in admitted), 'Actual codec must admit the full independent file');
  assert.deepEqual(admitted.document, nativeJSON(file.document));
  assert.deepEqual(admitted.schemaBundle, nativeJSON(file.schemaBundle));
}
if (negativeSelected) {
  for (const name of ['SOURCE_A', 'SOURCE_B']) assert.equal(negativeData[`${name}.json`].text, raw[name], 'Full original corpus must match immutable DATA12');
}
const canonicalCase = negativeContract.canonicalCases.find(item => item.caseId === negativeCase);
const installedRaw = { ...raw };
if (negativeSelected) installedRaw.SOURCE_A = negativeData[canonicalCase?.dataFile ?? 'SOURCE_A.json'].text;
const outputParent = process.env.NATIVE2_AGENT_FIXTURE_ROOT;
assert.ok(outputParent && isAbsolute(outputParent) && outputParent.startsWith('/Users/user/.codex/visualizations/'));
assert.equal(realpathSync(outputParent), outputParent);
const parentStat = lstatSync(outputParent);
assert.ok(parentStat.isDirectory() && !parentStat.isSymbolicLink() && parentStat.uid === process.getuid());
const output = mkdtempSync(join(outputParent, 'private-fixture-')); chmodSync(output, 0o700);
const write = (name, value) => writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
write('tokens.json', tokens);
const directory = realpathSync(mkdtempSync('/tmp/wonffice-native2-agent-'));
const data = join(directory, 'data'), socket = join(directory, 'socket');
mkdirSync(socket, { mode: 0o700 });
const bin = process.env.PG_BIN;
assert.ok(bin && isAbsolute(bin) && existsSync(join(bin, 'initdb')));
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
const config = user => ({ host: socket, port: 5432, database: 'office_test', user });
const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspaceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const foreignTenantId = randomUUID(), setupSubject = `setup-only:508:${randomUUID()}`;
const capabilities = ['note.field.text.v1', 'note.field.choice.v1', 'note.field.boolean.v1', 'note.field.number.v1'];
const report = { status: 'INCOMPLETE', databaseGeneration: randomUUID(), runDriver: runDriver === 'true',
  setupOwner: 'Private registration fixture only; no genuine login or human approval',
  rawHashes: Object.fromEntries(Object.entries(raw).map(([name, text]) => [name, hash(text)])),
  driver: null, databaseStopped: false, clusterRemoved: false };
const setupEvents = [];
const setupEvent = (kind, evidence) => {
  if (negativeSelected) setupEvents.push({ sequence: setupEvents.length, kind, completedAt: new Date().toISOString(), ...evidence });
};
let admin, owner, pool, child, started = false;
let closePromise;
function close() {
  if (closePromise) return closePromise;
  closePromise = (async () => {
    const errors = [];
    if (child && child.exitCode === null && child.signalCode === null) {
      try {
        await new Promise((resolve, reject) => {
          let forced = false;
          const deadline = setTimeout(() => { forced = true; child.kill('SIGKILL'); }, 15000);
          child.once('exit', (code, signal) => {
            clearTimeout(deadline); report.driver = { pid: child.pid, code, signal, forced };
            if (forced) reject(new Error('driver_forced_cleanup')); else resolve();
          });
          child.kill('SIGTERM');
        });
      } catch (error) { errors.push(error); }
    }
    for (const client of [pool, owner, admin]) {
      if (client) try { await client.end(); } catch (error) { errors.push(error); }
    }
    if (started) try { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false; }
    catch (error) { errors.push(error); }
    report.databaseStopped = !started;
    if (!started) { rmSync(directory, { recursive: true, force: true }); report.clusterRemoved = !existsSync(directory); }
    if (errors.length) { report.status = 'FAILED'; report.cleanupFailure = 'owned_resource_cleanup_failed'; }
    write('fixture-result.json', report);
    if (errors.length) throw errors[0];
  })();
  return closePromise;
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  report.status = 'INTERRUPTED'; void close().then(() => process.exit(1), () => process.exit(1));
});
try {
  run('initdb', ['-D', data, '-U', 'wonffice_test_admin', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${socket} -h ''`, '-w', 'start']); started = true;
  admin = new pg.Client({ ...config('wonffice_test_admin'), database: 'postgres' }); await admin.connect();
  await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await admin.query('CREATE DATABASE office_test OWNER wonffice_owner');
  owner = new pg.Client(config('wonffice_owner')); await owner.connect(); await migrate(owner);
  for (const [id, tenantName] of [[tenantId, 'Native2 agent target'], [foreignTenantId, 'Native2 foreign phase']]) {
    await applyMembershipChange(owner, { action: 'bootstrap_owner', tenantId: id, issuer: real.issuer, subject: setupSubject,
      tenantName, approvalRef: `setup-owner-${id}` });
  }
  await applyMembershipChange(owner, { action: 'grant', tenantId, issuer: actor.issuer, subject: actor.subject, role: 'editor', approvalRef: 'setup-current-editor' });
  for (const id of [tenantId, foreignTenantId]) await applyMembershipChange(owner, { action: 'grant', tenantId: id,
    issuer: viewer.issuer, subject: viewer.subject, role: 'viewer', approvalRef: `setup-current-viewer-${id}` });
  await owner.query('INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,$3)', [tenantId, workspaceId, 'Native2 full sources']);
  let membership;
  if (negativeSelected) {
    const rows = (await owner.query(`SELECT i.issuer,i.subject,m.identity_id,m.tenant_id,m.role,m.revoked_at
      FROM wonffice.tenant_memberships m JOIN wonffice.identities i ON i.id=m.identity_id
      WHERE i.issuer=$1 AND i.subject=ANY($2::text[]) ORDER BY i.issuer,i.subject,m.tenant_id`,
      [real.issuer, [actor.subject, viewer.subject, setupSubject]])).rows;
    const setupOwner = (await owner.query('SELECT id FROM wonffice.identities WHERE issuer=$1 AND subject=$2', [real.issuer, setupSubject])).rows;
    assert.equal(setupOwner.length, 1);
    assert.notEqual(setupSubject, actor.subject); assert.notEqual(setupSubject, viewer.subject);
    const expected = [[actor.subject, tenantId, 'editor'], [viewer.subject, tenantId, 'viewer'],
      [viewer.subject, foreignTenantId, 'viewer'], [setupSubject, tenantId, 'owner'], [setupSubject, foreignTenantId, 'owner']];
    assert.equal(rows.length, expected.length);
    for (const [subject, id, role] of expected) {
      const observed = rows.filter(row => row.subject === subject && row.tenant_id === id);
      assert.equal(observed.length, 1); assert.equal(observed[0].role, role); assert.equal(observed[0].revoked_at, null);
      if (subject === setupSubject) assert.equal(observed[0].identity_id, setupOwner[0].id);
    }
    membership = { principals: { editor: { issuer: actor.issuer, subject: actor.subject }, viewer: { issuer: viewer.issuer, subject: viewer.subject } },
      rows, setupOwner: { issuer: real.issuer, subject: setupSubject, identityId: setupOwner[0].id, role: 'owner', genuineLogin: false } };
    setupEvent('membership', { membership });
  }
  pool = new pg.Pool({ ...config('wonffice_app'), max: 2 });
  const registry = new SchemaRegistryStore(pool, [{ tenantId, workspaceId, readRoles: ['owner'], registerRoles: ['owner'], capabilities }]);
  const pending = new Map();
  for (const file of Object.values(corpus)) for (const row of file.schemaBundle.definitions) {
    const key = `${row.reference.schemaId}:${row.reference.version}`;
    if (pending.has(key)) assert.deepEqual(pending.get(key), row);
    pending.set(key, row);
  }
  if (negativeSelected) {
    assert.equal(pending.size, 3, 'Original A/B have three unique closure versions');
    for (const item of negativeContract.versions) {
      const row = pending.get(`${item.schemaId}:${item.version}`);
      assert.ok(row); assert.equal(row.reference.digest, item.digest);
      assert.equal(hash(row.definitionText), item.definitionTextRawSha256);
      assert.equal(Buffer.byteLength(row.definitionText, 'utf8'), item.definitionTextBytes);
    }
    if (negativeCase === 'missing-registered-root') pending.delete('11111111-1111-1111-1111-111111111111:1');
  }
  const registered = new Set();
  while (pending.size) {
    let progressed = false;
    for (const [key, row] of pending) {
      const definition = JSON.parse(row.definitionText);
      const refs = [...(definition.parent ? [definition.parent] : []), ...definition.dependencies];
      if (refs.some(ref => !registered.has(`${ref.schemaId}:${ref.version}`))) continue;
      const receipt = await registry.register({ issuer: real.issuer, subject: setupSubject }, tenantId, workspaceId,
        row.reference.schemaId, row.reference.version, { definitionText: row.definitionText, idempotencyKey: `setup-${key}` });
      assert.equal(receipt.record.digest, row.reference.digest);
      setupEvent('registration', { key, definitionText: row.definitionText, reference: row.reference, receipt });
      registered.add(key); pending.delete(key); progressed = true;
    }
    assert.ok(progressed, 'Full declared closure must resolve');
  }
  let registeredRows;
  if (negativeSelected) {
    const versions = (await owner.query('SELECT to_jsonb(t) AS row FROM wonffice.schema_versions t ORDER BY to_jsonb(t)::text')).rows.map(item => item.row);
    const receipts = (await owner.query('SELECT to_jsonb(t) AS row FROM wonffice.schema_registry_receipts t ORDER BY to_jsonb(t)::text')).rows.map(item => item.row);
    const expected = negativeContract.versions.filter(item => negativeCase !== 'missing-registered-root' || item.schemaId !== '11111111-1111-1111-1111-111111111111');
    assert.equal(versions.length, expected.length); assert.equal(receipts.length, expected.length);
    const dependenciesFor = root => {
      const found = new Map();
      const visit = row => {
        const key = `${row.schema_id}:${row.version}`;
        if (found.has(key)) return;
        found.set(key, row);
        const definition = JSON.parse(row.definition_text);
        for (const ref of [...(definition.parent ? [definition.parent] : []), ...definition.dependencies]) {
          const dependency = versions.find(value => value.schema_id === ref.schemaId && value.version === ref.version);
          assert.ok(dependency); assert.equal(dependency.digest, ref.digest); visit(dependency);
        }
      };
      visit(root); found.delete(`${root.schema_id}:${root.version}`);
      return [...found.values()];
    };
    for (const item of expected) {
      const records = versions.filter(row => row.schema_id === item.schemaId && row.version === item.version);
      assert.equal(records.length, 1); const row = records[0];
      assert.equal(row.tenant_id, tenantId); assert.equal(row.workspace_id, workspaceId);
      assert.equal(row.digest, item.digest); assert.equal(hash(row.canonical_text), item.digest);
      assert.equal(row.actor_identity_id, membership.setupOwner.identityId);
      assert.equal(hash(row.definition_text), item.definitionTextRawSha256);
      assert.equal(Buffer.byteLength(row.definition_text, 'utf8'), item.definitionTextBytes);
      const original = Object.values(corpus).flatMap(file => file.schemaBundle.definitions)
        .find(def => def.reference.schemaId === item.schemaId && def.reference.version === item.version);
      assert.equal(row.definition_text, original.definitionText);
      const matches = receipts.filter(receipt => receipt.result.record.schemaId === item.schemaId && receipt.result.record.version === item.version);
      assert.equal(matches.length, 1); const receipt = matches[0], result = receipt.result;
      assert.equal(receipt.tenant_id, tenantId); assert.equal(receipt.workspace_id, workspaceId);
      assert.equal(receipt.identity_id, membership.setupOwner.identityId);
      assert.equal(receipt.idempotency_key, `setup-${item.schemaId}:${item.version}`);
      assert.equal(receipt.request_hash, hash(JSON.stringify(['schema-register-v1', tenantId, workspaceId, item.schemaId, item.version, row.definition_text])));
      assert.equal(result.operation, 'register'); assert.equal(result.requesterIdentityId, receipt.identity_id);
      assert.equal(result.requestHash, receipt.request_hash); assert.equal(result.idempotencyKey, receipt.idempotency_key);
      assert.equal(result.record.definitionText, row.definition_text); assert.equal(result.record.canonicalText, row.canonical_text);
      assert.equal(result.record.digest, row.digest); assert.equal(result.record.actorIdentityId, row.actor_identity_id);
      const dependencies = dependenciesFor(row);
      assert.equal(result.dependencies.length, dependencies.length);
      assert.deepEqual(result.dependencies.map(value => `${value.schemaId}:${value.version}`).sort(),
        dependencies.map(value => `${value.schema_id}:${value.version}`).sort());
      for (const dependency of result.dependencies) {
        const stored = dependencies.find(value => value.schema_id === dependency.schemaId && value.version === dependency.version);
        assert.ok(stored); assert.equal(dependency.digest, stored.digest);
        assert.equal(dependency.definitionText, stored.definition_text); assert.equal(dependency.canonicalText, stored.canonical_text);
      }
    }
    registeredRows = { schemaVersionCount: versions.length, registryReceiptCount: receipts.length, versions, receipts };
    setupEvent('registrations', { registered: registeredRows,
      qualification: negativeCase === 'missing-registered-root' ? 'Shared root omitted for both A/B; neither is claimed registry-admissible' : 'Three unique original closure versions registered' });
  }
  const creator = (await owner.query('SELECT id FROM wonffice.identities WHERE issuer=$1 AND subject=$2', [actor.issuer, actor.subject])).rows[0].id;
  const documents = {}, heads = {};
  for (const [name, file] of Object.entries(corpus)) {
    const id = randomUUID();
    await owner.query(`INSERT INTO wonffice.documents(tenant_id,id,workspace_id,product,title,page_id,document_key,creator_user_id)
      VALUES($1,$2,$3,'note',$4,$5,$6,$7)`, [tenantId, id, workspaceId, name, file.document.attributes.pageId, `wonffice-${tenantId}-${id}`, creator]);
    await owner.query(`INSERT INTO wonffice.document_snapshots(tenant_id,document_id,file_format,file_version,snapshot_text,snapshot_hash,revision)
      VALUES($1,$2,'barocss-note',2,$3,$4,1)`, [tenantId, id, installedRaw[name], hash(installedRaw[name])]);
    const rows = (await owner.query('SELECT snapshot_text,snapshot_hash,revision FROM wonffice.document_snapshots WHERE tenant_id=$1 AND document_id=$2', [tenantId, id])).rows;
    assert.equal(rows.length, 1); assert.deepEqual(rows[0], { snapshot_text: installedRaw[name], snapshot_hash: hash(installedRaw[name]), revision: 1 });
    documents[name] = { id, revision: 1, paragraphIndex: name === 'SOURCE_A' ? 1 : 0 };
    if (negativeSelected) {
      const fullRows = (await owner.query(`SELECT d.id,d.tenant_id,d.workspace_id,d.product,d.mode,d.page_id,
        s.file_format,s.file_version,s.snapshot_text,s.snapshot_hash,s.revision
        FROM wonffice.documents d JOIN wonffice.document_snapshots s ON s.tenant_id=d.tenant_id AND s.document_id=d.id
        WHERE d.tenant_id=$1 AND d.id=$2`, [tenantId, id])).rows;
      assert.equal(fullRows.length, 1);
      const expected = { id, tenant_id: tenantId, workspace_id: workspaceId, product: 'note', mode: 'snapshot',
        page_id: file.document.attributes.pageId, file_format: 'barocss-note', file_version: 2,
        snapshot_text: installedRaw[name], snapshot_hash: hash(installedRaw[name]), revision: 1 };
      assert.deepEqual(fullRows[0], expected); heads[name] = fullRows[0];
    }
  }
  const fixture = { kind: 'wonffice.native2-agent.private-fixture.v1', integrationLease: randomUUID(), databaseGeneration: report.databaseGeneration,
    auth: { issuer: auth.issuer, audience: auth.audience, jwksUrl: auth.jwksUrl.href }, tokenFile: join(output, 'tokens.json'),
    actor: { ...actor, role: 'editor' }, viewer: { ...viewer, role: 'viewer' }, tenantId, workspaceId, foreignTenantId,
    pg: { ...config('wonffice_app'), appUser: 'wonffice_app', ownerUser: 'wonffice_owner', auditUser: 'wonffice_backup' }, documents,
    noteSchemaPolicy: [{ tenantId, workspaceId, readRoles: ['editor', 'viewer'], preserveRoles: [], adoptRoles: [], capabilities }] };
  if (negativeSelected) {
    setupEvent('source-installation', { heads, originalRaw: { SOURCE_A: negativeData['SOURCE_A.json'], SOURCE_B: negativeData['SOURCE_B.json'] },
      installedSourceA: negativeData[canonicalCase?.dataFile ?? 'SOURCE_A.json'], productAcceptedEdit: false, modelDispatches: 0 });
    const noEffects = { allowedEffectTables: [], modelDispatches: 0 };
    const registryPolicy = [{ tenantId, workspaceId, readRoles: ['editor', 'viewer'], registerRoles: ['editor'], capabilities }];
    const expected = canonicalCase ? [{ entry: 'Project PATCH link-result', method: 'PATCH',
      path: '/v1/tenants/{tenantId}/projects/{projectId}', idempotencyKey: `negative-${negativeCase}-v1`,
      action: { type: 'link-result', name: 'Complete A', document: { product: 'note', id: documents.SOURCE_A.id } },
      status: canonicalCase.expectedStatus, reason: canonicalCase.expectedReason, ...noEffects }]
      : negativeContract.registryCases.map(item => ({ entry: 'SchemaServer PUT', method: 'PUT',
        path: `/v1/tenants/${tenantId}/workspaces/${workspaceId}/schemas/${item.schemaId}/versions/${item.version}`,
        idempotencyKey: item.idempotencyKey, body: { definitionText: negativeData[item.file].text, idempotencyKey: item.idempotencyKey },
        status: item.expected.http, reason: item.expected.status, ...noEffects }));
    const manifest = { kind: 'wonffice.native2-agent.registered-source-negatives.v1', integrationLease: fixture.integrationLease,
      databaseGeneration: fixture.databaseGeneration, dataManifestSha256: negativeContract.dataManifestSha256, caseId: negativeCase,
      raw: { SOURCE_A: negativeData['SOURCE_A.json'], SOURCE_B: negativeData['SOURCE_B.json'],
        installedSourceA: negativeData[canonicalCase?.dataFile ?? 'SOURCE_A.json'] }, heads, registered: registeredRows, membership,
      noteSchemaPolicy: fixture.noteSchemaPolicy, setupEvents, completedAt: new Date().toISOString(), expected,
      restore: { required: false, disposableDatabase: true, acceptedVersionsDeletedOrRewritten: false } };
    if (negativeCase === 'review-capture-oversize') {
      // Valid native2 source: the driver must sign/link it before the fresh comment baseline.
      // Project/result templates are resolved only in separate driver request evidence.
      const installed = JSON.parse(manifest.raw.installedSourceA.text);
      manifest.preBaselineSetup = { type: 'link-result', method: 'PATCH',
        path: '/v1/tenants/{tenantId}/projects/{projectId}', expectedRevision: 1,
        idempotencyKey: canonicalCase.preBaselineSetup.idempotencyKey,
        action: { type: 'link-result', name: 'Complete A', document: { product: 'note', id: documents.SOURCE_A.id } },
        expectedStatus: 200, projectRevisionAfter: 2, resultId: '{resultId}' };
      manifest.expected = [{ ...expected[0], entry: 'Project PATCH comment',
        action: { type: 'comment', resultId: '{resultId}',
          target: { kind: 'note-native2-paragraph-review', id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            quote: JSON.stringify(installed.document.content[1]),
            selector: { version: 2, pageId: corpus.SOURCE_A.document.attributes.pageId, paragraphIndex: 1 } },
          body: 'Review this exact complete paragraph without writing the document.',
          source: { documentId: documents.SOURCE_A.id, revision: 1, snapshotHash: manifest.raw.installedSourceA.sha256 } } }];
    }
    if (negativeCase === 'registry-requests') {
      manifest.registryRequests = negativeContract.registryCases.map(item => negativeData[item.file]);
      manifest.registryPolicy = registryPolicy;
      manifest.registryRequester = { credentialKey: 'editor', issuer: actor.issuer, subject: actor.subject, role: 'editor' };
    }
    write('registered-source-negative-manifest.json', manifest);
    fixture.registeredSourceNegativeManifestFile = join(output, 'registered-source-negative-manifest.json');
    // Registry definitions use null-prototype objects; bind the complete JSON wire value.
    assert.deepEqual(privateJSON(fixture.registeredSourceNegativeManifestFile), JSON.parse(JSON.stringify(manifest)));
    report.registeredSourceNegative = { caseId: negativeCase, dataManifestSha256: negativeContract.dataManifestSha256,
      manifestFile: fixture.registeredSourceNegativeManifestFile, manifestSha256: hash(readFileSync(fixture.registeredSourceNegativeManifestFile)),
      dataRoot: negativeDataRoot, actualRequests: 'UNRUN_BY_SETUP', modelDispatches: 0 };
  }
  write('fixture.json', fixture);
  report.registeredVersions = registered.size;
  report.documents = documents;
  if (runDriver === 'true') {
    const driverPath = fileURLToPath(new URL('./native2-agent-proposal.integration.mjs', import.meta.url));
    assert.ok(existsSync(driverPath), 'Frozen corrected Agent driver must be imported first');
    child = spawn(process.execPath, [driverPath], { env: { ...process.env, NATIVE2_AGENT_FIXTURE: join(output, 'fixture.json'),
      NATIVE2_AGENT_EVIDENCE: join(output, 'driver-evidence') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
    report.driver = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ pid: child.pid, code, signal })); });
    writeFileSync(join(output, 'driver.log'), log, { mode: 0o600 });
    assert.equal(report.driver.code, 0); assert.equal(report.driver.signal, null);
    report.status = 'PARTIAL_DRIVER_COMPLETED_ORIGINAL_ACCEPTANCE_INCOMPLETE';
  } else report.status = 'SETUP_ONLY_PASSED_NO_API_MODEL_ORIGINAL_ACCEPTANCE';
} catch (error) {
  report.status = 'FAILED'; report.failure = error instanceof assert.AssertionError ? 'assertion_failed' : 'fixture_operation_failed';
  throw error;
} finally { await close(); }
console.log(JSON.stringify({ status: report.status, evidence: output, databaseStopped: report.databaseStopped, clusterRemoved: report.clusterRemoved }));
