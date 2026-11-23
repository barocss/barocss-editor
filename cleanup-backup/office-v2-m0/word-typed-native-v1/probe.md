---
work_id: office-v2-m0/verification-v1
artifact_type: diagnostic_contract
status: ready_for_build
owner_role: Execute Verification
source_request: Prepare one discriminating Word print observable after human M0 hold release.
last_updated: 2026-10-22
---

# One normal-sample Typed OM observation

Integration owns the private browser, source adoption, port and finite run lease.
This module adds observations only. It does not authorize a server or browser run.
Keep the accepted source and all user Word/Sheet pages untouched. Do not repeat
the unchanged 100/300-page benchmark or request forced garbage collection.

The initial source is `7eca44213c9b9609c88b635dcfc0ee8412a7e21d`.
Word's test-only RED checkpoint is `95d6815857883d332cad2d8179e23729c4668265`:
the production print module is unchanged. Its controlled DOM/Typed OM test proves
call work and output invariants, not native allocation. Bind the actual module,
normal sample, stylesheet/font environment and probe hashes before one browser run.

The operation is exactly one controlled `beforeprint` event through the normal
app listener, followed by one `afterprint`. The listener already builds the print
pages; do not call `build()` a second time. These are controlled print events,
not proof of an OS print dialog or PDF export. Use no alternate document engine.

Pass through the actual `Element.prototype.computedStyleMap` calls without
changing `this`, arguments or returned object identity. Restore the original
descriptor in `finally`. Use weak identity tables; emit scalar IDs/counts only.
Missing native capability is unavailable, never a browser shim or zero-call PASS.
Boundary classification is the source root and its direct `.w-surface` children.
Nested calls are not automatically unused: the measured event can include other
listeners or prepare/render work. Attribute redundancy only with a bound actual
snapshot call path, or retain the narrower event-scope call-count statement.

Capture source/native/selection identity and scalar geometry before printing,
then print-page/output geometry, and cleanup after `afterprint` plus two frames.
Use output/source hashes in shared metadata, not document text. Surface/page counts
are measured values, not a hard-coded two-boundary or two-page assumption.
Cleanup observations do not dispose the runtime before observing print release.
Additional native counters, if Integration uses them, are global observations;
without forced GC they cannot identify a retained native object or RSS cause.

Pure Node tests validate the observer's pass-through, counters, classification and
restoration. They do not establish Chromium's native map allocation behavior.
Do not use `DOM.getDetachedDomNodes`, heap snapshots or leak-preparation commands
as a shortcut under the no-forced-GC contract.

Preserve the first failure. Record exact source, command, browser/runtime, result
and cleanup. A successful small diagnostic does not accept Word100 RSS or M0.

## Frozen observer check

The helper has completed its writes. Independent source review and the saved
Node 22.22.0 command `node --test verification/word-print-call-probe.test.mjs`
returned 11 PASS, 0 FAIL and 0 skipped. Raw output:
`logs/word-print-call-probe-final.txt`, SHA256
`3a7ebaeb39648fe16d19384248878bf1b8e901171e67b3dc98a5b15fb0c0eea5`.
Module SHA256: `dfd7813149d893e416dd180d81eaf524a4c66e7f38d3165ac2a58ce21df2bb25`.
Test SHA256: `449e961ef86052f826d55db14132932b1d62a520fbb209b779853cdeaf35da98`.

The helper's first expanded run was 10 PASS / 1 FAIL: the fixed-descriptor fake
reached tree counting before rejecting the capability and threw a children
iteration TypeError. Capability rejection now precedes tree counting. This
first failure is retained in helper tool history; no raw TAP was reconstructed.
The final pure tests do not qualify the still separate actual-browser run.
