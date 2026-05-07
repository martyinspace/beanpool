# Sync Walkthroughs to Docs

> Use this workflow after completing an implementation session to ensure all new features, changes, and fixes are reflected in the codebase documentation.

## Trigger
Run this when the user says: "sync walkthroughs to docs", "update docs", or after completing a major implementation task.

## Steps

### 1. Gather What Changed
// turbo
```bash
git log --oneline --since="7 days ago" --no-merges
```
Review the commit messages to build a comprehensive list of features, fixes, and changes.

### 2. Read Walkthrough Artifacts
Read any walkthrough or implementation artifacts from the current conversation to identify features that were implemented.

### 3. Identify All Documentation Files
// turbo
```bash
find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" | sort
```

### 4. Cross-Reference: Find Gaps
For each feature from steps 1-2, check whether it appears in the relevant `.md` files:

| Doc File | What It Should Contain |
|----------|----------------------|
| `README.md` | Status checklist, API table, monorepo structure, feature summary |
| `HANDOVER.md` | Completed items list, node topology, architecture decisions |
| `ROADMAP.md` | Recently completed items, planned items |
| `apps/server/README.md` | File table, API count, node topology, deployment commands |
| `apps/native/README.md` | Architecture tree, tabs, key features, parity table |
| `apps/pwa/README.md` | Features list, file table, API client description |
| `CONTRIBUTING.md` | Process docs (usually doesn't need feature updates) |
| `packages/beanpool-core/README.md` | Protocol concepts (update only if protocol changed) |

### 5. Update Each File
For each gap found, update the relevant `.md` file with the missing information. Be thorough:
- Add new source files to architecture/file tables
- Add new API endpoints to API tables
- Add new components to architecture trees
- Add completed features to status checklists
- Update counts (e.g., "35+ endpoints" → "45+ endpoints")
- Fix factual errors (node hosting, IP addresses, etc.)

### 6. Commit
```bash
git add *.md apps/*/README.md packages/*/README.md
git commit -m "docs: sync walkthroughs to codebase documentation

Cross-referenced recent git history against all .md files.
[describe specific additions]"
```

## Important Notes

- **Don't just update one file** — features often span server + native + PWA, so update all relevant docs.
- **Check factual accuracy** — cross-reference `deploy.sh`, `docker-compose.yml`, and source code for node topology, IP addresses, and SSH access.
- **Update counts** — API endpoint counts, category counts, etc. go stale fast.
- **Architecture trees** — new components and services must be added to the file tree in READMEs.
- **Parity tables** — if a feature was added to native or PWA, update the parity comparison table.
