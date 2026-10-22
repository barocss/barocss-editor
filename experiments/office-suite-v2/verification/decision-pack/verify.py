"""Verify this decision pack's bytes and references without executing product code."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parents[2]
PACK = HERE.parent / 'reports/m0-decision-pack-v1'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def owned_input(relative):
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('Pack input escaped the repository: ' + relative)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-originals', action='store_true',
                        help='Also hash the absolute original local receipt paths; unavailable originals fail.')
    args = parser.parse_args()
    contract = read(HERE / 'criteria-v1.json')
    caps = read(HERE / 'file-capabilities-v1.json')
    matrix = read(PACK / 'current-matrix.json')
    evidence = read(PACK / 'evidence-index.json')
    sources = read(PACK / 'source-bindings.json')
    assert matrix['contractSHA256'] == sha(HERE / 'criteria-v1.json')
    assert matrix['fileCapabilitiesSHA256'] == sha(HERE / 'file-capabilities-v1.json')
    assert matrix['criteria'] == contract['criteria']
    assert matrix['base'] == evidence['base'] == sources['base'] == caps['sourceBase']
    assert [row['id'] for row in matrix['criteria']] == list(range(1, 11))
    assert matrix['wholeM0']['status'] == 'OPEN_PENDING_PLANNER_DECISION_AND_FINAL_INTEGRATION'
    assert matrix['newProductTestsOrMeasurementsExecuted'] is False
    ids = {row['id'] for row in evidence['entries']}
    assert len(ids) == len(evidence['entries'])
    for row in matrix['criteria'] + caps['rows']:
        assert set(row['evidence']) <= ids
    source_ids = {g['id'] for g in sources['groups']}
    assert len(source_ids) == len(sources['groups'])
    for row in matrix['criteria']:
        assert set(row['sourceGroups']) <= source_ids
    evidence_count = 0
    original_count = 0
    for row in evidence['entries']:
        path = owned_input(row['path'])
        stored = path.read_bytes()
        if row.get('encoding') == 'gzip':
            assert len(stored) == row['storedBytes'] and sha(path) == row['storedSHA256'], row['id']
            data = gzip.decompress(stored)
        else:
            data = stored
        assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], row['id']
        evidence_count += 1
        if args.verify_originals and Path(row['origin']).is_absolute():
            original = Path(row['origin'])
            assert original.stat().st_size == row['bytes'] and sha(original) == row['sha256'], row['origin']
            original_count += 1
    source_count = 0
    for group in sources['groups']:
        assert group['allMatch'] and group['files']
        assert len(group['files']) == matrix['sourceGroupCounts'][group['id']]
        assert len({row['path'] for row in group['files']}) == len(group['files'])
        for row in group['files']:
            path = owned_input(row['path'])
            assert path.stat().st_size == row['bytes'] and sha(path) == row['sha256'], row['path']
            source_count += 1
    # Prevent feature/refusal and scale evidence from becoming broader acceptance.
    categories = {row['id']: row['category'] for row in caps['rows']}
    assert categories['docx-losses'] == 'LOSS_IN_EXPORTED_COPY_ORIGINAL_ARTIFACT_ONLY'
    assert categories['docx-basic'] == 'BOUNDED_IMPORT_EXPORT_REOPEN_EVIDENCE'
    assert categories['xlsx-product'] == categories['pptx-product'] == 'PRODUCT_EXCHANGE_UNAVAILABLE_NOT_VERIFIED'
    assert categories['original-retention'] == 'ARTIFACT_BYTES_ONLY'
    assert contract['nextStages']['status'] == 'INACTIVE_PROPOSED_CONTRACTS_ONLY'
    assert len(matrix['wordProfiles']) == 2 and all(p['allRSSPass'] for p in matrix['wordProfiles'])
    assert all(g['targetMet'] and g['repeatable'] for g in matrix['sheetGates'])
    print(json.dumps({'status': 'PASS metadata/source/evidence integrity only', 'criteria': 10,
                      'sourceBindings': source_count, 'evidence': evidence_count,
                      'originalReceiptsAlsoChecked': original_count,
                      'productTestsOrRuntimeExecuted': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
