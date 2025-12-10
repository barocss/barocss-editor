# Reconcile Test Checklist (After Fiber Migration)

## Test List

### ✅ Already Fiber-Compatible
- [x] `reconcile-root-basic.test.ts` - waitForFiber added
- [x] `reconciler-component-updatebysid.test.ts` - waitForFiber added
- [x] `reconciler-update-flow.test.ts` - waitForFiber added
- [x] `reconciler-advanced-cases.test.ts` - waitForFiber added

### 🔍 Needs Verification (Fiber Async Handling Check)
- [x] `reconciler-verification.test.ts` - partially fixed (38 failed, 52 passed)
- [x] `reconciler-complex-scenarios.test.ts` - partially fixed (8 failed) - DOM structure issue found
- [x] `reconciler-lifecycle.test.ts` - partially fixed (4 failed, 2 passed)
- [ ] `reconciler-errors.test.ts`
- [ ] `reconciler-portal.test.ts`
- [ ] `reconciler-prevvnode-nextvnode.test.ts`
- [ ] `reconciler-text-vnode.test.ts`
- [ ] `reconciler-performance.test.ts`
- [ ] `reconciler-mark-wrapper-reuse.test.ts`
- [ ] `reconciler-component-state-integration.test.ts`
- [ ] `reconciler-selection-pool.behavior.test.ts`
- [ ] `reconciler-selection-preservation.test.ts`

### ⚠️ Issues Found
1. **DOM Structure Error**: DOM structure rendered differently than expected in `reconciler-complex-scenarios.test.ts`
   - Cause: possible order issue from Fiber async handling or reorder logic problem
   - Action needed: verify reorder logic in `reconcileVNodesToDOM`

### 🧪 Fiber-Specific Tests
- [x] `fiber-reconciler.test.ts` - Fiber structure tests
- [x] `fiber-scheduler.test.ts` - Fiber scheduler tests
- [x] `fiber-tree.test.ts` - Fiber tree creation tests
- [x] `reconciler-fiber-integration.test.ts` - Fiber integration tests

### 🔧 Utility Tests (Not Directly Related to Fiber)
- [ ] `reconcile-utils-host-management.test.ts`
- [ ] `reconcile-utils-text-node-handlers.test.ts`
- [ ] `reconcile-utils-portal-handler.test.ts`
- [ ] `reconcile-utils-host-finding.test.ts`
- [ ] `reconcile-utils-meta-utils.test.ts`
- [ ] `reconcile-utils-vnode-utils.test.ts`
- [ ] `reconcile-utils-dom-utils.test.ts`
- [ ] `reconcile-utils-pre-clean.test.ts` (removed - not used)

## Verification Items

What to check in each test:

1. **Async Handling Check**
   - After calling `renderer.render()` or `reconciler.reconcile()`
   - Check if `await waitForFiber()` needs to be added

2. **DOM Update Timing**
   - When checking immediately after DOM manipulation → `waitForFiber()` needed
   - When checking after sufficient time has passed → may not be needed

3. **Test Failure Cause Analysis**
   - Distinguish whether it's a timing issue from Fiber async handling
   - Or an actual logic error

## Execution Order

1. Run each test file
2. Analyze failed tests
3. Add `waitForFiber()` or fix logic
4. Re-run to verify pass
