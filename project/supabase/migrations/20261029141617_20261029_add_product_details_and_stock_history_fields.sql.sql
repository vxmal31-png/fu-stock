/*
# Add product details, stock history fields, and manual stock adjustment support

## Overview
Extends the existing workshop schema to support the full feature set:
- Products gain `description` and `location` columns for richer inventory records.
- Transactions gain `previous_stock` and `notes` columns for complete audit trails.
- Transaction `action_type` now supports `addition` and `adjustment` in addition to
  the existing `checkout`, `return`, `deduction`.
- A new `adjust_stock` SECURITY DEFINER RPC allows manual stock additions, removals,
  and adjustments with server-side validation and notes — all recorded as transactions.
- The existing `deduct_stock` and `return_tool` RPCs are updated to record `previous_stock`
  and accept an optional `p_notes` parameter.

## Existing Data
All existing products (2), transactions (3), and scan_sessions (3) are preserved.
New columns use safe defaults so existing rows remain valid.

## New Columns
### products
- `description` (text, default '') — free-text product description
- `location` (text, default '') — storage location (shelf, bin, bay, etc.)

### transactions
- `previous_stock` (integer, default 0) — stock level before the action
- `notes` (text, default '') — operator notes for manual adjustments

## Modified Columns
### transactions.action_type
- CHECK constraint expanded to allow: 'checkout', 'return', 'deduction', 'addition', 'adjustment'

## New RPC Function
### adjust_stock(p_product_id, p_action_type, p_quantity, p_notes, p_session_id)
- SECURITY DEFINER function for manual stock changes from the Products page.
- Supports: 'addition' (add N units), 'removal' (remove N units), 'adjustment' (set to N units).
- Validates the product exists, prevents negative stock, records previous_stock and notes.
- Records a transaction row with the appropriate action_type and quantity_change.

## Updated RPC Functions
### deduct_stock — now records previous_stock, accepts optional p_notes
### return_tool — now records previous_stock, accepts optional p_notes

## Security
- RLS remains enabled on all tables with existing anon+authenticated open policies.
- New columns are automatically covered by existing grants (table-level).
- `adjust_stock` is granted EXECUTE to anon+authenticated.
- All functions use SECURITY DEFINER with search_path = public.
*/

-- ============ products: add description and location ============
ALTER TABLE products ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';

-- ============ transactions: add previous_stock and notes ============
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS previous_stock integer NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

-- ============ transactions: expand action_type CHECK to include addition and adjustment ============
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_action_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_action_type_check
  CHECK (action_type IN ('checkout', 'return', 'deduction', 'addition', 'adjustment'));

-- ============ Update deduct_stock to record previous_stock and accept notes ============
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
  v_already_scanned boolean;
  v_actual_action text;
  v_last_scanned uuid;
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

  -- Check for duplicate scan
  SELECT ss.product_id INTO v_last_scanned
  FROM scan_sessions ss
  WHERE ss.session_id = p_session_id
  ORDER BY ss.scanned_at DESC
  LIMIT 1;

  v_already_scanned := (v_last_scanned = v_product.id);

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

  INSERT INTO transactions (product_id, action_type, quantity_change, remaining_quantity, previous_stock, notes)
  VALUES (v_product.id, v_actual_action, -1, v_remaining, v_product.quantity, p_notes);

  INSERT INTO scan_sessions (session_id, product_id)
  VALUES (p_session_id, v_product.id);

  RETURN QUERY SELECT true, 'Success', v_product.id, v_product.name, v_remaining, v_actual_action;
  RETURN;
END;
$$;

-- ============ Update return_tool to record previous_stock and accept notes ============
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
  v_already_scanned boolean;
  v_last_scanned uuid;
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

  SELECT ss.product_id INTO v_last_scanned
  FROM scan_sessions ss
  WHERE ss.session_id = p_session_id
  ORDER BY ss.scanned_at DESC
  LIMIT 1;

  v_already_scanned := (v_last_scanned = v_product.id);

  IF v_already_scanned THEN
    RETURN QUERY SELECT false, 'Duplicate scan — scan a different product or start a new scan first', NULL::uuid, NULL::text, NULL::integer;
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
  RETURN;
END;
$$;

-- ============ New: adjust_stock for manual additions/removals/adjustments ============
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
    RETURN QUERY SELECT false, 'Quantity must be a non-negative integer', NULL::uuid, NULL::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT * INTO v_product FROM products WHERE id = p_product_id;

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
  ELSE  -- adjustment: set stock to exactly p_quantity
    v_new_stock := p_quantity;
    v_qty_change := p_quantity - v_product.quantity;
    v_tx_action := 'adjustment';
  END IF;

  IF v_new_stock < 0 THEN
    RETURN QUERY SELECT false, 'Cannot reduce stock below zero. Current stock: ' || v_product.quantity || ', attempted removal: ' || p_quantity, v_product.id, v_product.name, v_product.quantity, v_product.quantity;
    RETURN;
  END IF;

  UPDATE products SET quantity = v_new_stock, updated_at = now()
  WHERE id = v_product.id;

  INSERT INTO transactions (product_id, action_type, quantity_change, remaining_quantity, previous_stock, notes)
  VALUES (v_product.id, v_tx_action, v_qty_change, v_new_stock, v_product.quantity, p_notes);

  RETURN QUERY SELECT true, 'Stock updated successfully', v_product.id, v_product.name, v_product.quantity, v_new_stock;
  RETURN;
END;
$$;

-- ============ Grant execute on new/updated functions ============
GRANT EXECUTE ON FUNCTION deduct_stock(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION return_tool(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION adjust_stock(uuid, text, integer, text, text) TO anon, authenticated;

-- Re-grant clear_scan_session (unchanged, but ensure it survives)
GRANT EXECUTE ON FUNCTION clear_scan_session(text, uuid) TO anon, authenticated;
