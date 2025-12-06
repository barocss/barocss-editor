# Documentation Cleanup Plan

This document outlines the plan to organize documentation across all packages, keeping only implementation-aligned documents and archiving planning/spec documents.

## Classification Criteria

### Keep (Implementation-Aligned)
- Documents referenced in README files
- Recently created implementation guides
- API reference documents for implemented features
- Architecture documents that match current implementation

### Archive (Planning/Spec)
- Initial planning documents
- Spec documents for unimplemented features
- Analysis/decision documents that are no longer relevant
- Duplicate or outdated documents

## Package-by-Package Analysis

### packages/datastore/docs

#### Keep (Referenced in README)
- ✅ `transaction-integration.md` - Referenced in README
- ✅ `document-iterator-spec.md` - Referenced in README
- ✅ `model-traversal-api.md` - Referenced in README

#### Keep (Implementation-Aligned)
- ✅ `ownership-and-collaboration.md` - If it documents implemented collaboration features

#### Archive (Planning/Spec - Need Verification)
- ⚠️ `drop-behavior-architecture.md` - Planning document (but drop behavior is implemented)
- ⚠️ `drop-behavior-implementation-plan.md` - Planning document
- ⚠️ `drop-behavior-implementation-options.md` - Analysis document
- ⚠️ `drop-behavior-spec.md` - Spec document (but feature is implemented - may need update)
- ⚠️ `draggable-node-spec.md` - Spec document (need to verify implementation)
- ⚠️ `droppable-node-spec.md` - Spec document (need to verify implementation)
- ⚠️ `editable-node-spec.md` - Spec document (need to verify implementation)
- ⚠️ `selectable-node-spec.md` - Spec document (need to verify implementation)
- ⚠️ `editable-node-api-proposal.md` - Proposal document
- ⚠️ `block-text-editing-strategies.md` - Analysis document
- ⚠️ `replaceText-considerations.md` - Analysis document
- ⚠️ `replaceText-mark-transformation.md` - Analysis document

**Action**: Verify if drop-behavior, draggable/droppable/editable/selectable features are implemented. If implemented, update spec documents to match implementation or archive planning docs.

### packages/extensions/docs

#### Keep (Referenced in README)
- ✅ `extension-design-and-implementation.md` - Referenced in README
- ✅ `command-architecture-guide.md` - Referenced in README
- ✅ `operation-selection-handling.md` - Referenced in README

#### Archive (Planning/Spec)
- ⚠️ `core-extensions-criteria.md` - Decision document (may be outdated)
- ⚠️ `core-extensions-decision-guide.md` - Decision document
- ⚠️ `delete-command-architecture-decision.md` - Decision document
- ⚠️ `delete-command-design.md` - Design document
- ⚠️ `delete-complexity-analysis.md` - Analysis document
- ⚠️ `text-input-command-migration.md` - Migration document (may be completed)
- ⚠️ `multi-operation-selection-handling.md` - Planning document
- ⚠️ `copy-paste-cut-spec.md` - Spec document (need to verify implementation)
- ⚠️ `copy-paste-cut-implementation-readiness.md` - Planning document
- ⚠️ `converter-architecture-options.md` - Analysis document
- ⚠️ `converter-latex-sample.md` - Sample document
- ⚠️ `indent-text-spec.md` - Spec document (need to verify implementation)

**Action**: Keep implementation guides, archive planning/decision documents.

### packages/editor-core/docs

#### Archive (Planning/Spec)
- ⚠️ `context-provider-spec.md` - Spec document
- ⚠️ `core-extensions-clarification.md` - Clarification document
- ⚠️ `default-extensions-comparison.md` - Comparison document
- ⚠️ `extension-architecture.md` - Architecture document (may be outdated)
- ⚠️ `i18n-implementation-plan.md` - Planning document
- ⚠️ `i18n-number-formatting-analysis.md` - Analysis document
- ⚠️ `internationalization-spec.md` - Spec document
- ⚠️ `keybinding-and-context-examples.md` - Examples document
- ⚠️ `keybinding-builtin-vs-custom-analysis.md` - Analysis document
- ⚠️ `keybinding-defaults-and-customization.md` - Planning document
- ⚠️ `keybinding-selection-handling-analysis.md` - Analysis document
- ⚠️ `keyboard-shortcut-spec.md` - Spec document
- ⚠️ `transaction-vs-extension-architecture.md` - Architecture document
- ⚠️ `when-expression-spec.md` - Spec document
- ⚠️ `event-naming-convention.md` - Convention document (may be useful)

**Action**: Archive most planning/spec documents. Keep only if they document current implementation.

### packages/editor-view-dom/docs

#### Archive (Planning/Spec - Many Implementation Details)
- ⚠️ `algorithm-improvements.md` - Planning document
- ⚠️ `architecture-document-model-vs-editor-model.md` - Architecture document
- ⚠️ `backspace-command-refactoring.md` - Refactoring document
- ⚠️ `backspace-detailed-spec.md` - Spec document
- ⚠️ `backspace-test-checklist.md` - Test checklist
- ⚠️ `cross-node-deletion-handling.md` - Planning document
- ⚠️ `decorator-architecture.md` - Architecture document
- ⚠️ `decorator-browser-test-results.md` - Test results
- ⚠️ `decorator-cursor-expression-analysis.md` - Analysis document
- ⚠️ `decorator-guide.md` - Guide (may be useful if current)
- ⚠️ `decorator-integration.md` - Integration document
- ⚠️ `decorator-layer-rendering-final.md` - Final spec
- ⚠️ `default-extensions-strategy.md` - Strategy document
- ⚠️ `delete-architecture-decision.md` - Decision document
- ⚠️ `delete-command-architecture.md` - Architecture document
- ⚠️ `delete-detailed-spec.md` - Spec document
- ⚠️ `delete-test-scenarios.md` - Test scenarios
- ⚠️ `deleteText-path-validation.md` - Validation document
- ⚠️ `deletion-flow-structure.md` - Flow document
- ⚠️ `dom-to-model-sync-cases.md` - Sync cases
- ⚠️ `editor-comparison-mark-decorator.md` - Comparison document
- ⚠️ `editor-deletion-comparison.md` - Comparison document
- ⚠️ `editor-view-dom-spec.md` - Spec document
- ⚠️ `enter-key-detailed-spec.md` - Spec document
- ⚠️ `handleEfficientEdit-implementation-detail.md` - Implementation detail
- ⚠️ `hybrid-approach-analysis.md` - Analysis document
- ⚠️ `implementation-review.md` - Review document
- ⚠️ `input-delete-flow-summary.md` - Summary document
- ⚠️ `input-event-editing-plan.md` - Planning document
- ⚠️ `input-handling-implementation-guide.md` - Implementation guide (may be useful)
- ⚠️ `input-handling-todo.md` - TODO document
- ⚠️ `input-rendering-race-condition.md` - Issue document
- ⚠️ `keyboard-navigation-selectable-spec.md` - Spec document
- ⚠️ `layer-structure.md` - Structure document
- ⚠️ `manual-test-scenarios.md` - Test scenarios
- ⚠️ `mark-preservation-debug.md` - Debug document
- ⚠️ `proxy-performance-analysis.md` - Analysis document
- ⚠️ `renderer-dom-integration-plan.md` - Planning document
- ⚠️ `renderer-dom-integration-spec.md` - Spec document
- ⚠️ `replaceText-path-validation.md` - Validation document
- ⚠️ `reverse-transformation-concept-review.md` - Review document
- ⚠️ `selection-algorithm.md` - Algorithm document
- ⚠️ `selection-handling.md` - Handling document
- ⚠️ `selection-sync-validation.md` - Validation document
- ⚠️ `selection-system.md` - System document (may be useful if current)
- ⚠️ `skipnodes-handlers-integration.md` - Integration document
- ⚠️ `transaction-migration-plan.md` - Migration plan

**Action**: This package has many implementation detail documents. Keep only if they document current implementation. Archive planning/spec/test documents.

### packages/renderer-dom/docs

#### Archive (Many Implementation Details)
- ⚠️ Most documents appear to be implementation details, analysis, or planning
- Need to verify which document current implementation

**Action**: Review each document to determine if it matches current implementation.

### packages/devtool/docs

#### Archive (Planning)
- ⚠️ `auto-tracing-architecture.md` - Architecture document
- ⚠️ `auto-tracing-integration-plan.md` - Planning document
- ⚠️ `execution-flow-monitoring-pattern-v2.md` - Pattern document
- ⚠️ `execution-flow-monitoring-pattern.md` - Pattern document
- ⚠️ `flow-reconstructor-role-analysis.md` - Analysis document
- ⚠️ `input-debug-plan.md` - Planning document

**Action**: Archive planning documents unless features are implemented.

### packages/converter/docs

#### Keep/Archive (Need Verification)
- ⚠️ `office-html-support.md` - Need to verify if feature is implemented

## Recommended Actions

### Step 1: Create Archive Structure
```bash
# Create archive directories
mkdir -p packages/datastore/docs/archive
mkdir -p packages/extensions/docs/archive
mkdir -p packages/editor-core/docs/archive
mkdir -p packages/editor-view-dom/docs/archive
mkdir -p packages/renderer-dom/docs/archive
mkdir -p packages/devtool/docs/archive
```

### Step 2: Move Planning/Spec Documents
Move documents marked with ⚠️ to archive folders after verification.

### Step 3: Update README References
Ensure README files only reference documents that are kept.

### Step 4: Create Archive Index
Create an `archive/README.md` in each package explaining what's archived and why.

## Verification Needed

Before archiving, verify:
1. Is the feature documented actually implemented?
2. Does the document match current implementation?
3. Is the document referenced anywhere in code or other docs?

## Documents to Definitely Keep

- `packages/datastore/docs/transaction-integration.md`
- `packages/datastore/docs/document-iterator-spec.md`
- `packages/datastore/docs/model-traversal-api.md`
- `packages/extensions/docs/extension-design-and-implementation.md`
- `packages/extensions/docs/command-architecture-guide.md`
- `packages/extensions/docs/operation-selection-handling.md`

