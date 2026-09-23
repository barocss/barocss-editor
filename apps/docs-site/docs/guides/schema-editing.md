---
title: Schema-aware fragment editing
---

# Schema-aware fragment editing

Use `FragmentEditor` from `@barocss/model` to capture a document fragment, compute a read-only editing plan, and apply that plan through a transaction. This guide describes the source implementation at `94a94968` and issue [#308](https://github.com/barocss/barocss-editor/issues/308). It does not claim that an older npm archive contains every source change.

## Current support

| Path | Reviewed implementation |
| --- | --- |
| Capture | Sibling nodes (contiguous by default) and supported text selections, including cut ancestor boundaries |
| Plan/apply | Copy into a child gap or replace supported text/child ranges; local whole-node and single-run text moves with supported targets |
| Clipboard | Schema-backed DOM/React body copy, cut, and paste use the fragment transport and policy path |
| DND | The shared DOM/React view resolves text or child-gap targets and uses the fragment planner; product handle UI remains product-owned |
| Enter, Backspace, structural transforms, AI edits | Follow-up work in #271–#273; not a promise of this planner |
| Tables, canvas, uploads | Keep their dedicated paths; not covered by this prose planner |

`move` requires a live local `source` that matches the captured fragment. Whole-node moves need a child gap. Text moves need a single source run and a text target with a lossless inline join. Multi-run text moves and cross-document atomic moves are not supported. Empty fragments and fragments with nonempty `resources` are rejected by the copy consumer. See the [drag-and-drop guide](../concepts/drag-and-drop.md) for shared view behavior and other limits.

## Capture, plan, inspect, apply

1. Reuse the editor's policy owner with `FragmentEditor.forEditor(editor)`.
2. Capture supported source content or construct a supported import.
3. Call `plan` with a destination in the same editor.
4. Check `decision.ok`. If accepted, inspect `outcome`, `losses`, and `trace`.
5. Apply only a current plan, then inspect the transaction result.

Planning does not write the document or allocate target IDs. Application checks the document, schema, policy generation, and selection under the transaction lock. A plan can become stale while a confirmation UI is open. Capture/replan from current input rather than replaying an old plan.

## Complete example

Install `@barocss/editor-core`, `@barocss/schema`, and `@barocss/model`. This example creates its own editor without a view. It uses custom body/text names, explicitly configures a joining rule, rejects a stale plan, then copies and moves text with Undo after each edit.

```ts
import { Editor } from '@barocss/editor-core';
import { createSchema } from '@barocss/schema';
import { FragmentEditor, defineEditingPolicy, defineEditingRule } from '@barocss/model';

type TextTree = { text?: string; content?: TextTree[] };
const words = (node: TextTree): string => node.text ?? (node.content ?? []).map(words).join('');

export async function demonstrateFragmentEditing() {
  const schema = createSchema('article-flow', {
    topNode: 'document',
    nodes: {
      document: { name: 'document', content: 'body*' },
      body: { name: 'body', group: 'block', content: 'inline*' },
      glyph: { name: 'glyph', group: 'inline' },
    },
  });
  const editor = new Editor({ schema });
  try {
    editor.loadDocument({ stype: 'document', content: [
      { sid: 'source', stype: 'body', content: [{ sid: 's', stype: 'glyph', text: 'source' }] },
      { sid: 'target', stype: 'body', content: [{ sid: 't', stype: 'glyph', text: 'target' }] },
    ]});
    editor.updateSelection({
      type: 'range', collapsed: true,
      startNodeId: 't', endNodeId: 't', startOffset: 2, endOffset: 2,
    });
    const policy = defineEditingPolicy({ rules: [defineEditingRule({
      id: 'article.join-open-body',
      match: { sourceType: 'body', targetType: 'body', boundary: 'open', attributes: 'equal' },
      effect: 'join-inline',
      reason: 'Join partial text from compatible body blocks.',
    })] });
    const editing = FragmentEditor.forEditor(editor);
    editing.configure(policy);
    const fragment = editing.captureText('s', 0, 6);
    const target = { kind: 'text' as const, nodeId: 't', from: 2, to: 2 };
    const previous = editing.plan({ intent: 'copy', fragment, target });
    if (!previous.ok) throw new Error(previous.reason);

    // Reconfiguration invalidates existing plans, even for equivalent policies.
    editing.configure(policy);
    const stale = await editing.apply(previous.plan);
    if (stale.success) throw new Error('Expected the previous plan to be rejected.');

    const decision = editing.plan({ intent: 'copy', fragment, target });
    if (!decision.ok) throw new Error(decision.reason);
    if (decision.plan.losses.length) throw new Error('This example requires a lossless copy.');
    const applied = await editing.apply(decision.plan);
    if (!applied.success) throw new Error(applied.errors.join('; '));
    const after = words(editor.exportDocument().content[1]);
    const undone = await editor.undo();
    const restored = words(editor.exportDocument().content[1]);

    const move = editing.plan({
      intent: 'move', fragment, target,
      source: { kind: 'text', nodeId: 's', from: 0, to: 6 },
    });
    if (!move.ok) throw new Error(move.reason);
    const moved = await editing.apply(move.plan);
    if (!moved.success) throw new Error(moved.errors.join('; '));
    const sourceAfterMove = words(editor.exportDocument().content[0]);
    const targetAfterMove = words(editor.exportDocument().content[1]);
    const moveUndone = await editor.undo();
    return {
      staleRejected: !stale.success, after, undone, restored,
      moveApplied: moved.committed, sourceAfterMove, targetAfterMove,
      moveUndone, sourceRestored: words(editor.exportDocument().content[0]),
    };
  } finally {
    editor.destroy();
  }
}
```

Expected result: `staleRejected`, `undone`, `moveApplied`, and `moveUndone` are true. `after` and `targetAfterMove` are `tasourcerget`; `restored` is `target`; `sourceAfterMove` is empty; `sourceRestored` is `source`. Copy leaves the source intact. Move removes the selected source text and Undo restores it. The explicit node IDs are local fixture identities, not a suggested cross-document identifier scheme.

This example rejects losses instead of prompting. A product can show the loss report and ask the user to choose an allowed conversion. If the document or selection changes during that interaction, create a new plan and recheck the report.

The current `Editor` constructor creates a `document` root before `loadDocument` runs. This example therefore defines that root and permits its initial empty content. Custom schema type names alone do not change this host initialization behavior.

## Policy ownership and rule selection

`forEditor(editor, initialPolicy)` uses the initial policy only if no owner exists. Use `configure(policy)` to replace an existing owner's full policy. Creating a new `FragmentEditor` also changes the owner; do not create one on every paste and discard product configuration.

`defineEditingPolicy` and `defineEditingRule` validate and freeze configuration; they do not register global state. Rules match exact type names or `*`, an open/closed boundary, attribute equality or any attributes, and an optional target kind.

The highest numeric priority wins (default 0). Equal-priority rules with different effects reject the edit. Equal-priority rules with the same effect are reported in ID order. Neither type specificity nor registration order silently breaks a tie. `join-inline` applies only to open boundaries. A rule cannot disable schema validation.

Other policy fields include `defaultBlock`, `rangeReplacement`, declared `references`, and explicit source `adapters`. Set `schemaId` and `schemaRevision` together when you need a portable compatibility contract. Matching IDs do not replace target validation or guarantee semantic compatibility.

## Open fragments are not broken documents

A whole selected node is closed. A text selection can start or finish inside containers; its fragment records `openStart` and `openEnd` plus ancestor structure. These depths count containers, not characters. A cut article body can omit a required caption in a fragment while the stored article must still keep it.

`validateEditingFragment` checks the fragment's structure and marks. Planning additionally checks destination structure, boundary rules, and references. Use the [schema package example](/packages/schema#validate-a-custom-structure) to compare complete and open checks.

## Stale plans, results, and history

A plan belongs to its originating editor/policy owner. Do not persist it as a portable command or send it to another editor. The current implementation compares revision/identity and snapshots, including selection and schema/policy state. Snapshot work grows with document size.

`checkpoint()` and `isCurrent()` can guard asynchronous input preparation. They do not replace apply-time validation. After apply, distinguish an uncommitted failure from a committed result with `postCommitErrors`. Do not repeat a committed edit just because a notification or host callback failed. See the [transaction recovery contract](https://github.com/barocss/barocss-editor/blob/main/docs/specs/transaction-recovery.md).

Undo/Redo uses recorded operations and identities. It does not rerun the current policy as a new paste. Changing the policy does not migrate an existing document or its history.

## Keep unsupported paths explicit

The legacy `paste(INode[], range)` operation is separate from the schema-backed clipboard command. Do not assume every direct operation uses the planner. Clipboard parsing and format fallback are specified in the [clipboard contract](https://github.com/barocss/barocss-editor/blob/main/packages/extensions/docs/copy-paste-cut-spec.md).

Adapters are trusted local conversion code. Report known structure, attribute, mark, or reference losses. The planner validates converted content; it does not infer unknown source semantics, sanitize every external format, or supply a backend permission system. A successful local plan is not server authorization.

Custom schema definitions still need compatible renderers and UI. The [Office integration guide](office-products.md) describes that assembly. Product support beyond these reviewed paths requires its own execution evidence.
