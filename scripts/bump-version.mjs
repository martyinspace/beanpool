#!/usr/bin/env node

/**
 * BeanPool Version Bumping Utility Script
 *
 * Standalone, zero-dependency Node.js script to increment the version across all
 * workspace package.json files, commit the changes, and create the corresponding Git release tag.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch            # e.g., 1.0.47 -> 1.0.48
 *   node scripts/bump-version.mjs minor            # e.g., 1.0.47 -> 1.1.0
 *   node scripts/bump-version.mjs major            # e.g., 1.0.47 -> 2.0.0
 *   node scripts/bump-version.mjs 1.0.48           # set version explicitly
 *
 * Options:
 *   --dry-run                                      # log changes without writing files or committing
 *   --no-tag                                       # do not create git tag
 *   --no-commit                                    # do not create git commit
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Color helpers
const esc = (code) => `\x1b[${code}m`;
const RESET = esc(0);
const BOLD = esc(1);
const GREEN = esc(32);
const YELLOW = esc(33);
const RED = esc(31);
const CYAN = esc(36);
const MAGENTA = esc(35);

const log = (msg) => console.log(msg);
const logSuccess = (msg) => console.log(`${GREEN}✔ ${msg}${RESET}`);
const logWarn = (msg) => console.log(`${YELLOW}⚠ ${msg}${RESET}`);
const logError = (msg) => console.error(`${RED}❌ ${msg}${RESET}`);
const logInfo = (msg) => console.log(`${CYAN}ℹ ${msg}${RESET}`);

// Files to update
const PACKAGE_FILES = [
  'package.json',
  'packages/beanpool-core/package.json',
  'apps/server/package.json',
  'apps/pwa/package.json',
  'apps/native/package.json'
];

function main() {
  log(`\n${BOLD}${CYAN}─────────────────────────────────────────────────────────────${RESET}`);
  log(`  ${BOLD}BeanPool Version Bump Utility${RESET}`);
  log(`${BOLD}${CYAN}─────────────────────────────────────────────────────────────${RESET}\n`);

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const noTag = args.includes('--no-tag');
  const noCommit = args.includes('--no-commit');
  
  // Filter out options from positional arguments
  const positionalArgs = args.filter(a => !a.startsWith('--'));
  
  if (positionalArgs.length === 0) {
    printHelp();
    process.exit(1);
  }

  const targetArg = positionalArgs[0].toLowerCase();

  // 1. Read current version from root package.json
  const rootPkgPath = path.resolve(ROOT_DIR, 'package.json');
  if (!fs.existsSync(rootPkgPath)) {
    logError(`Root package.json not found at: ${rootPkgPath}`);
    process.exit(1);
  }

  let rootPkg;
  try {
    rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  } catch (e) {
    logError(`Failed to parse root package.json: ${e.message}`);
    process.exit(1);
  }

  const currentVersion = rootPkg.version || '0.0.0';
  logInfo(`Current version: ${BOLD}${YELLOW}${currentVersion}${RESET}`);

  // 2. Parse target version
  let nextVersion;
  if (['patch', 'minor', 'major'].includes(targetArg)) {
    nextVersion = calculateNextVersion(currentVersion, targetArg);
  } else {
    // Verify custom version syntax
    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(targetArg)) {
      logError(`Invalid version format: "${targetArg}". Must be semver (e.g. 1.2.3 or 1.2.3-beta.1).`);
      process.exit(1);
    }
    nextVersion = targetArg;
  }

  if (nextVersion === currentVersion) {
    logWarn(`Proposed version is identical to current version (${nextVersion}).`);
    process.exit(0);
  }

  logInfo(`Target version:  ${BOLD}${GREEN}${nextVersion}${RESET}`);
  if (isDryRun) {
    logWarn(`[DRY RUN] No files will be modified, and no git operations will occur.`);
  }

  log(`\n${BOLD}Updating Package Files:${RESET}`);
  
  // 3. Update version in files
  const updatedFilesPaths = [];
  for (const relPath of PACKAGE_FILES) {
    const fullPath = path.resolve(ROOT_DIR, relPath);
    if (!fs.existsSync(fullPath)) {
      logWarn(`File not found, skipping: ${relPath}`);
      continue;
    }

    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
      logError(`Failed to parse ${relPath}: ${e.message}`);
      process.exit(1);
    }

    const prevVersion = pkg.version || 'none';
    
    if (isDryRun) {
      log(`   ${relPath}: ${YELLOW}${prevVersion}${RESET} → ${GREEN}${nextVersion}${RESET} (dry-run)`);
    } else {
      pkg.version = nextVersion;
      // Also update workspace dependency references if any
      if (pkg.dependencies && pkg.dependencies['@beanpool/core']) {
        // If it was workspace:* or pinned, keep it
      }
      fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      log(`   ${relPath}: ${YELLOW}${prevVersion}${RESET} → ${GREEN}${nextVersion}${RESET} ${GREEN}✔${RESET}`);
      updatedFilesPaths.push(fullPath);
    }
  }

  if (isDryRun) {
    logSuccess(`\n[DRY RUN SUCCESS] All package versions parsed cleanly.`);
    log(`Next steps without --dry-run:`);
    log(`  1. Write versions to files`);
    if (!noCommit) log(`  2. Run: git add ${PACKAGE_FILES.join(' ')}`);
    if (!noCommit) log(`  3. Run: git commit -m "chore: bump version to v${nextVersion}"`);
    if (!noTag) log(`  4. Run: git tag v${nextVersion}`);
    log(`  5. Run: git push && git push --tags`);
    process.exit(0);
  }

  logSuccess(`\nAll package.json files updated to v${nextVersion}!`);

  // 4. Git Operations
  if (noCommit) {
    logInfo('Skipping git commit as requested (--no-commit).');
    process.exit(0);
  }

  // Check if git is available and tree status
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  } catch {
    logWarn('Not in a git repository. Git operations skipped.');
    process.exit(0);
  }

  log(`\n${BOLD}Git Operations:${RESET}`);
  try {
    // Stage package.json files
    execSync(`git add ${PACKAGE_FILES.join(' ')}`, { cwd: ROOT_DIR });
    log(`   git add package.json files... ${GREEN}✔${RESET}`);

    // Commit
    const commitMsg = `chore: bump version to v${nextVersion}`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: ROOT_DIR, stdio: 'ignore' });
    log(`   git commit -m "${commitMsg}"... ${GREEN}✔${RESET}`);

    if (noTag) {
      logInfo('Skipping git release tag as requested (--no-tag).');
    } else {
      // Tag
      const tagName = `v${nextVersion}`;
      // Remove tag first if it exists locally to avoid conflict
      try {
        execSync(`git tag -d ${tagName}`, { cwd: ROOT_DIR, stdio: 'ignore' });
      } catch { /* normal if tag doesn't exist */ }

      execSync(`git tag -a ${tagName} -m "Release ${tagName}"`, { cwd: ROOT_DIR, stdio: 'ignore' });
      log(`   git tag -a ${tagName}... ${GREEN}✔${RESET}`);
    }

    log(`\n${BOLD}${GREEN}🎉 Version bump successful!${RESET}`);
    log(`To trigger the build & push Docker image, run:`);
    log(`  ${BOLD}git push && git push --tags${RESET}\n`);

  } catch (e) {
    logError(`Git operation failed: ${e.message}`);
    logWarn('Please verify git status and manually complete commit or tagging.');
  }
}

function calculateNextVersion(current, releaseType) {
  const parts = current.split('-')[0].split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    logError(`Cannot auto-bump non-standard semver: "${current}". Please pass explicit version.`);
    process.exit(1);
  }

  let [major, minor, patch] = parts;

  if (releaseType === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (releaseType === 'minor') {
    minor += 1;
    patch = 0;
  } else if (releaseType === 'patch') {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

function printHelp() {
  log(`Usage:`);
  log(`  node scripts/bump-version.mjs <increment_type|version> [options]`);
  log(``);
  log(`Increment Types:`);
  log(`  patch                 Increments the patch version (e.g. 1.0.47 -> 1.0.48)`);
  log(`  minor                 Increments the minor version (e.g. 1.0.47 -> 1.1.0)`);
  log(`  major                 Increments the major version (e.g. 1.0.47 -> 2.0.0)`);
  log(``);
  log(`Explicit Version:`);
  log(`  1.0.48                Bumps all files to exactly "1.0.48"`);
  log(``);
  log(`Options:`);
  log(`  --dry-run             Preview changes without modifying files or running git`);
  log(`  --no-tag              Skip creating a git tag (only updates files and commits)`);
  log(`  --no-commit           Skip git commit and tag (only modifies package.json files)`);
  log(``);
  log(`Examples:`);
  log(`  node scripts/bump-version.mjs patch`);
  log(`  node scripts/bump-version.mjs 1.1.0 --dry-run`);
}

main();
