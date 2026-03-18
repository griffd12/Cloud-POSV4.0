#!/bin/bash
set -e

echo "Post-merge setup: checking dependencies..."
if [ -f "package-lock.json" ]; then
  echo "Dependencies managed by npm — skipping (handled by Replit)."
fi

echo "Post-merge setup complete."
