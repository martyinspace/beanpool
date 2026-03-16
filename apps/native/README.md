# BeanPool Pillar Toggle

Background mesh state mirror for the BeanPool sovereign network.

## Purpose

The Pillar Toggle is **not** a full user interface — the primary UI is the PWA served by the BeanPool node. This app's job is to run a **background sync engine** that periodically mirrors the community ledger onto the phone.

## How It Works

```
Every 15 min (iOS) / configurable (Android):
  1. Wake up in background
  2. Connect to BeanPool node (beanpool.local)
  3. Request node's Merkle root hash
  4. Compare with local hash
     → Match? Done. (0 bytes, ~1 second)
     → Differ? Pull delta only
  5. Apply delta, prune to 1,000 tx
  6. If > 20 seconds: checkpoint & abort
```

## Constraints

| Rule | Value | Why |
|------|-------|-----|
| **Timeout** | 20 seconds | iOS kills tasks > 30s |
| **Pruning** | 1,000 transactions | Protect phone storage |
| **Checkpoint** | Auto | Resume aborted syncs |
| **Hash algo** | `crypto-js/sha256` | Cross-platform determinism |

## Quick Start

```bash
pnpm install
pnpm start
```

## Files

| File | Purpose |
|------|---------|
| `services/pillar-sync.ts` | Delta-only sync engine |
| `services/background-task.ts` | Expo BackgroundFetch registration |
| `app/_layout.tsx` | Root layout (registers task on mount) |
| `app/index.tsx` | Sync status dashboard |
