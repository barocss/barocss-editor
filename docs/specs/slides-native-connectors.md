# Slides native connector compatibility

Slides v2 stores canvas `attributes.objectId` as document-owned identity. A native connector uses `startObjectId` and `endObjectId`. The loader validates the complete graph and resolves each endpoint to a fresh local session ID before replacing the current document. Targets must be in the same slide, layout, master or component scope. A connector target also requires its corresponding line position (`startT` or `endT`). Display names and geometry do not determine identity.

Repeated saves and undo/redo retain object identity. Copy operations create new object IDs and remap bindings within the copied set. Whole-slide copies also create a new slide ID and remap internal slide jumps. External resource references retain their existing meaning.

Valid legacy v0/v1 free decks remain readable locally. The authenticated snapshot service retains its existing v1 compatibility and additionally accepts Slides v2. A legacy file with missing session-owned attachment targets is refused. It is not repaired from names, geometry or node order. Duplicate identities, missing targets, wrong scopes and unsupported versions are refused before current-model replacement. The original file and pending record remain available.

Loading a valid v1 deck creates the v2 working representation. An explicit save to an existing snapshot document can advance its native version from 1 to 2 under the same document ID, current writer authority and exact expected revision. The version and snapshot update are atomic. Downgrading from 2 to 1 is refused. Other products keep their version rules. A v1 frozen pending request keeps its original bytes, key, version and request hash during receipt lookup and retry; it is never rewritten as v2. New edits form a separate request.

Older readers must reject v2 rather than silently detach its connectors. This format change does not implement real-time collaboration or authorize publication or deployment.
