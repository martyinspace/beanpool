#!/bin/bash
echo "⚠️ Flattening GitHub Repository..."
git checkout --orphan temp_flatten
git add -A
git commit -m "Initial commit: Dynamic Sovereign Currency + UGC Completed"
git branch -D main
git branch -m main
git push -f origin main
echo "✅ Repository Successfully Flattened!"
