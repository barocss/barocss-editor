# Release Issues Summary

## Critical Issues (Must Fix Before Release)

### 1. Korean Comments Translation
- **Count**: 24,161 matches across 633 files
- **Priority**: 🔴 Critical
- **Action**: Translate all Korean comments to English
- **Files**: All `.ts`, `.tsx` files in `packages/`

### 2. Type Safety (`as any` usage)
- **Count**: 1,519 matches across 270 files
- **Priority**: 🔴 Critical
- **Action**: Replace with proper types
- **Files**: All `.ts`, `.tsx` files in `packages/`

## High Priority Issues

### 3. Missing publishConfig
The following packages are missing `publishConfig`:
- `packages/converter/package.json`
- `packages/editor-core/package.json`
- `packages/shared/package.json`
- `packages/extensions/package.json`
- `packages/editor-view-dom/package.json`
- `packages/model/package.json`

**Action**: Add `publishConfig` to all packages following the pattern:
```json
{
  "publishConfig": {
    "access": "public",
    "main": "./dist/index.js",
    "module": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    },
    "files": ["dist"]
  }
}
```

## Medium Priority Issues

### 4. Version Consistency
- Some packages have version `0.1.0`, others have `1.0.0`
- **Action**: Decide on initial version strategy (recommend starting with `0.1.0` for all)

### 5. Package Metadata
- Ensure all packages have:
  - `description`
  - `keywords`
  - `author`
  - `license`
  - `repository` (if applicable)

## Recommended Tools

### Changesets (Already Configured)
- ✅ Config file created: `.changeset/config.json`
- ✅ Scripts added to root package.json
- ⚠️ Need to install: `pnpm add -D -w @changesets/cli`

### Additional Recommendations

1. **ESLint Rules**
   - Add rule to warn about `as any`
   - Add rule to detect Korean characters in comments

2. **Pre-commit Hooks**
   - Use `husky` + `lint-staged` to prevent Korean comments
   - Type checking before commit

3. **CI/CD**
   - GitHub Actions for automated testing
   - Automated release workflow

4. **Documentation**
   - API documentation generation (TypeDoc)
   - Migration guides for breaking changes

## Next Steps

1. **Install Changesets**
   ```bash
   pnpm add -D -w @changesets/cli
   ```

2. **Create Initial Changeset**
   ```bash
   pnpm changeset
   ```

3. **Fix Critical Issues**
   - Start with high-impact files (public APIs)
   - Use automated tools where possible
   - Review manually for context

4. **Add publishConfig**
   - Template provided above
   - Apply to all packages

5. **Test Build**
   ```bash
   pnpm build
   ```

6. **Test Publish (Dry Run)**
   ```bash
   pnpm changeset publish --dry-run
   ```

## Automation Suggestions

### For Korean Comments
Consider using a script to:
1. Find all Korean comments
2. Translate using AI/translation service
3. Review and commit

### For `as any`
1. Create TypeScript strict mode
2. Gradually fix type issues
3. Use `unknown` as intermediate step
4. Add proper type definitions

