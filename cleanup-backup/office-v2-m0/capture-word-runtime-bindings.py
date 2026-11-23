from pathlib import Path
import datetime, hashlib, json, subprocess, sys

root = Path('/Users/user/.codex/worktrees/522-m0-portal-joint/barocss-editor')
primary = Path('/Users/user/barocss-editor/.omx/m0')
label = sys.argv[1]
assert label in {'before-browser', 'after-browser', 'before-performance', 'after-performance'}
version = sys.argv[2] if len(sys.argv) > 2 else ''
assert not version or version == 'qualified'
output = primary / ('word-runtime-bindings-' + label + ('-' + version if version else '') + '.json')
assert not output.exists(), output
git = lambda *args: subprocess.check_output(['git', *args], cwd=root, text=True).strip()
pin = json.loads((primary / 'word-runtime-final-source-pin.json').read_text())
assert git('rev-parse', 'HEAD') == pin['head']
assert not git('diff', '--name-only', 'HEAD')
index = {}
for line in git('ls-files', '-s').splitlines():
    header, path = line.split('\t', 1)
    index[path] = header.split()[1]
paths = {path for path in index if path.startswith('apps/word/') or
         (path.startswith('packages/') and ('/src/' in path or path.count('/') == 2 and path.endswith('/package.json')))}
paths.update(['.nvmrc', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
              'experiments/office-suite-v2/package.json', 'experiments/office-suite-v2/pnpm-lock.yaml'])
verification = 'experiments/office-suite-v2/verification/'
paths.update(verification + name for name in [
    'word-performance-runner.mjs', 'word-performance-browser.mjs', 'performance-guards.ts',
    'profiles.ts', 'metrics.ts', 'font-metadata.py', 'word-performance.html',
    'reports/reference-budget-v1.1.json', 'reports/measurement-method-word-wall-v3.json',
    'reports/word-phase-c-diagnostic.json'])
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
rows = [{'path': path, 'blob': index[path], 'sha256': sha(root / path), 'bytes': (root / path).stat().st_size}
        for path in sorted(paths)]
receipt = primary / '522-m0-portal-joint-frozen-receipt.json'
graph = json.loads(receipt.read_text())
links = []
for row in graph['sourceLinks']:
    link, expected = Path(row['link']), Path(row['target']).resolve(strict=True)
    actual = link.resolve(strict=True)
    assert actual == expected, str(link)
    if row['workspaceSource']: assert actual.is_relative_to(root), str(link)
    links.append({'link': str(link), 'actualTarget': str(actual), 'workspaceSource': row['workspaceSource']})
extra = ['packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts',
         'packages/renderer-dom/src/reconcile/fiber/get-host-sibling.ts',
         'packages/renderer-dom/src/reconcile/utils/portal-handler.ts',
         'packages/office-word/src/line-offsets.ts']
by_path = {row['path']: row for row in rows}
data = {'schema': 'm0/expanded-word-runtime-binding-v1', 'stage': label,
        'capturedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'head': git('rev-parse', 'HEAD'), 'tree': git('rev-parse', 'HEAD^{tree}'), 'root': str(root),
        'trackedDiff': git('diff', '--name-only', 'HEAD'), 'statusIncludingGeneratedOutput': git('status', '--porcelain'),
        'sourceScope': 'Tracked production superset: every package src, package manifest, complete Word app, fixed H7 harness/budget/font reference. This is not a claim that every file was dynamically imported.',
        'files': rows, 'requiredOutsideCurated17': [by_path[path] for path in extra],
        'graphPreparationReceipt': {'path': str(receipt), 'sha256': sha(receipt),
                                    'originalPreparationHead': graph['head']},
        'actualCurrentAliases': {'capturedNow': True, 'workspaceSourceCount': sum(row['workspaceSource'] for row in links),
                                'links': links},
        'entrypointProof': {name: json.loads((root / 'packages' / name / 'package.json').read_text()).get('exports')
                           for name in ['renderer-dom', 'editor-view-dom', 'editor-core', 'office-word', 'dsl']},
        'wordBrowserConfiguration': [{'path': str(primary / 'final-word-browser' / name),
                                     'sha256': sha(primary / 'final-word-browser' / name)}
                                    for name in ['playwright.config.mjs', 'vite.config.mjs']],
        'limits': 'Alias and file observations at this timestamp. After-run binding is separate; this record alone is not a runtime result.'}
output.write_text(json.dumps(data, indent=2) + '\n')
print(json.dumps({'path': str(output), 'sha256': sha(output), 'files': len(rows),
                  'sourceAliases': data['actualCurrentAliases']['workspaceSourceCount']}))
