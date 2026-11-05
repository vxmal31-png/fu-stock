/*
# Fix ambiguous column references in deduct_stock and return_tool

## Problem
The `deduct_stock` and `return_tool` functions use `product_id` inside subqueries,
but Postgres can't tell if it refers to the `scan_sessions.product_id` column or
the `products.product_id` column (from the `%ROWTYPE` variable). This causes:
  ERROR: column reference "product_id" is ambiguous

## Fix
- Qualify all column references with explicit table aliases inside the subqueries
- Use `scan_sessions.product_id` instead of bare `product_id`
*/

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

  -- Check for duplicate scan: is the most recent scan for this session the same product?
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

  INSERT INTO transactions (product_id, action_type, quantity_change, remaining_quantity)
  VALUES (v_product.id, 'return', 1, v_remaining);

  INSERT INTO scan_sessions (session_id, product_id)
  VALUES (p_session_id, v_product.id);

  RETURN QUERY SELECT true, 'Tool returned successfully', v_product.id, v_product.name, v_remaining;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_stock(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION return_tool(text, text) TO anon, authenticated;
