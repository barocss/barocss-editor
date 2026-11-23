from pathlib import Path
import datetime, hashlib, json, shutil, subprocess, sys

directory = Path(__file__).resolve().parent
primary = Path('/Users/user/barocss-editor')
root = Path('/Users/user/.codex/worktrees/522-m0-next-integration/barocss-editor')
verifier = Path('/Users/user/.codex/worktrees/526-m0-current-verification/barocss-editor')
pin = sys.argv[1]
assert len(pin) == 40 and all(c in '0123456789abcdef' for c in pin)
git = lambda cwd, *args: subprocess.check_output(['git', *args], cwd=cwd, text=True).strip()
assert not (directory / 'predata.json').exists()
assert git(root, 'rev-parse', 'HEAD') == '8558e3c6b73af6efc350160e6a3b8962234ed592'
assert not git(root, 'status', '--porcelain')
assert not git(root, 'diff', '7eca44213c9b9609c88b635dcfc0ee8412a7e21d', 'HEAD', '--', 'apps/word', 'packages')
probe_path = 'experiments/office-suite-v2/verification/word-print-call-probe.mjs'
probe = subprocess.check_output(['git', 'show', pin + ':' + probe_path], cwd=verifier)
assert probe == (verifier / probe_path).read_bytes()
(directory / 'probe.mjs').write_bytes(probe)
for original, name in [('word-print-call-probe.test.mjs', 'probe.test.mjs'),
                       ('word-print-call-probe.md', 'probe.md'),
                       ('logs/word-print-call-probe-final.txt', 'probe-pure-tests.txt')]:
    content = subprocess.check_output(['git', 'show', pin + ':experiments/office-suite-v2/verification/' + original], cwd=verifier)
    if (directory / name).exists(): assert (directory / name).read_bytes() == content, name
    else: (directory / name).write_bytes(content)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
old = json.loads((primary / '.omx/m0/m0-resume-current-evidence-v1.json').read_text())
paths = {row['path'] for row in old['sourceBindings'] if row['group'] == 'Word17'}
paths.update(['apps/word/index.html', 'apps/word/src/main.tsx', 'apps/word/src/style.css',
              'apps/word/src/app.tsx', 'apps/word/vite.config.ts', 'packages/office-word/src/print.ts'])
paths.update(p for p in git(root, 'ls-files', 'packages/office-word/src').splitlines() if 'sample' in p)
snapshot = directory / 'source-snapshot'
bindings = []
for path in sorted(paths):
    source = root / path
    destination = snapshot / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    bindings.append({'path': path, 'sha256': sha(source)})
for row in old['sourceBindings']:
    if row['group'] == 'Word17': assert sha(root / row['path']) == row['currentSHA256'], row['path']
predata = {
    'schema': 'm0/word-native-typed-count-predata-v1', 'frozenUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'owner': 'Execute Integration #522', 'humanReleaseMessage': '01a162ee-d5d1-71f1-9f29-a1b01b6256bc',
    'root': str(root), 'head': git(root, 'rev-parse', 'HEAD'), 'tree': git(root, 'rev-parse', 'HEAD^{tree}'),
    'productionBase': '7eca44213c9b9609c88b635dcfc0ee8412a7e21d', 'probeCandidate': pin,
    'node': '/Users/user/.nvm/versions/node/v22.22.0/bin/node', 'pnpm': '8.15.0', 'playwright': '1.58.0',
    'chromiumExecutable': '/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell',
    'port': 55261, 'sourceBindings': bindings,
    'probeBindings': [{'path': p, 'sha256': sha(directory / p)} for p in ['probe.mjs', 'probe.test.mjs', 'probe.md', 'probe-pure-tests.txt', 'run.mjs', 'vite.config.mjs', 'freeze.py']],
    'protocol': 'One actual normal ?sample. Native prototype pass-through around attached beforeprint once; afterprint once; two RAF. No direct build or retry. Root + direct surface dynamic boundary. Original source/native/selection and output/cleanup oracles. No forced GC, native sampler, heap snapshot, RSS or allocation inference.',
    'deadline': 'Single producer90s; page30s; readiness20s; stable300RAF; print cleanup2s per frame. Preserve first failure and close only owned browser/Vite in finally.',
    'qualification': 'Diagnostic calls/object identity only. Existing100RSS failure and original performance budgets remain unchanged.',
    'preservation': 'All existing served Word/Sheet sources, user tabs including extra IAB1/2, account/store/PG and develop are untouched.',
}
(directory / 'predata.json').write_text(json.dumps(predata, indent=2) + '\n')
print(json.dumps({'predata': str(directory / 'predata.json'), 'sha256': sha(directory / 'predata.json'), 'sourceFiles': len(bindings), 'probeCandidate': pin}))
