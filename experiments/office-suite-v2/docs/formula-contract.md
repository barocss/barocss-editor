# M0 Formula v1 — #524

Scope: `office-v2-m0/formula-v1`, parent #521. Our parser, identity reference
solver and calculation session use the sole Core types/key codec from contracts-only
C `6ad373b4c31b7ec7aa97b75d8f6cb89b7174fc0e`. No spreadsheet SDK, JavaScript
evaluation, third-party formula evaluator, mutable formula string authority or
copied Workbook model is used. This is a headless experiment, not an Office UI,
actual Worker, full Excel implementation or whole-M0 acceptance.

## Public API and authority

- `ReferenceIndex(projection)` builds live ID↔position maps once. `resolve`,
  `position`, `keyAt`, `rangeKeys`, `sheetNamed` and `display` operate on that
  read-only native projection. Duplicate case-insensitive sheet names are ambiguous
  and refuse resolution. IDs remain case-sensitive opaque strings.
- `parseFormula(source, contextCell, index)` returns Core's `CellInput`. A leading
  `=` is required. Native formula authority is `{kind: 'formula', version: 1, ast,
  context}`. `displayFormula(ast,index)` derives text, including current addresses.
  Invalid syntax retains source/reason as `invalid`. Unsupported tokens/functions
  retain source/reason as an explicit `unsupported` AST node. No unknown formula
  becomes a cached zero. A valid reference to an absent displayed cell is `#REF!`;
  it is not a deferred forward reference to a future identity.
  Over-limit source remains an uncommittable draft: Core still enforces text limits
  on invalid records, rather than admitting oversized recovery text as native data.
- `relocateFormula` implements copy displacement. `transformCells` implements the
  Core `FormulaTransformHook`. It returns native changes, never mutates a projection,
  and is submitted as ONE Core `cells.commit` for atomic admission.
- `CalculationEngine(projection)` registers sparse native inputs/dependencies.
  `recalculate(token?)` calculates dirty cells. `read(key, token?)` returns explicit
  `fresh`, `uncalculated` or `stale`. A fresh blank is `null`, not numeric zero.
  `stats` exposes initial/changed-cell visits, formula evaluations, graph edges and
  evaluated range-cell visits. Counters are cumulative, except edge count is current.
- `update(after, diffWorkbook(before,after), expectedToken)` replaces the read-only
  projection and applies exact Core changes. The caller must supply the real complete
  Core diff, not a hand-built partial diff. The expected token must match this
  session's source. Incompatible document/generation/version or mismatched target
  revision refuses before mutation. A graph resource refusal invalidates the whole
  session; construct a new session after reducing the unsupported workload.

## Grammar, numbers and coercion

The grammar supports decimal/exponent finite numeric literals, double-quoted
strings with doubled quote escapes, TRUE/FALSE, unary +/-, binary +,-,*,/,^ and
=,<>,<,<=,>,>=, parentheses, SUM and exactly-three-argument IF. English dot/comma
syntax is the only locale. Function/boolean names and displayed sheet names are
case-insensitive. Quoted sheet names use doubled apostrophes. Unary negation binds
before `^`; equal-precedence binary operators, including `^`, associate left to
right. Thus `-2^2` is 4 and `2^3^2` is 64. Parentheses override those defaults:
`-(2^2)` is -4 and `2^(3^2)` is 512. These rules follow
[Microsoft's operator precedence table and equal-precedence evaluation rule](https://support.microsoft.com/en-us/excel/calculation-operators-and-precedence-in-excel).
Unary plus uses the same prefix precedence in this bounded profile. Display adds parentheses
to preserve the AST, rather than reproducing source whitespace.

Numbers are finite JavaScript IEEE-754 binary64. No decimal precision or Excel
rounding equivalence is claimed. Arithmetic converts blank to 0 and boolean to
0/1. Strings, including numeric-looking strings and empty string, produce `#VALUE!`
in numeric arithmetic. Divide by zero gives `#DIV/0!`; overflow/non-finite results
give `#VALUE!` because Core v1 has no `#NUM!` code. Errors propagate. Invalid native
inputs evaluate to `#VALUE!`. Unknown/unsupported formulas give `#UNSUPPORTED!`.

SUM accepts zero or more arguments. Range and scalar-reference arguments ignore
blank, text and boolean cells; numeric cells sum and error cells propagate. Direct
boolean arguments convert to 0/1; direct blank converts to 0; direct string arguments
give `#VALUE!`. A range outside SUM is `#VALUE!`. Comparisons compare two strings
by case-sensitive code-unit order, or numeric/blank/boolean values numerically.
Mixed string/numeric comparisons give `#VALUE!`; this is a bounded documented
profile, not Excel coercion parity.

IF evaluates its condition and only the selected branch. Numeric/boolean/blank
conditions use numeric coercion; strings/errors refuse/propagate. Unselected
errors and reference cycles do not determine the result. Static dependencies
include both branches for safe dirty invalidation; actual evaluation decides
cycles. Self/mutual cycles and dependents that evaluate those cycles get `#CYCLE!`.

Arrays/spills, names, whole-column/row ranges, intersection/union, percent,
concatenation, structured references, external workbooks, volatile/asynchronous
functions and functions other than SUM/IF are unsupported. No external code or
service is called. An unknown token refuses the entire source visibly.

## References, structure, copy and cut

Each scalar reference stores sheet/row/column identity, absRow/absColumn and
sheetQualified. Structural insertion changes the displayed address, including
absolute addresses, without changing the target identity. Tombstones give `#REF!`.
Only Core's successful conditional deletion undo can restore the same identity;
a new identity at the old address never revives a deleted reference. Formula AST
retains the old identity while its display/error cache is derived.

Ranges are forward same-sheet rectangles of live endpoints (`live-interval`).
Interior insertions join; insertion before the start or after the end stays outside.
Interior deletion removes membership. A deleted endpoint gives `#REF!` until valid
same-ID restoration. Reversed and cross-sheet endpoints give `#REF!`.

Copy/fill shifts relative axes by the source→destination position displacement.
Absolute axes retain their source target positions. Unqualified references use
the destination sheet; explicit sheet qualifiers retain their target sheet.
Out-of-bounds/deleted copy targets become explicit `#REF!`. Fill may reuse one
source for multiple destinations. Destinations must be unique and live.

Cut follows moved content even for absolute references and rewrites affected
external formulas. Moved formulas retain references to unmoved targets, adding
sheet qualifiers when needed. Sources and destinations are individually unique.
All reads use the pre-mutation projection; sources clear first and destination
writes win on overlap. Thus cutting A1:A2 down one row reads original A1/A2,
not already-overwritten A2. Blank source input is an explicit literal null.

A fully mapped rectangular range with a uniform displacement moves as a range.
A partial/non-rectangular cut through a referenced range refuses with TypeError
before any Core commit. A range above the materialization bound refuses with
RangeError during cut. Those cases require a future range-union representation;
they never silently change a SUM's membership. Cross-document cut/copy, styles,
merges, general row/column move and collaboration of simultaneous cut operations
are outside this solver. Cut scans sparse formulas once per atomic operation;
ordinary cell recalculation does not scan the workbook.

## Dates, bounds and calculation scheduling

`dateToSerial(y,m,d,system)` and `serialToDate(serial,system)` use explicit `1900`
or `1904` systems, civil days and UTC arithmetic. There is no Date parsing, local
timezone inference, DATE/NOW function or automatic date/string coercion. Native
cells remain numeric; date presentation metadata is not implemented here.

1900 starts at serial 1 = 1900-01-01; 59 = 1900-02-28; 61 = 1900-03-01.
Fictitious serial 60 returns `#UNSUPPORTED!`. Invalid 1900-02-29 is `#VALUE!`.
1904 starts at serial 0 = 1904-01-01. Maximum year is 9999. Negative dates,
fractional days, invalid civil dates and out-of-range/nonfinite values give
`#VALUE!`; unsupported systems give `#UNSUPPORTED!`. This excludes fractional
time-of-day and pre-epoch dates deliberately.

Core limits apply (text 32768, AST depth 64/nodes 10000, atomic batch 10000).
One range materializes at most 100000 live cells; a larger range is `#LIMIT!`.
The dependency graph admits at most 1000000 edges, then explicitly refuses the
session with RangeError. One recalculation admits at most 5000000 cell requests;
on refusal unfinished cells remain `uncalculated`. These are resource guards,
not measured performance budgets or capacity claims.

Initial registration visits populated records once. Reverse dependency sets
propagate dirty closure through both old and new edges. Changed cell inputs detach
old edges. Exact structure diffs rebuild the address index and rebind formulas
that use affected sheets, including ranges and deleted/restored references.
There is no unconditional whole-workbook scan for each changed/evaluated cell.
Formula scheduling uses an explicit stack of generator frames, so long cell chains
do not consume the JavaScript call stack. Individual AST depth stays Core-bounded.

Tokens bind all native context versions/identity, exact Core revision and calculation
version 1. `accepts(token)` checks a detached worker response's version; it never
installs a response as native input. An old token cannot read fresh data or run an
update/recalculation. Pure modules and serializable native inputs permit future
worker hosting. This delivery does not create a Worker or prove asynchronous UI
latency. The exact canonical Core revision is potentially large; its memory cost
belongs in Verification's 10000-row/100-column/50000-cell/10000-formula profile.

## Verification boundary

Tests use actual Core event creation/projection/diff APIs, not a copied or fake
engine. Parser/coercion/date, identity/range/copy/cut, dependency invalidation,
stale-cache and long-chain checks are owned here. Core's actual candidate is a
separate immutable dependency. Verification owns the full named scale profile,
raw timing samples and independent concurrency/corpus evidence. Product Save/Open,
two-account authorization, durable ACK/restart, actual Worker/UI, XLSX/Microsoft
Office parity and whole M0 remain separate gates.

## Original F candidate evidence (preserved history)

Candidate parent is qualified joined runtime J
`a332facd6740c491f761be39dbeee2c6a6a24f70` (tree
`863a995de49b4a316a0dfed3cbd2cc704c81d12c`). Actual Core runtime R is
`1458fa7d4c7396bbd8b9edb36f07ee4e1864f326`. R's contracts/runtime imports are
byte-identical in J; the J successor only adds the disjoint Collaboration partial
source. No Core/Collaboration/shared scaffold file is part of Formula's delta.

Environment: Node 22.22.0, pnpm 8.15.0, strict TypeScript 5.9.3, frozen S graph.
Native local machine `local-native-M0`: Mac15,11, arm64, macOS 15.6.1,
38,654,705,664 bytes memory, 14 logical CPUs. Ambient system load is uncontrolled.

Run from the experiment directory with Node 22.22.0's bin prepended to PATH:

```sh
pnpm --ignore-workspace type-check -- src/formula.ts src/references.ts src/calculation.ts test/formula.test.ts test/references.test.ts test/calculation.test.ts
pnpm --ignore-workspace test -- test/formula.test.ts
pnpm --ignore-workspace test -- test/references.test.ts
pnpm --ignore-workspace test -- test/calculation.test.ts
```

The final six-root strict check passed with 0 diagnostics. Formula tests passed
4/4 at R; unchanged tested source/imports are reused at J. Reference tests passed
9/9 at J, calculation tests passed 5/5 at J: 18/18 native tests, 0 skipped,
0 failed. The files ran sequentially, one owned file per runner invocation.
No whole-repository check/preflight/build or unrelated product/DB/browser check ran.

First execution failure is preserved separately: attempting
`NODE_OPTIONS=--test-concurrency=1 pnpm --ignore-workspace test -- test/formula.test.ts test/references.test.ts test/calculation.test.ts`
exited 9 before any test ran: `node: --test-concurrency= is not allowed in NODE_OPTIONS`.
The correction was command-only: use the unchanged runner with one file at a
time. It was not a source/test failure and did not justify a runner/config edit.
No targeted Formula source/type/native test failure occurred. Source review found
Core's sequential interior insertion defect; its owner fixed it in R and the
real-Core range/reference regressions pass here.

One diagnostic sample from the final controlled 50-row × 40-column chain test:
2000 populated cells, 1999 formulas, initial registration 2.720958 ms,
initial recalculation 3.499708 ms, and dirty Core diff + engine update +
recalculation 38.487875 ms. The edit replaces the first formula with a literal;
0 unrelated formulas are evaluated, initialCellVisits=2000 and
changedCellVisits=1. This is ONE raw native sample, includes Core diff in the dirty
measurement, and is not a percentile, browser measurement or performance budget.
The full required 10000-row/100-column/50000-cell/10000-formula profile is NOT RUN
by this lane and remains Verification-owned.

Tested source SHA-256 bindings (documentation changes do not alter these):

| File | SHA-256 |
| --- | --- |
| src/formula.ts | defd5227086f24a1b0685d96d8e390c88ce84636e2ea1da88e593f4aa0640295 |
| src/references.ts | 64d0bc4cd7f51b54d1159dd6a9648e621fcd638d75b5bccbf85765ce43a5b393 |
| src/calculation.ts | 87475ff54551e8ae6df7682b0d64ced3671310b8a1b99e2a93fd18f273a12044 |
| test/formula.test.ts | d93266f14aa9e5fb3b09917199df9aa55024b1346b3ebf371574ec4199fc531a |
| test/references.test.ts | 5198feff439cb7b4c39fec6053042a1e3bd052e15b3f5f25d73e72f009c40bb1 |
| test/calculation.test.ts | b0bab36ca5c0ca74215bec2542f967c3652f5772df408d6155f02e80c434ef48 |

## Arithmetic correctness successor on K

Parent: checked K `23fa95116b11882be4905ae257c0859911a2b88a`, tree
`566be01a163f81168f198345adfddb4ff5aa5b5d`. Original F remains preserved.
Planner found that F's arithmetic precedence expectation was wrong: F placed
negation below exponentiation and made exponentiation right-associative.
[Microsoft's primary operator table](https://support.microsoft.com/en-us/excel/calculation-operators-and-precedence-in-excel)
places negation before exponentiation and evaluates equal-precedence operators
left to right. This successor corrects supported arithmetic; it does not extend
the supported operator/function profile.

First focused correctness failure, before parser edits, is preserved here:

```text
node --experimental-strip-types --test --test-concurrency=1 --test-name-pattern='Excel unary|Excel equal-precedence|explicit parentheses' test/formula.test.ts
exit 1; 3 tests; 0 passed; 3 failed; 0 skipped
Excel unary negation binds before exponentiation: =-2^2 actual -4, expected 4
Excel equal-precedence exponents associate left to right: =2^3^2 actual 512, expected 64
explicit parentheses override unary and exponent defaults and preserve AST display round trips: =-(2^3)^2 actual -64, expected 64
```

The parser change is two expressions: unary operands bind above power; the right
operand of every binary operator uses the next precedence level. The identical
focused command then passed 3/3. Additional cases cover negative exponents,
consecutive unary signs, SUM, relative-reference copy and canonical display
round trips. Explicit `=-(2^2)` remains -4; `=2^(3^2)` remains 512.
Existing native ASTs keep their meaning; there is no automatic reparse or rewrite
of historical source, cache, Core contracts or document state. New input derives
the corrected AST; Core's changed revision already invalidates its derived cache.

Final changed/directly affected checks, Node 22.22.0/pnpm 8.15.0/TS 5.9.3:

```sh
pnpm --ignore-workspace type-check -- src/formula.ts test/formula.test.ts test/references.test.ts test/calculation.test.ts
pnpm --ignore-workspace test -- test/formula.test.ts
pnpm --ignore-workspace test -- test/references.test.ts
node --experimental-strip-types --test --test-concurrency=1 --test-name-pattern='SUM distinguishes|dirty closure|actual evaluation|structure changes' test/calculation.test.ts
```

Results: strict 4 roots plus actual imports PASS, 0 diagnostics; formula 7/7,
references 10/10, selected calculation 4/4 PASS. These are 21 selected native
tests with 0 failures and 0 skipped. The 2000-cell timing test, independent full
profile and broad/root checks were not rerun for this parser correction.
The delta is only formula.ts, formula.test.ts, references.test.ts and this manual.
Calculation/reference engine source, shared C, Core and frozen dependencies stay
unchanged. Whole M0, actual Excel interoperability and product/release acceptance
remain separate from this targeted arithmetic result.

Corrected tested SHA-256 bindings replace the historical F bindings only for:

| File | SHA-256 |
| --- | --- |
| src/formula.ts | f0d9565a93ee1c90caebf08f6a0ae4f118852590ec6c8b4cd5fcc7c07fc27c64 |
| test/formula.test.ts | 5bf48339f56f6db597ff31b623ba930bb9f6ed07702ad4ee404af52972c6011b |
| test/references.test.ts | cbcab4ed20f5531a21cc376ffef3c378de5ef4630119a89cba7a9aca87bf5fb1 |
