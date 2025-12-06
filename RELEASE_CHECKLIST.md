# Release Checklist

This document outlines the checklist for preparing Barocss Editor packages for release.

## Current Status

### Issues Found

1. **Korean Comments**: 24,161 matches across 633 files
   - Need to translate all Korean comments to English
   - Priority: High

2. **Type Safety**: 1,519 `as any` usages across 270 files
   - Need to replace with proper types
   - Priority: High

3. **Version Management**: No changesets configured
   - Need to set up @changesets/cli
   - Priority: High

4. **Package Configuration**: Some packages missing publishConfig
   - Need to ensure all packages have proper publishConfig
   - Priority: Medium

## Required Tools for Release

### 1. Changesets (Recommended)

**Why Changesets?**
- Monorepo-friendly version management
- Automatic changelog generation
- Semantic versioning support
- Works great with pnpm workspaces

**Installation:**
```bash
pnpm add -D -w @changesets/cli
```

**Setup:**
1. Create `.changeset/config.json`
2. Add changeset scripts to root package.json
3. Create initial changeset

### 2. Release Scripts

Add to root `package.json`:
```json
{
  "scripts": {
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "pnpm build && changeset publish"
  }
}
```

### 3. GitHub Actions (Optional but Recommended)

For automated releases:
- Create `.github/workflows/release.yml`
- Configure npm token
- Set up automated versioning and publishing

## Pre-Release Tasks

### Code Quality

- [ ] Translate all Korean comments to English
- [ ] Replace `as any` with proper types
- [ ] Run full test suite: `pnpm test`
- [ ] Run type checking: `pnpm type-check`
- [ ] Run linter: `pnpm lint`
- [ ] Build all packages: `pnpm build`

### Package Configuration

- [ ] Verify all packages have `publishConfig`
- [ ] Ensure all packages have proper `exports` field
- [ ] Check `files` field includes only necessary files
- [ ] Verify `main`, `module`, `types` point to dist files
- [ ] Ensure consistent versioning strategy

### Documentation

- [ ] Update root README.md
- [ ] Verify all package READMEs are up to date
- [ ] Check LICENSE files exist
- [ ] Update CHANGELOG.md (if using changesets, auto-generated)

### Security & Legal

- [ ] LICENSE file exists and is correct
- [ ] All dependencies are properly licensed
- [ ] No security vulnerabilities: `pnpm audit`

## Package-Specific Checks

### Core Packages
- [ ] `@barocss/schema`
- [ ] `@barocss/datastore`
- [ ] `@barocss/model`
- [ ] `@barocss/editor-core`
- [ ] `@barocss/extensions`
- [ ] `@barocss/renderer-dom`
- [ ] `@barocss/editor-view-dom`
- [ ] `@barocss/dsl`
- [ ] `@barocss/converter`
- [ ] `@barocss/shared`

### Collaboration Packages
- [ ] `@barocss/collaboration`
- [ ] `@barocss/collaboration-yjs`
- [ ] `@barocss/collaboration-automerge`
- [ ] `@barocss/collaboration-yorkie`
- [ ] `@barocss/collaboration-liveblocks`

### Utility Packages
- [ ] `@barocss/dom-observer`
- [ ] `@barocss/text-analyzer`
- [ ] `@barocss/devtool`

## Release Process

1. **Prepare Changes**
   ```bash
   pnpm changeset
   ```

2. **Version Packages**
   ```bash
   pnpm version-packages
   ```

3. **Build**
   ```bash
   pnpm build
   ```

4. **Publish**
   ```bash
   pnpm release
   ```

## Additional Recommendations

### 1. Semantic Versioning
- Follow semver: MAJOR.MINOR.PATCH
- Breaking changes → MAJOR
- New features → MINOR
- Bug fixes → PATCH

### 2. Pre-release Testing
- Run full test suite
- Test in a sample application
- Verify all imports work correctly

### 3. Documentation
- Ensure all public APIs are documented
- Update migration guides if breaking changes
- Add examples for new features

### 4. CI/CD
- Set up automated testing
- Configure automated releases
- Add release notes automation

## Notes

- Start with alpha/beta releases before stable
- Consider using `--tag alpha` or `--tag beta` for initial releases
- Monitor npm registry for successful publishes

