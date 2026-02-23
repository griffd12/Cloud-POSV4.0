-- Migration: Add behavioral configuration columns to tenders table
-- Purpose: Move tender behavior from hardcoded string comparisons to database-driven flags
-- Date: 2026-02-23
-- Phase: Tender config-driven refactor (Phase 1)
-- NOTE: The old "type" column is intentionally preserved for backward compatibility.

-- Step 1: Add columns (safe to re-run with IF NOT EXISTS)
ALTER TABLE tenders
  ADD COLUMN IF NOT EXISTS pop_drawer boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_tips boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_over_tender boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_check_on_payment boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_manager_approval boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_payment_processor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Step 2: Backfill existing rows based on their current type value

-- Cash tenders: pop drawer, allow over-tender (change due)
UPDATE tenders SET
  pop_drawer = true,
  allow_over_tender = true,
  allow_tips = false,
  requires_payment_processor = false,
  display_order = 0
WHERE type = 'cash';

-- Credit/Debit tenders: allow tips, require payment processor
UPDATE tenders SET
  pop_drawer = false,
  allow_tips = true,
  allow_over_tender = false,
  requires_payment_processor = true,
  display_order = 10
WHERE type IN ('credit', 'debit');

-- Gift card tenders: no special flags
UPDATE tenders SET
  pop_drawer = false,
  allow_tips = false,
  allow_over_tender = false,
  requires_payment_processor = false,
  display_order = 20
WHERE type = 'gift';

-- All other tender types: defaults only, set display order
UPDATE tenders SET
  display_order = 30
WHERE type NOT IN ('cash', 'credit', 'debit', 'gift');
