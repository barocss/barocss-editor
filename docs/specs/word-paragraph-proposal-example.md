# Word paragraph proposal example — #420

## Scope and preparation

This is an internally authored fictional fixed-response example. It makes no AI or external network call. It does not establish completion of #273, #413, collaboration, or alpha release readiness.

Use Node 22.22.0 and pnpm 8.15.0. Start the Word app with its existing Vite command and open `/?sample=paragraph-proposal`. This entry uses the full native Word runtime with three paragraphs, bold and italic neighboring runs, and a native table. It does not mount the local document library or autosave, including when an existing `#word=` hash is present. Normal Word and server entries retain their existing behavior.

Select the complete paragraph “승인 버튼의 글자는 읽기 쉬워야 한다.” and press “선택 문단 제안 보기”. Inspect the original, surrounding paragraphs, DEC-01@v1 source, interpretation, fixed proposal, assumption, and reason. Press “제안 거절”. The native document and selection remain unchanged. The apply button is unavailable.

## Source and proposal boundaries

REQ-01@v1, DEC-01@v1, author, date, and record status are fictional. Source approval is explicitly unconfirmed and separate from proposal acceptance. DEC-01@v1 specifies white text on a black background for an ordinary-size active approval button and says that no actual test result exists. It does not specify 4.5:1. The proposal introduces 4.5:1 as a new criterion and assumption requiring human judgment. It is not presented as a source quotation, approved rule, standard, or completed test.

The example accepts only the complete original plain text paragraph. It refuses collapsed or cleared selection, cross-paragraph selection, neighboring text, foreign or embedded input ownership, and read-only access. Its editor-bound controller records local generation, selection, root and session identity. Selection A→B→A, content edits and undo, document/session A→B→A, queued preview invalidation, or disposal retire an existing proposal. The pure office-ui view imports no editor and executes no command.

## Deliberate preview-only limitation

The original fixture omits `marks` on its target inline-text run. The current Word `replaceText` inverse restores the text but adds `marks: []`. Exact native restoration of this representation is therefore unproven. The diagnostic regression preserves the omitted field and demonstrates this difference; it does not normalize the fixture to make an apply test pass. This is a bounded representation limitation, not a claim that all Word transactions fail.

The approved conditional preview-only route is used. Every controller apply attempt returns false without running a mutation. Stale, queued, foreign, embedded, read-only, or disposed controls cannot apply a change. No accepted mutation, transaction undo/redo, AI response, or production source integration is claimed. A future apply implementation needs exact native restoration and the complete ownership/lifetime checks first.

## Verification and handoff

`apps/word/test/paragraph-proposal.test.ts` checks native snapshot and selection equality for preview/rejection, permanent stale retirement, refusal, queued actions, disposal and actual-command diagnostics. `apps/word/tests/paragraph-proposal.spec.ts` checks the real desktop Word runtime, keyboard selection and editing, review actions, foreign/embedded focus, read-only controls, session replacement, and contextual screenshots. Run targeted tests and unchanged `pnpm preflight` on the exact candidate before integration.

QA: use the URL and selection steps above; verify the original and native neighboring structure remain intact after preview/rejection, and old proposals remain stale after target changes. Operator: no server, environment, storage migration, or deployment change. Technical Writer: document this entry as a fictional preview-only example, with the new criterion separate from source evidence. These notes are handoff material; recipient acceptance is not asserted. Product release readiness remains unconfirmed and belongs to Planner.
