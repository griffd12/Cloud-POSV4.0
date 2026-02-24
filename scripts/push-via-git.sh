#!/bin/bash
set -e

TMPDIR=$(mktemp -d)
echo "Working in $TMPDIR"

cd "$TMPDIR"
git init
git config user.email "cloudpos@replit.dev"
git config user.name "Cloud POS Agent"

WORKSPACE="/home/runner/workspace"
EXCLUDES=".git node_modules .local .config .cache dist .upm attached_assets generated .nix-profile .nix-defexpr scripts uploads .replit .replit.nix package-lock.json"

rsync -a --progress "$WORKSPACE/" "$TMPDIR/" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.local' \
  --exclude='.config' \
  --exclude='.cache' \
  --exclude='dist' \
  --exclude='.upm' \
  --exclude='attached_assets' \
  --exclude='generated' \
  --exclude='.nix-profile' \
  --exclude='.nix-defexpr' \
  --exclude='scripts' \
  --exclude='uploads' \
  --exclude='.replit' \
  --exclude='.replit.nix' \
  --exclude='package-lock.json' \
  --exclude='*.lock'

git add -A
git commit -m "Cloud POS V3.0 - Full system upload

Complete source code including:
- React/TypeScript frontend (client/)
- Express/Node.js backend (server/)
- Shared schema and types (shared/)
- Service-host offline system (service-host/)
- Electron Windows wrapper (electron/)
- Database migrations and configuration
- Documentation and reference files"

echo "Commit created. Ready to push."
echo "TMPDIR=$TMPDIR"
