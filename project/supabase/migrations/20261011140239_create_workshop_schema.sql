/*
# Engine Repair Workshop — Stock Management Schema

## Overview
Creates the complete database schema for an Engine Repair Workshop QR Stock Management system.
Supports Admin and Mechanic roles, product inventory with QR codes, tool checkout/return,
spare part stock deduction, full transaction logging, and stock history.

## Tables

### profiles
- Extends Supabase auth.users with role information.
- `id` (uuid, PK, references auth.users)
- `full_name` (text, display name)
- `role` (text, 'admin' or 'mechanic')
- `created_at` (timestamptz)

### products
- Stores all inventory items (tools and spare parts).
- `id` (uuid, PK)
- `product_code` (text, unique — a short human-readable ID like WS-001)
- `name` (text)
- `category` (text, 'tool' or 'spare_part')
- `brand` (text)
- `quantity` (integer, current stock level — for tools this is "available to check out", for parts this is "units in stock")
- `price` (numeric, unit price)
- `min_stock` (integer, low-stock threshold)
- `qr_token` (text, unique — random token embedded in the QR code, used for scan validation)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### transactions
- Every stock movement (checkout, return, deduction) is logged here.
- `id` (uuid, PK)
- `product_id` (uuid, FK → products)
- `mechanic_id` (uuid, FK → auth.users — the mechanic who performed the action)
- `action_type` (text, 'checkout' | 'return' | 'deduction')
- `quantity_change` (integer — -1 for checkout/deduction, +1 for return)
- `remaining_quantity` (integer — stock after the action)
- `created_at` (timestamptz)

### scan_sessions
- Tracks the "last scanned product" per mechanic to prevent duplicate deductions from continuous scanning.
- A mechanic must scan a DIFFERENT product (or re-scan after clearing) before the same product can be deducted again.
- `id` (uuid, PK)
- `mechanic_id` (uuid, FK → auth.users)
- `product_id` (uuid, FK → products)
- `scanned_at` (timestamptz)

## Security (RLS)
- profiles: each user can read/update their own profile. Admins can read all profiles.
- products: all authenticated users can read. Only admins can insert/update/delete.
- transactions: all authenticated users can read. Any authenticated user can insert (the RPC handles the actual stock change safely).
- scan_sessions: each mechanic can read/clear their own sessions.
- A SECURITY DEFINER function `deduct_stock` performs atomic stock changes with server-side validation.
- A SECURITY DEFINER function `return_tool` performs atomic tool returns.
- A SECURITY DEFINER function `check_out_tool` performs atomic tool checkout.

## Important Notes
1. The stock-change RPCs are SECURITY DEFINER so they bypass RLS to update product quantities safely.
2. Each RPC validates the product exists, has enough stock, and records the transaction atomically.
3. scan_sessions prevents the same product from being deducted twice in a row by the same mechanic.
*/

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'mechanic' CHECK (role IN ('admin', 'mechanic')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_or_all_if_admin" ON profiles;
CREATE POLICY "select_own_or_all_if_admin"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id OR EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
));

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- ============ PRODUCTS ============
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('tool', 'spare_part')),
  brand text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  price numeric(10,2) NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 0,
  qr_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_products" ON products;
CREATE POLICY "select_products"
ON products FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_products_admin" ON products;
CREATE POLICY "insert_products_admin"
ON products FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
));

DROP POLICY IF EXISTS "update_products_admin" ON products;
CREATE POLICY "update_products_admin"
ON products FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
));

DROP POLICY IF EXISTS "delete_products_admin" ON products;
CREATE POLICY "delete_products_admin"
ON products FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
));

-- ============ TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  mechanic_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('checkout', 'return', 'deduction')),
  quantity_change integer NOT NULL,
  remaining_quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_transactions" ON transactions;
CREATE POLICY "select_transactions"
ON transactions FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_transactions" ON transactions;
CREATE POLICY "insert_transactions"
ON transactions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = mechanic_id);

-- ============ SCAN SESSIONS ============
CREATE TABLE IF NOT EXISTS scan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scan_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_scan_sessions" ON scan_sessions;
CREATE POLICY "select_own_scan_sessions"
ON scan_sessions FOR SELECT
TO authenticated
USING (auth.uid() = mechanic_id);

DROP POLICY IF EXISTS "insert_own_scan_sessions" ON scan_sessions;
CREATE POLICY "insert_own_scan_sessions"
ON scan_sessions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = mechanic_id);

DROP POLICY IF EXISTS "delete_own_scan_sessions" ON scan_sessions;
CREATE POLICY "delete_own_scan_sessions"
ON scan_sessions FOR DELETE
TO authenticated
USING (auth.uid() = mechanic_id);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_qr_token ON products(qr_token);
CREATE INDEX IF NOT EXISTS idx_transactions_product_id ON transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_transactions_mechanic_id ON transactions(mechanic_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_sessions_mechanic_product ON scan_sessions(mechanic_id, product_id);

-- ============ SECURITY DEFINER FUNCTIONS ============
-- These functions run with elevated privileges to safely modify stock.

-- Check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Deduct one unit of stock (for spare parts or tool checkout)
-- Validates: product exists, has stock, not a duplicate scan
CREATE OR REPLACE FUNCTION deduct_stock(
  p_qr_token text,
  p_action_type text
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
  v_mechanic uuid := auth.uid();
  v_already_scanned boolean;
  v_actual_action text;
BEGIN
  -- Validate action type
  IF p_action_type NOT IN ('deduction', 'checkout') THEN
    RETURN QUERY SELECT false, 'Invalid action type', NULL::uuid, NULL::text, NULL::integer, NULL::text;
    RETURN;
  END IF;

  -- Find product by QR token
  SELECT * INTO v_product FROM products WHERE qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Product not found — invalid QR code', NULL::uuid, NULL::text, NULL::integer, NULL::text;
    RETURN;
  END IF;

  -- Check for duplicate scan (same mechanic scanned same product recently without scanning something else)
  SELECT EXISTS (
    SELECT 1 FROM scan_sessions
    WHERE mechanic_id = v_mechanic
    ORDER BY scanned_at DESC
    LIMIT 1
  ) AND EXISTS (
    SELECT 1 FROM scan_sessions
    WHERE mechanic_id = v_mechanic
      AND product_id = v_product.id
    ORDER BY scanned_at DESC
    LIMIT 1
  ) INTO v_already_scanned;

  -- More precise: check if the MOST RECENT scan session for this mechanic is this product
  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT product_id FROM scan_sessions
      WHERE mechanic_id = v_mechanic
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

  -- For checkout, require stock > 0
  IF v_actual_action = 'checkout' AND v_product.quantity <= 0 THEN
    RETURN QUERY SELECT false, 'No tools available to check out', v_product.id, v_product.name, v_product.quantity, v_actual_action;
    RETURN;
  END IF;

  -- For deduction, require stock > 0
  IF v_actual_action = 'deduction' AND v_product.quantity <= 0 THEN
    RETURN QUERY SELECT false, 'Out of stock', v_product.id, v_product.name, v_product.quantity, v_actual_action;
    RETURN;
  END IF;

  -- Perform the stock change
  v_remaining := v_product.quantity - 1;

  UPDATE products SET quantity = v_remaining, updated_at = now()
  WHERE id = v_product.id;

  -- Record transaction
  INSERT INTO transactions (product_id, mechanic_id, action_type, quantity_change, remaining_quantity)
  VALUES (v_product.id, v_mechanic, v_actual_action, -1, v_remaining);

  -- Record scan session (prevents immediate re-scan of same product)
  INSERT INTO scan_sessions (mechanic_id, product_id)
  VALUES (v_mechanic, v_product.id);

  RETURN QUERY SELECT true, 'Success', v_product.id, v_product.name, v_remaining, v_actual_action;
  RETURN;
END;
$$;

-- Return a tool (adds 1 back to stock)
CREATE OR REPLACE FUNCTION return_tool(
  p_qr_token text
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
  v_mechanic uuid := auth.uid();
  v_already_scanned boolean;
BEGIN
  SELECT * INTO v_product FROM products WHERE qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Product not found — invalid QR code', NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  -- Only tools can be returned
  IF v_product.category != 'tool' THEN
    RETURN QUERY SELECT false, 'Only tools can be returned', v_product.id, v_product.name, v_product.quantity;
    RETURN;
  END IF;

  -- Check for duplicate scan
  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT product_id FROM scan_sessions
      WHERE mechanic_id = v_mechanic
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

  INSERT INTO transactions (product_id, mechanic_id, action_type, quantity_change, remaining_quantity)
  VALUES (v_product.id, v_mechanic, 'return', 1, v_remaining);

  -- Record scan session
  INSERT INTO scan_sessions (mechanic_id, product_id)
  VALUES (v_mechanic, v_product.id);

  RETURN QUERY SELECT true, 'Tool returned successfully', v_product.id, v_product.name, v_remaining;
  RETURN;
END;
$$;

-- Clear scan session (allows re-scanning the same product)
CREATE OR REPLACE FUNCTION clear_scan_session(
  p_product_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM scan_sessions
  WHERE mechanic_id = auth.uid()
    AND product_id = p_product_id;
END;
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'mechanic')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Grant execute on the functions to authenticated users
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_stock(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION return_tool(text) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_scan_session(uuid) TO authenticated;
