# renderer-dom Integration Additional Feature Test Checklist

## 📋 Test Items

### 1. BaseComponentState.mount/unmount Call Verification ✅ (tests written, debugging needed)
- [x] Verify mount() call timing (when component is mounted to DOM) - tests written, component rendering issue
- [x] Verify unmount() call timing (when component is removed from DOM) - tests written, component rendering issue
- [x] Independent mount/unmount for multiple components - tests written, component rendering issue
- [x] Verify mount/unmount call status on re-render (should not be called) - tests written, component rendering issue
- [x] Verify unmount → mount call on sid change - tests written, component rendering issue

**Note**: 
- Confirmed that ComponentManager calls `stateInstHook.mount()` and `stateInstHook.unmount()`
- However, BaseComponentState.mount/unmount are currently TODO
- Test file written: `mount-unmount-integration.test.ts`
- Component rendering issue found (debugging needed)

### 2. Layer Decorator Rendering Tests ✅ (tests written)
- [x] Basic Layer decorator rendering (rendered in layers.decorator layer) - tests written
- [x] Layer decorator position updates - tests written
- [x] Layer decorator add/remove - tests written
- [x] Multiple Layer decorators rendered simultaneously - tests written
- [x] Mixed Layer decorator with inline/block decorators - tests written

**Note**: 
- Test file written: `layer-decorator-integration.test.ts`
- Component rendering issues found in some tests (debugging needed)

### 3. Table Structure Rendering Tests ✅ (tests written)
- [x] Basic table structure rendering (table > tbody > tr > td) - tests written
- [x] Table cell content updates - tests written
- [x] Table row add/remove - tests written
- [x] Table row reordering - tests written
- [x] Nested table structures - tests written
- [x] Apply marks/decorator to table - tests written

**Note**: 
- Test file written: `table-integration.test.ts`
- Table templates need to be registered (table, tbody, tr, td, th)
- Rendering issues found in some tests (debugging needed)

### 4. Form Element Rendering Tests ✅ (tests written)
- [x] input element rendering and value updates - tests written
- [x] textarea element rendering and value updates - tests written
- [x] select element rendering and selected value changes - tests written
- [x] checkbox/radio element rendering and state changes - tests written
- [x] Form element integration with Component State - tests written
- [x] Form element event handling (onChange, etc.) - tests written

**Note**: 
- Test file written: `form-elements-integration.test.ts`
- Form element templates need to be registered (input, textarea, select, option, checkbox, radio)
- Rendering issues found in some tests (debugging needed)

## 📊 Progress

- **Completed**: 4/4 items (tests written)
- **Debugging needed**: component rendering issues found in all test files
- **Waiting**: debugging and test pass verification
