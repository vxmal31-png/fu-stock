/*
# Remove authentication requirement — switch to no-auth mode

## Overview
Removes the authentication requirement from the Engine Repair Workshop app.
All tables become accessible to the anon role (no sign-in needed).
Mechanic identity is replaced by a client-generated session ID stored in the browser.

## Changes

### transactions
- `mechanic_id` column: dropped NOT NULL constraint and FK to auth.users (now nullable)
- Added `mechanic_name` text column for optional operator name display

### scan_sessions
- `mechanic_id` column: dropped NOT NULL constraint and FK to auth.users (now nullable)
- Added `session_id` text column for client-generated session tracking (replaces auth.uid())

### RLS Policies — all tables
- Replaced all authenticated-only policies with anon+authenticated open access
- This is a no-auth app, so USING (true) is appropriate for all shared data

### RPC Functions
- `deduct_stock`: now accepts `p_session_id` text parameter instead of using auth.uid()
- `return_tool`: now accepts `p_session_id` text parameter instead of using auth.uid()
- `clear_scan_session`: now accepts `p_session_id` text parameter
- `is_admin()`: dropped (no longer needed)

### Trigger
- `on_auth_user_created` trigger: dropped (no auth)

## Important Notes
1. The profiles table remains in the database but is no longer used by the app.
2. Session IDs are generated client-side and stored in localStorage for per-browser scan tracking.
3. All data is intentionally shared/public since there is no login — this is a single-workshop app.
*/

-- ============ Drop auth trigger ============
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- ============ Drop is_admin function ============
DROP FUNCTION IF EXISTS is_admin();

-- ============ transactions: make mechanic_id nullable, drop FK, add name column ============
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_mechanic_id_fkey;
ALTER TABLE transactions ALTER COLUMN mechanic_id DROP NOT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS mechanic_name text DEFAULT '';

-- ============ scan_sessions: make mechanic_id nullable, drop FK, add session_id ============
ALTER TABLE scan_sessions DROP CONSTRAINT IF EXISTS scan_sessions_mechanic_id_fkey;
ALTER TABLE scan_sessions ALTER COLUMN mechanic_id DROP NOT NULL;
ALTER TABLE scan_sessions ADD COLUMN IF NOT EXISTS session_id text DEFAULT '';

-- Index for session-based lookups
CREATE INDEX IF NOT EXISTS idx_scan_sessions_session ON scan_sessions(session_id);

-- ============ RLS: switch all tables to anon+authenticated open access ============

-- profiles: keep existing but allow anon read (not actively used)
DROP POLICY IF EXISTS "select_own_or_all_if_admin" ON profiles;
CREATE POLICY "select_profiles"
ON profiles FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;

-- products: open CRUD for anon+authenticated
DROP POLICY IF EXISTS "select_products" ON products;
CREATE POLICY "select_products"
ON products FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_products_admin" ON products;
CREATE POLICY "insert_products"
ON products FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_products_admin" ON products;
CREATE POLICY "update_products"
ON products FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_products_admin" ON products;
CREATE POLICY "delete_products"
ON products FOR DELETE
TO anon, authenticated USING (true);

-- transactions: open CRUD for anon+authenticated
DROP POLICY IF EXISTS "select_transactions" ON transactions;
CREATE POLICY "select_transactions"
ON transactions FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_transactions" ON transactions;
CREATE POLICY "insert_transactions"
ON transactions FOR INSERT
TO anon, authenticated WITH CHECK (true);

-- scan_sessions: open CRUD for anon+authenticated
DROP POLICY IF EXISTS "select_own_scan_sessions" ON scan_sessions;
CREATE POLICY "select_scan_sessions"
ON scan_sessions FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_scan_sessions" ON scan_sessions;
CREATE POLICY "insert_scan_sessions"
ON scan_sessions FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_own_scan_sessions" ON scan_sessions;
CREATE POLICY "delete_scan_sessions"
ON scan_sessions FOR DELETE
TO anon, authenticated USING (true);

-- ============ Rewrite RPC functions (session-based, no auth.uid()) ============

CREATE OR REPLACE FUNCTION deduct_stock(
  p_qr_token text,
  p_action_type text,
  p_session_id text
)
RETURNS TABLE (
  success boolean,
  message text,
  product_id uuid,
  product_name text,
  remaining integer,
  action_performed text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product products%ROWTYPE;
  v_remaining integer;
  v_already_scanned boolean;
  v_actual_action text;
BEGIN
  IF p_action_type NOT IN ('deduction', 'checkout') THEN
    RETURN QUERY SELECT false, 'Invalid action type', NULL::uuid, NULL::text, NULL::integer, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_product FROM products WHERE qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Product not found — invalid QR code', NULL::uuid, NULL::text, NULL::integer, NULL::text;
    RETURN;
  END IF;

  -- Check for duplicate scan: is the most recent scan for this session the same product?
  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT product_id FROM scan_sessions
      WHERE session_id = p_session_id
      ORDER BY scanned_at DESC
      LIMIT 1
    ) s
    WHERE s.product_id = v_product.id
  ) INTO v_already_scanned;

  IF v_already_scanned THEN
    RETURN QUERY SELECT false, 'Duplicate scan — scan a different product or start a new scan first', NULL::uuid, NULL::text, NULL::integer, NULL::text;
    RETURN;
  END IF;

  -- Determine action: tools get checkout, spare parts get deduction
  IF v_product.category = 'tool' AND p_action_type = 'deduction' THEN
    v_actual_action := 'checkout';
  ELSIF v_product.category = 'spare_part' AND p_action_type = 'deduction' THEN
    v_actual_action := 'deduction';
  ELSE
    v_actual_action := p_action_type;
  END IF;

  IF v_product.quantity <= 0 THEN
    IF v_actual_action = 'checkout' THEN
      RETURN QUERY SELECT false, 'No tools available to check out', v_product.id, v_product.name, v_product.quantity, v_actual_action;
    ELSE
      RETURN QUERY SELECT false, 'Out of stock', v_product.id, v_product.name, v_product.quantity, v_actual_action;
    END IF;
    RETURN;
  END IF;

  v_remaining := v_product.quantity - 1;

  UPDATE products SET quantity = v_remaining, updated_at = now()
  WHERE id = v_product.id;

  INSERT INTO transactions (product_id, action_type, quantity_change, remaining_quantity)
  VALUES (v_product.id, v_actual_action, -1, v_remaining);

  INSERT INTO scan_sessions (session_id, product_id)
  VALUES (p_session_id, v_product.id);

  RETURN QUERY SELECT true, 'Success', v_product.id, v_product.name, v_remaining, v_actual_action;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION return_tool(
  p_qr_token text,
  p_session_id text
)
RETURNS TABLE (
  success boolean,
  message text,
  product_id uuid,
  product_name text,
  remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product products%ROWTYPE;
  v_remaining integer;
  v_already_scanned boolean;
BEGIN
  SELECT * INTO v_product FROM products WHERE qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Product not found — invalid QR code', NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF v_product.category != 'tool' THEN
    RETURN QUERY SELECT false, 'Only tools can be returned', v_product.id, v_product.name, v_product.quantity;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT product_id FROM scan_sessions
      WHERE session_id = p_session_id
      ORDER BY scanned_at DESC
      LIMIT 1
    ) s
    WHERE s.product_id = v_product.id
  ) INTO v_already_scanned;

  IF v_already_scanned THEN
    RETURN QUERY SELECT false, 'Duplicate scan — scan a different product or start a new scan first', NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  v_remaining := v_product.quantity + 1;

  UPDATE products SET quantity = v_remaining, updated_at = now()
  WHERE id = v_product.id;

  INSERT INTO transactions (product_id, action_type, quantity_change, remaining_quantity)
  VALUES (v_product.id, 'return', 1, v_remaining);

  INSERT INTO scan_sessions (session_id, product_id)
  VALUES (p_session_id, v_product.id);

  RETURN QUERY SELECT true, 'Tool returned successfully', v_product.id, v_product.name, v_remaining;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION clear_scan_session(
  p_session_id text,
  p_product_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM scan_sessions
  WHERE session_id = p_session_id
    AND product_id = p_product_id;
END;
$$;

-- Grant execute to anon+authenticated
GRANT EXECUTE ON FUNCTION deduct_stock(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION return_tool(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION clear_scan_session(text, uuid) TO anon, authenticated;
