from pathlib import Path
import datetime, hashlib, json, subprocess, sys

root, head, receipt_path, output_path = sys.argv[1:]
root = Path(root).resolve()
receipt_path, output_path = Path(receipt_path), Path(output_path)
assert root.parent.name == '537-word100-integration'
assert len(head) == 40 and all(c in '0123456789abcdef' for c in head)
assert not output_path.exists()
git = lambda *a: subprocess.check_output(['git', *a], cwd=root, text=True).strip()
assert git('rev-parse', 'HEAD') == head
assert not git('diff', '--name-only', 'HEAD')
index = {}
for line in git('ls-files', '-s').splitlines():
    header, path = line.split('\t', 1)
    index[path] = header.split()[1]
paths = {p for p in index if p.startswith('apps/word/') or (p.startswith('packages/') and
         ('/src/' in p or p.count('/') == 2 and p.endswith('/package.json')))}
paths.update(['lint-baseline.json', 'typecheck-budgets.json', 'scripts/lint.mjs', 'scripts/typecheck-all.mjs', 'scripts/typecheck-tests.mjs', 'scripts/checks/compiler.mjs', '.nvmrc', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
              'experiments/office-suite-v2/package.json', 'experiments/office-suite-v2/pnpm-lock.yaml'])
paths.update('experiments/office-suite-v2/verification/' + n for n in [
    'word-performance-runner.mjs', 'word-performance-browser.mjs', 'performance-guards.ts',
    'profiles.ts', 'metrics.ts', 'font-metadata.py', 'word-performance.html',
    'reports/reference-budget-v1.1.json', 'reports/measurement-method-word-wall-v3.json',
    'reports/word-phase-c-diagnostic.json'])
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
rows = [{'path': p, 'blob': index[p], 'sha256': sha(root/p), 'bytes': (root/p).stat().st_size} for p in sorted(paths)]
graph = json.loads(receipt_path.read_text())
assert graph['root'] == str(root)
links = []
for row in graph['sourceLinks']:
    link, expected = Path(row['link']), Path(row['target']).resolve(strict=True)
    actual = link.resolve(strict=True)
    assert actual == expected
    if row['workspaceSource']: assert actual.is_relative_to(root)
    links.append({'link': str(link), 'actualTarget': str(actual), 'workspaceSource': row['workspaceSource']})
required = ['packages/office-word/src/bookmark-navigation.ts', 'packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts',
            'packages/renderer-dom/src/reconcile/fiber/get-host-sibling.ts',
            'packages/renderer-dom/src/reconcile/utils/portal-handler.ts', 'packages/office-word/src/line-offsets.ts']
by_path = {row['path']: row for row in rows}
data = {'schema': 'm0/word100-memory-outcome-source-binding-v1', 'capturedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'root': str(root), 'head': head, 'tree': git('rev-parse', 'HEAD^{tree}'), 'trackedDiff': git('diff', '--name-only', 'HEAD'),
        'statusIncludingGeneratedOutput': git('status', '--porcelain'), 'files': rows,
        'requiredOutsideOriginalHarness17': [by_path[p] for p in required],
        'dependencyGraph': {'path': str(receipt_path), 'sha256': sha(receipt_path)}, 'actualAliases': links,
        'scope': 'Tracked package source and complete Word app superset plus fixed qualification inputs; not a claim all files dynamically load.'}
output_path.write_text(json.dumps(data, indent=2)+'\n')
print(json.dumps({'path': str(output_path), 'sha256': sha(output_path), 'files': len(rows), 'links': len(links)}))
