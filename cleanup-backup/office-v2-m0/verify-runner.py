import json,pathlib,subprocess,sys
root=pathlib.Path.cwd()
fixture=root/'.cache/runner-probes'
fixture.mkdir(parents=True,exist_ok=True)
(fixture/'dependency.ts').write_text('export const value: string = 1;\n')
(fixture/'importer.ts').write_text('import { value } from "./dependency.ts";\nconsole.log(value);\n')
(fixture/'failing.test.ts').write_text('import { test } from "node:test";\nimport assert from "node:assert/strict";\ntest("intentional harness failure", () => { assert.fail("runner exit propagation"); });\n')
cases=[
    ('selected dependent type error',['pnpm','--ignore-workspace','type-check','--','.cache/runner-probes/importer.ts'],'TS2322'),
    ('selected failing native test',['pnpm','--ignore-workspace','test','--','.cache/runner-probes/failing.test.ts'],'runner exit propagation'),
    ('selector with no matching tests',['pnpm','--ignore-workspace','test','--','scripts/paths.mjs'],'No matching files for'),
    ('missing selector',['pnpm','--ignore-workspace','type-check','--','src/missing.ts'],'Input does not exist'),
]
failures=0
for label,argv,expected in cases:
    child=subprocess.run(argv,cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    passed=child.returncode!=0 and expected in child.stdout
    print(json.dumps({'case':label,'argv':argv,'exit_code':child.returncode,'expected_nonzero':True,'expected_diagnostic':expected,'guard_pass':passed}))
    print(child.stdout)
    failures+=not passed
raise SystemExit(1 if failures else 0)
