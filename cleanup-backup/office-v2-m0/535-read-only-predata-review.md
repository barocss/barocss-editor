# Execute Verification read-only predata review

Source chat: 01a15eca-e1d3-7910-9aa1-d590162dbf18
Captured before runtime. No Verification source/runtime authority inferred.

#535 READ-ONLY predata verification draft — no files/tests/browser/server started; direct human implementation hold in this chat remains.

B cases (all NOT RUN):
B1 Two private pages, independent replica/session IDs, same room/context/generation/bootstrap updateId+SHA. No join/reload reseed; unknown room with no surviving peer visibly waits.
B2 Real UI: A changes Rates!B2 12→10; B visibly shows Budget!D4=38 and D5=Within budget. B edits a separate visible blank cell to B-note; A sees it. A Undo restores 12/44/Review while preserving B-note. Compare actual source/AST/revision/alternatives, not only displayed result.
B3 Pause real binary delivery in each peer; A commits literal and B commits cross-sheet formula to the same stable native cell; resume once. Both native records/results/alternatives converge; do not prescribe a winner outside the native rule.
B4 Remote edit during A draft/composition: same editor DOM node/focus/caret/native target; composing Enter does not commit; ordinary remote updates do not redirect draft. Synthetic composition only.
B5 Reload private A with surviving B: accepted state restored from same bootstrap/context; own Undo history fresh; no duplicate bootstrap. Last-peer loss remains honest session-only unrecoverable/waiting.
B6 Actual missing-base/invalid receive only through agreed delivery seam; recovery cannot silently reset/reseed or drop valid pending/refused native records. Unit-only fault tests labelled separately.

C cases (all NOT RUN, after B):
C1 Both pages edit+save through real relay; close private pages; old owned relay exits; NEW PID uses SAME directory/context/DB+registry; fresh UI pages show formulas/values/eventIDs/alternatives; re-edit/save/reopen again.
C2 Drop ACK strictly AFTER committed update; retry exact updateId/bytes/admission/identity. Same receipt, no duplicate event. Delayed old ACK cannot mark newer input saved.
C3 Reload with browser-persisted pending/ACK-unknown outbox: exact packet hashes/identity survive. Resume original controlled identity; revoked retry refuses while preserving packet. Local-outbox persisted != server durable.
C4 Checkpoint+tail; missing/corrupt manifest/DB/metadata; wrong context/admission, malformed/altered duplicates, incomplete native dependency, encoded-body/full-state1000000B cap. Fail closed; preserve original owned files/native state/packets; record detection gaps honestly.
C5 Browser graph excludes Node/store/PendingUpdates; no extra workbook/calculator; controlled sessions are not production OIDC/accounts proof.

Required read-only observation contract from UI owner (names pending protocol agreement): room/context/generation/bootstrapId+hash, local actor/session IDs, accepted native revision/eventIDs, canonical cell source+AST+alternatives and calculation freshness, selectedCellKey/draft/editor identity, delivery state, pending/updateId/packet hash+length/admission, per-update sync/durable receipt state. Existing inspect remains supplementary to pointer/keyboard, visible values/Canvas and status. Never expose credentials, packet bodies, DB contents or private document text in published metadata.
Relay/Integration contract: controlled test-only delivery pause and commit-before-ACK loss; exact append receipt identity; durable directory/context/DB/registry identity; checkpoint/tail watermark; actual process start/exit/newPID proof. No Verification source patches/fake ACK/snapshot oracle. Fault control capability/limits and convergence deadlines must be frozen before any run; unavailable seam -> NOT RUN, not a pass.

Evidence: immutable joined source+protocol+fixture hashes and transport mode, per-case actual UI flow/expected/observed result, firstfailure, raw metadata hash, original/native equality evidence, owned PID/port cleanup; preserve userWord55262/userSheet55263/IAB. B and C private fixed runtime only under #522 exclusive lease. No current new runtime permission. Await human hold resolution and contracts-only immutable protocol from #534 before any implementation in this lane.

---

#535 read-only concrete review concerns, no write/runtime:
1. #533 provided nativeRevision/sessionId/selected alternatives. Please define whether nativeRevision is a content-stable revision or a local counter. Do not use local counter equality as convergence proof. Need read-only canonical native input/AST/structure/event-ID comparison (or source-bound equivalent), actual bootstrap bytes/updateId hash/context, plus visible UI values/fresh calculation.
2. #pause-link must suspend BOTH delivery directions to create genuine concurrent branches. Record queued packet IDs/hashes and no receive advancement while paused; a UI label alone is insufficient. #retry-link missing-base recovery must retain the original room/bootstrap and cannot silently create state.
3. Room query is join-only, including invalid/unknown/reload. After last private peer closes, B must remain waiting/unrecoverable until an explicit new-room action. Do not let tests accidentally click Create and accept a new seed as recovery.
4. Draft/composition test needs same DOM input object + focus/caret + bound CellKey/generation before/after a real remote update. Synthetic composition is not OS IME. Visible error/status preservation is part of the assertion.
5. C ACK-loss seam must establish server COMMIT BEFORE deliberately withholding response; generic route.abort alone cannot prove commit. Retry exact updateId/bytes/admission under original credential, compare receipt/event multiplicity, then lateACK versus newer pending.
6. C restart proof must show old owned relay PID exited and NEW PID with SAME manifest/context/DB/registry; mere page reload/in-process reopen is insufficient. Use fresh private pages after restart and re-edit/save/reopen.
7. Registry/outbox credentials and packet bodies stay in newly owned private runtime storage, never metadata receipt/GitHub. Published evidence records IDs/hashes/length/state/source/process identity. Missing/corrupt resume must preserve original files and queued packets, not create an empty DB.
8. Keep 1,000,000-byte decoded native full-state admission plus explicit encoded HTTP body bound; 8MB native store limit is not browser acceptance. Need refusal evidence for full export exceeding browser cap before commit. Unsupported fault seams stay NOT RUN, never covered by unit-only PASS.
Full B/C draft already sent. Direct human hold remains for this Verification lane; no535files/tests/server/browser touched. #522 may run its separately human-authorized checks and supply immutable receipts for later read-only review.

