"""Build a source-bound evidence index. Never executes product code or a benchmark."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path


HERE = Path(__file__).resolve().parent
VERIFY = HERE.parent
ROOT = VERIFY.parents[2]
BASE = '4dc191bc442c260ab320f3d8a229fe2c3db98d9f'
OUT = VERIFY / 'reports/m0-decision-pack-v1'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_text())


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def tree(pin):
    result = {}
    for row in git('ls-tree', '-r', '-z', pin).split(b'\0'):
        if row:
            meta, name = row.split(b'\t', 1)
            result[name.decode()] = meta.split()[2].decode()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence-root', type=Path, required=True)
    args = parser.parse_args()
    external = args.evidence_root.resolve()
    contract = read(HERE / 'criteria-v1.json')
    capability = read(HERE / 'file-capabilities-v1.json')
    assert contract['base'] == capability['sourceBase'] == BASE
    git('merge-base', '--is-ancestor', BASE, 'HEAD')
    base_tree = tree(BASE)
    entries, snapshots, groups = [], {}, []

    def evidence(key, path, description, snapshot=False):
        data = path.read_bytes()
        item = {'id': key, 'origin': str(path) if snapshot else str(path.relative_to(ROOT)),
                'sha256': sha(data), 'bytes': len(data), 'description': description}
        if snapshot:
            destination = OUT / 'evidence' / (key + path.suffix)
            item['path'] = str(destination.relative_to(ROOT))
            snapshots[destination] = data
        else:
            item['path'] = str(path.relative_to(ROOT))
        entries.append(item)

    def group(key, pin, files, boundary):
        qualified_tree = tree(pin)
        rows = []
        for item in files:
            path = item['path']
            data = (ROOT / path).read_bytes()
            assert sha(data) == item['sha256'], ('source mismatch', key, path)
            assert base_tree[path] == qualified_tree[path], ('blob mismatch', key, path)
            rows.append({'path': path, 'sha256': sha(data), 'bytes': len(data), 'blob': base_tree[path]})
        groups.append({'id': key, 'qualifiedSource': pin, 'currentBase': BASE,
                       'boundary': boundary, 'files': rows, 'allMatch': True})

    word_outcome = read(external / 'word100-outcome-final-result.json')
    word_assessment = read(external / 'word100-normal-qualification-v1/assessment.json')
    word_raw = read(external / 'word100-normal-qualification-v1/report.json')
    assert word_raw['source']['head'] == word_assessment['sourceHead'] == word_outcome['measuredSource']['head']
    assert len(word_raw['samples']) == 6
    for profile in word_assessment['profiles']:
        samples = [s for s in word_raw['samples'] if s['pages'] == profile['pages']]
        assert len(samples) == 3
        assert [s['peakAggregateOwnedRssBytes'] for s in samples] == profile['RSSBytes']
        assert all(value <= profile['limitBytes'] for value in profile['RSSBytes'])
        assert all(metric['pass'] for metric in profile['timings'])
        assert all(metric['qualified'] for metric in profile['repeatability'].values())
        assert profile['methodAndCleanupPass'] and profile['allRSSPass']
    assert word_assessment['methodQualityPass']
    assert word_outcome['allRSSAndOriginalTimingFontRepeatabilityNodeGrowthGatesPass']
    for item in word_outcome['evidence']:
        data = Path(item['path']).read_bytes()
        assert sha(data) == item['sha256'] and len(data) == item['bytes'], item['path']
    word_binding = read(external / 'word100-bindings-before-h7-v1.json')
    group('word-qualification', word_raw['source']['head'], word_binding['files'],
          '1215 recorded qualification inputs; source superset, not every file dynamically loaded. '
          'Historical 654 dependency aliases remain in the immutable binding snapshot, not current author-root runtime claims.')

    sheet = read(VERIFY / 'reports/sheet-candidate-assessment-v2.json')
    assert all(g['targetMet'] and g['repeatable'] for g in sheet['gates'])
    assert sheet['memory']['targetMet'] and not sheet['nonrepeatablePhases']
    assert sha((VERIFY / sheet['rawReport']).read_bytes()) == sheet['rawSha256']
    group('sheet-scale', sheet['sourceHead'], sheet['reuseBindings']['allNamedSourceAndHarnessFiles'],
          'Exactly the recorded ten source/harness/budget inputs; headless native model only.')

    native_names = ['contracts', 'workbook', 'formula', 'references', 'calculation', 'collaboration', 'prose', 'durable-store']
    owner_tests = ['workbook', 'structure', 'formula', 'references', 'calculation', 'collaboration', 'prose', 'recovery']
    native_paths = ['experiments/office-suite-v2/src/' + name + '.ts' for name in native_names]
    native_paths += ['experiments/office-suite-v2/test/' + name + '.test.ts' for name in owner_tests]
    native_paths += [str(p.relative_to(ROOT)) for p in sorted(VERIFY.glob('*-adverse.test.ts'))]
    group('native-correctness', sheet['sourceHead'],
          [{'path': p, 'sha256': sha((ROOT / p).read_bytes())} for p in native_paths],
          'Eight native modules, eight owner tests and five independent adverse tests match the existing 126-PASS aggregate. No new test execution.')

    account = read(external / 'account-final-runtime-receipt.json')
    for item in account['artifacts']:
        data = (external / item['path']).read_bytes()
        assert sha(data) == item['sha256'] and len(data) == item['bytes'], item['path']
    reuse = read(external / 'm0-final-evidence-reuse-map-v1.json')
    assert reuse['head'] == BASE and reuse['account']['allNamedProductionBytesIdentical']
    assert all(x['equal'] and x['originalBlob'] == x['currentBlob'] for x in reuse['account']['sourceBindings'])
    account_files = [{'path': x['path'], 'sha256': x['currentSHA256']}
                     for x in reuse['account']['sourceBindings']]
    group('account-runtime', account['source']['head'], account_files,
          'Integration named production-source scope only, not exhaustive dynamic dependency closure. '
          'Controlled WS remains at d727; 46 subsequent source changes prevent relabeling its whole UI as current.')

    smoke = read(VERIFY / 'reports/word-smoke.json')
    codecs = [item for item in smoke['source']['files'] if item['path'].endswith(('word-docx.ts', 'word-docx-import.ts'))]
    assert len(codecs) == 2
    group('docx-codecs', smoke['source']['head'], codecs,
          'Two codec bytes unchanged; historical bounded import/export/reopen, not a new full app/reader/edit run.')

    repo_evidence = {
        'core-contract': ('experiments/office-suite-v2/docs/core-contract.md', 'Native operations, conflict and Undo contract.'),
        'formula-contract': ('experiments/office-suite-v2/docs/formula-contract.md', 'Supported function/reference/date/coercion and refusal profile.'),
        'collaboration-contract': ('experiments/office-suite-v2/docs/collaboration-contract.md', 'Granular bindings, prose, admission, persistence and explicit limits.'),
        'corpus-manifest': ('corpus/manifest.json', 'Synthetic CC0 fixture inventory, not a feature-support acceptance table.'),
        'corpus-integrity': ('logs/corpus-integrity-final.txt', 'Historical three integrity/regeneration tests; not rerun.'),
        'docx-smoke': ('reports/word-smoke.json', 'Historical actual bounded codec and native/runtime observations.'),
        'docx-semantics': ('reports/docx-semantic-parts.json', 'Original/export XML feature presence and losses.'),
        'docx-bounded': ('reports/docx-bounded-checks.json', 'Bounded body/table equality only.'),
        'native-office': ('reports/native-ui-receipt.json', 'Historical Word/PowerPoint16.114 exact-file native reader observations.'),
        'excel-1900': ('reports/native-excel-sheet-1900.json', 'Historical Excel16.114 original1900 fixture read.'),
        'excel-1904': ('reports/native-excel-sheet-1904.json', 'Historical Excel16.114 original1904 fixture read.'),
        'sheet-assessment': ('reports/sheet-candidate-assessment-v2.json', 'Qualified frozen v1.1 headless model assessment.'),
        'sheet-summary': ('reports/sheet-scale-2026-10-21T20-44-45-509Z-summary.json', 'Original three fresh native model samples and raw child references.'),
        'frozen-budget': ('reports/reference-budget-v1.1.json', 'Unchanged budget frozen before measurement.'),
        'historical-criteria': ('reports/criteria.json', 'Historical baseline only; superseded for current decisions.'),
        'historical-phase-c-v8': ('reports/criteria-phase-c-v8.json', 'Historical Word100 RSS failure retained, not current qualification.')
    }
    for key, (path, description) in repo_evidence.items():
        evidence(key, ROOT / path if path.startswith('experiments/') else VERIFY / path, description)
    manifest = read(VERIFY / 'corpus/manifest.json')
    for fixture in manifest['fixtures']:
        path = VERIFY / 'corpus' / fixture['file']
        assert sha(path.read_bytes()) == fixture['sha256'] and path.stat().st_size == fixture['bytes']
        evidence('fixture-' + fixture['file'], path, 'Original synthetic fixture bytes retained, not a product retention workflow.')
    for path in sorted((VERIFY / 'reports').glob('sheet-scale-2026-10-21T20-44-45-509Z-[0-2].json')):
        evidence(path.stem, path, 'Original child process model sample; no new measurement.')
    for name in ['word-current-export.docx', 'word-native-original-ax.json', 'word-native-original.png',
                 'word-native-export-ax.json', 'word-native-export.png', 'pptx-native-original-ax.json', 'pptx-native-original.png']:
        evidence(name, VERIFY / 'reports' / name, 'Historical exact export or identified native reader evidence.')
    external_evidence = {
        'word-outcome': 'word100-outcome-final-result.json',
        'word-assessment': 'word100-normal-qualification-v1/assessment.json',
        'word-normal-raw': 'word100-normal-qualification-v1/report.json',
        'word-closure': 'word100-bindings-before-h7-v1.json',
        'word-final-preflight': 'word100-final-preflight-ledger.json',
        'account-runtime': 'account-final-runtime-receipt.json',
        'account-planner-review': 'account-planner-validation.json',
        'ws-runtime': 'ws-final-runtime-receipt.json',
        'integration-reuse-map': 'm0-final-evidence-reuse-map-v1.json',
        'native-log': 'integration-logs/28-PKG-M0-combined.txt',
        'native-command': 'integration-logs/28-PKG-M0-combined.json'
    }
    for key, path in external_evidence.items():
        evidence(key, external / path, 'Exact immutable snapshot of the named original evidence; no new execution.', True)

    native_log = (external / external_evidence['native-log']).read_text()
    native_command = read(external / external_evidence['native-command'])
    assert '# pass 126' in native_log and '# fail 0' in native_log and '# skipped 0' in native_log
    assert native_command['exit_code'] == 0
    ids = {item['id'] for item in entries}
    assert len(ids) == len(entries)
    for row in contract['criteria'] + capability['rows']:
        assert set(row['evidence']) <= ids, row
    result = {**contract, 'contractSHA256': sha((HERE / 'criteria-v1.json').read_bytes()),
              'fileCapabilitiesSHA256': sha((HERE / 'file-capabilities-v1.json').read_bytes()),
              'evidenceIndex': 'evidence-index.json', 'sourceBindings': 'source-bindings.json',
              'fileCapabilities': '../../decision-pack/file-capabilities-v1.json',
              'integrityOnly': True, 'newProductTestsOrMeasurementsExecuted': False,
              'wordProfiles': word_assessment['profiles'], 'sheetProfile': sheet['profile'],
              'sheetGates': sheet['gates'], 'sheetMemory': sheet['memory'],
              'sourceGroupCounts': {g['id']: len(g['files']) for g in groups}}
    outputs = {OUT / 'current-matrix.json': result,
               OUT / 'source-bindings.json': {'schema': 'office-v2-m0/source-bindings-v1', 'base': BASE, 'groups': groups},
               OUT / 'evidence-index.json': {'schema': 'office-v2-m0/evidence-index-v1', 'base': BASE, 'entries': entries}}
    for path, data in snapshots.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    for path, data in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': 'BUILT source/evidence reconciliation only', 'criteria': len(contract['criteria']),
                      'evidence': len(entries), 'sourceGroups': result['sourceGroupCounts'],
                      'newTestsOrRuntime': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
