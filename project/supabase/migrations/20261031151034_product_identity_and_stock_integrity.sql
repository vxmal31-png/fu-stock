/*
# Permanent product IDs, QR identity, and stock integrity

## Overview
Makes every product identifiable by a unique, permanent product ID and a unique QR code,
and makes stock changes safe against negative values and concurrent scans.
Existing products (2) and transactions (3) are preserved unchanged.

## Product identity
- product_code is the product ID. It is normalised (trimmed, upper-cased).
- If no ID is supplied on creation, the server generates a unique one (format WS-XXXXXXXX).
- product_code and qr_token can never be changed after creation (enforced by a database trigger).
- qr_token is the value encoded in each product's QR code. It is unique and permanent.

## Validation
- name must not be blank (after trimming).
- price and min_stock must not be negative.
- quantity must not be negative (existing constraint).
- Duplicate product IDs are rejected by the existing unique constraint.

## Stock integrity
- deduct_stock, return_tool and adjust_stock lock the product row while they change stock,
  so two simultaneous scans cannot both take the last unit.
- Stock never drops below zero. Zero stock returns an "Out of Stock" result and writes no transaction.
- Every successful change records previous stock, new stock, and notes in transactions.

## Security
- No table or policy changes. Existing grants and open anon/authenticated policies are kept.

## Important Notes
1. Existing rows are checked against the new rules when the migration runs; the migration fails safely if any row breaks them.
2. Transactions are never deleted or edited by this migration.
*/

-- ============ Product ID normalisation on creation ============
CREATE OR REPLACE FUNCTION products_before_insert_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.brand := btrim(COALESCE(NEW.brand, ''));
  v_code := upper(btrim(COALESCE(NEW.product_code, '')));

  IF v_code = '' THEN
    LOOP
      v_code := 'WS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM products p WHERE p.product_code = v_code);
    END LOOP;
  END IF;

  NEW.product_code := v_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_normalize_insert ON products;
CREATE TRIGGER products_normalize_insert
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION products_before_insert_normalize();

-- ============ Permanent identity on update ============
CREATE OR REPLACE FUNCTION products_before_update_protect_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.product_code IS DISTINCT FROM OLD.product_code
     OR NEW.qr_token IS DISTINCT FROM OLD.qr_token THEN
    RAISE EXCEPTION 'Product ID and QR code are permanent and cannot be changed';
  END IF;

  NEW.name := btrim(NEW.name);
  NEW.brand := btrim(COALESCE(NEW.brand, ''));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_protect_identity ON products;
CREATE TRIGGER products_protect_identity
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_before_update_protect_identity();

-- ============ Server-side value checks ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_name_not_blank') THEN
    ALTER TABLE products ADD CONSTRAINT products_name_not_blank CHECK (length(btrim(name)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_price_non_negative') THEN
    ALTER TABLE products ADD CONSTRAINT products_price_non_negative CHECK (price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_min_stock_non_negative') THEN
    ALTER TABLE products ADD CONSTRAINT products_min_stock_non_negative CHECK (min_stock >= 0);
  END IF;
END $$;

-- ============ deduct_stock: row lock, Out of Stock message ============
CREATE OR REPLACE FUNCTION deduct_stock(
  p_qr_token text,
  p_action_type text,
  p_session_id text,
  p_notes text DEFAULT ''
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
  v_actual_action text;
  v_last_scanned uuid;
BEGIN
  IF p_action_type NOT IN ('deduction', 'checkout') THEN
    RETURN QUERY SELECT false, 'Invalid action type', NULL::uuid, NULL::text, NULL::integer, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_product FROM products WHERE qr_token = p_qr_token FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Product not found: this QR code is not registered', NULL::uuid, NULL::text, NULL::integer, NULL::text;
    RETURN;
  END IF;

  SELECT ss.product_id INTO v_last_scanned
  FROM scan_sessions ss
  WHERE ss.session_id = p_session_id
  ORDER BY ss.scanned_at DESC
  LIMIT 1;

  IF v_last_scanned = v_product.id THEN
    RETURN QUERY SELECT false, 'Duplicate scan: scan a different product or start a new scan first', NULL::uuid, NULL::text, NULL::integer, NULL::text;
    RETURN;
  END IF;

  IF v_product.category = 'tool' AND p_action_type = 'deduction' THEN
    v_actual_action := 'checkout';
  ELSIF v_product.category = 'spare_part' AND p_action_type = 'deduction' THEN
    v_actual_action := 'deduction';
  ELSE
    v_actual_action := p_action_type;
  END IF;

  IF v_product.quantity <= 0 THEN
    RETURN QUERY SELECT false, 'Out of Stock: no units are available', v_product.id, v_product.name, v_product.quantity, v_actual_action;
    RETURN;
  END IF;

  v_remaining := v_product.quantity - 1;

  UPDATE products SET quantity = v_remaining, updated_at = now()
  WHERE id = v_product.id;

  INSERT INTO transactions (product_id, action_type, quantity_change, remaining_quantity, previous_stock, notes)
  VALUES (v_product.id, v_actual_action, -1, v_remaining, v_product.quantity, p_notes);

  INSERT INTO scan_sessions (session_id, product_id)
  VALUES (p_session_id, v_product.id);

  RETURN QUERY SELECT true, 'Success', v_product.id, v_product.name, v_remaining, v_actual_action;
END;
$$;

-- ============ return_tool: row lock ============
CREATE OR REPLACE FUNCTION return_tool(
  p_qr_token text,
  p_session_id text,
  p_notes text DEFAULT ''
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
  v_last_scanned uuid;
BEGIN
  SELECT * INTO v_product FROM products WHERE qr_token = p_qr_token FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Product not found: this QR code is not registered', NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF v_product.category != 'tool' THEN
    RETURN QUERY SELECT false, 'Only tools can be returned', v_product.id, v_product.name, v_product.quantity;
    RETURN;
  END IF;

  SELECT ss.product_id INTO v_last_scanned
  FROM scan_sessions ss
  WHERE ss.session_id = p_session_id
  ORDER BY ss.scanned_at DESC
  LIMIT 1;

  IF v_last_scanned = v_product.id THEN
    RETURN QUERY SELECT false, 'Duplicate scan: scan a different product or start a new scan first', NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  v_remaining := v_product.quantity + 1;

  UPDATE products SET quantity = v_remaining, updated_at = now()
  WHERE id = v_product.id;

  INSERT INTO transactions (product_id, action_type, quantity_change, remaining_quantity, previous_stock, notes)
  VALUES (v_product.id, 'return', 1, v_remaining, v_product.quantity, p_notes);

  INSERT INTO scan_sessions (session_id, product_id)
  VALUES (p_session_id, v_product.id);

  RETURN QUERY SELECT true, 'Tool returned successfully', v_product.id, v_product.name, v_remaining;
END;
$$;

-- ============ adjust_stock: row lock ============
CREATE OR REPLACE FUNCTION adjust_stock(
  p_product_id uuid,
  p_action_type text,
  p_quantity integer,
  p_notes text DEFAULT '',
  p_session_id text DEFAULT ''
)
RETURNS TABLE (
  success boolean,
  message text,
  product_id uuid,
  product_name text,
  previous_stock integer,
  new_stock integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product products%ROWTYPE;
  v_new_stock integer;
  v_qty_change integer;
  v_tx_action text;
BEGIN
  IF p_action_type NOT IN ('addition', 'removal', 'adjustment') THEN
    RETURN QUERY SELECT false, 'Invalid action type. Use addition, removal, or adjustment.', NULL::uuid, NULL::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RETURN QUERY SELECT false, 'Quantity must be a non-negative whole number', NULL::uuid, NULL::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT * INTO v_product FROM products WHERE id = p_product_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Product not found', NULL::uuid, NULL::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  IF p_action_type = 'addition' THEN
    v_new_stock := v_product.quantity + p_quantity;
    v_qty_change := p_quantity;
    v_tx_action := 'addition';
  ELSIF p_action_type = 'removal' THEN
    v_new_stock := v_product.quantity - p_quantity;
    v_qty_change := -p_quantity;
    v_tx_action := 'deduction';
  ELSE
    v_new_stock := p_quantity;
    v_qty_change := p_quantity - v_product.quantity;
    v_tx_action := 'adjustment';
  END IF;

  IF v_new_stock < 0 THEN
    RETURN QUERY SELECT false, 'Cannot reduce stock below zero. Current stock: ' || v_product.quantity, v_product.id, v_product.name, v_product.quantity, v_product.quantity;
    RETURN;
  END IF;

  UPDATE products SET quantity = v_new_stock, updated_at = now()
  WHERE id = v_product.id;

  INSERT INTO transactions (product_id, action_type, quantity_change, remaining_quantity, previous_stock, notes)
  VALUES (v_product.id, v_tx_action, v_qty_change, v_new_stock, v_product.quantity, p_notes);

  RETURN QUERY SELECT true, 'Stock updated successfully', v_product.id, v_product.name, v_product.quantity, v_new_stock;
END;
$$;
