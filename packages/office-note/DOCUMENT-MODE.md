# Note document mode

The standalone local and authenticated Note workspaces opt into document mode. Embedded Note surfaces keep their existing presentation. The host supplies `writeAllowed` from the current session authority. A reader's writing preference cannot grant access. Authenticated viewers use the reading presentation.

The writing and reading buttons keep the same Note session, model, view, selection and undo history. Reading removes mutation overlays and makes the existing content layer non-editable. Note also refuses native input, paste, drop, cut and mutation shortcuts at its boundary. Copy, text selection, navigation, disclosures and links remain available. An explicit block action owns its menu and retires the text toolbar until dismissal.

A mode change waits for pending DOM input and delivers nested bodies before disabling their parent. The snapshot registration uses the same deepest-first delivery for authenticated saves. A refused composition or child delivery keeps the current mode and shows a retry message. Session, root replacement and authority changes retire queued requests. Existing frozen server requests retain their original bytes; a new request includes the delivered nested content.

Local title and current-page metadata controls follow reading mode. Server role, busy, pending request, draft protection and denied-access conditions remain host authority constraints. Returning to writing restores only the reader preference allowed by those current constraints.

Verification covers mounted NoteEditor native equality, same view, undo/redo, composition refusal, authority revocation and queued switch refusal. Desktop evidence is maintained with the issue candidate. Synthetic composition tests verify the event guard; they do not establish physical Korean IME behavior. OS IME remains unverified until an operator performs that scenario. This Note change does not establish four-product or alpha release readiness.
