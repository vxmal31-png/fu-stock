/*
# Bulk scan confirmation (atomic stock update)

1. New Tables
- `bulk_confirmations`: one row per confirmation attempt, keyed by a client-generated key.
  Stores the result so a retried or double-clicked confirmation returns the original result
  instead of changing stock again. Not readable or writable by the browser.

2. New Function
- `bulk_confirm_scan(p_items, p_mode, p_session_id, p_confirm_key, p_notes)`
  Confirms a whole temporary scan list in one database transaction:
  - Merges repeated lines for the same product.
  - Locks every product row before checking any stock.
  - Validates every line first (product exists, stock is enough, tools only for returns).
  - Then updates every product's stock and writes one stock history row per product.
  - Any failure raises an error, so nothing is changed.
  - Repeating the same confirmation key returns the saved result and changes nothing.

3. Security
- `bulk_confirmations` has row level security enabled with no policies and no grants,
  so only the function can use it.
- The function runs with the owner's rights and is granted to the same public roles
  as the existing stock functions, which this no-login app already uses.

4. Important Notes
- Stock rules match the single-scan rules: tools checked out (or returned in Return Tool mode),
  spare parts deducted, stock never goes below zero.
- Auto and Check Out / Deduct both record a checkout for tools and a deduction for spare parts.
*/

CREATE TABLE IF NOT EXISTS bulk_confirmations (
  confirm_key text PRIMARY KEY,
  session_id text NOT NULL DEFAULT '',
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bulk_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bulk_confirmations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION bulk_confirm_scan(
  p_items jsonb,
  p_mode text,
  p_session_id text,
  p_confirm_key text,
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
  v_existing jsonb;
  v_line record;
  v_product products%ROWTYPE;
  v_action text;
  v_new_stock integer;
  v_items jsonb := '[]'::jsonb;
  v_response jsonb;
BEGIN
  IF p_mode NOT IN ('auto', 'checkout', 'return') THEN
    RAISE EXCEPTION 'Invalid action mode';
  END IF;

  IF p_confirm_key IS NULL OR length(p_confirm_key) < 8 THEN
    RAISE EXCEPTION 'Missing confirmation key';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No products to confirm';
  END IF;

  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'Too many products in one confirmation';
  END IF;

  INSERT INTO bulk_confirmations (confirm_key, session_id)
  VALUES (p_confirm_key, coalesce(p_session_id, ''))
  ON CONFLICT (confirm_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT bc.result INTO v_existing FROM bulk_confirmations bc WHERE bc.confirm_key = p_confirm_key;
    IF v_existing IS NULL THEN
      RAISE EXCEPTION 'This confirmation is already being processed';
    END IF;
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS x
    WHERE coalesce(x->>'quantity', '') !~ '^[0-9]{1,6}$'
       OR (x->>'quantity')::integer < 1
       OR coalesce(x->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'Each product needs a valid ID and a quantity of at least 1';
  END IF;

  PERFORM 1
  FROM products pr
  WHERE pr.id IN (SELECT (x->>'product_id')::uuid FROM jsonb_array_elements(p_items) AS x)
  ORDER BY pr.id
  FOR UPDATE;

  FOR v_line IN
    SELECT (x->>'product_id')::uuid AS product_id, sum((x->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) AS x
    GROUP BY 1
    ORDER BY 1
  LOOP
    SELECT * INTO v_product FROM products pr WHERE pr.id = v_line.product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A scanned product no longer exists';
    END IF;

    IF p_mode = 'return' THEN
      IF v_product.category <> 'tool' THEN
        RAISE EXCEPTION 'Only tools can be returned: % is not a tool', v_product.name;
      END IF;
      v_action := 'return';
      v_new_stock := v_product.quantity + v_line.quantity;
    ELSE
      IF v_product.quantity < v_line.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for %: requested %, available %',
          v_product.name, v_line.quantity, v_product.quantity;
      END IF;
      v_action := CASE WHEN v_product.category = 'tool' THEN 'checkout' ELSE 'deduction' END;
      v_new_stock := v_product.quantity - v_line.quantity;
    END IF;

    UPDATE products SET quantity = v_new_stock, updated_at = now() WHERE id = v_product.id;

    INSERT INTO transactions (product_id, action_type, quantity_change, remaining_quantity, previous_stock, notes)
    VALUES (
      v_product.id,
      v_action,
      CASE WHEN v_action = 'return' THEN v_line.quantity ELSE -v_line.quantity END,
      v_new_stock,
      v_product.quantity,
      coalesce(p_notes, '')
    );

    v_items := v_items || jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'category', v_product.category,
      'action', v_action,
      'quantity', v_line.quantity,
      'previous_stock', v_product.quantity,
      'new_stock', v_new_stock
    );
  END LOOP;

  v_response := jsonb_build_object('success', true, 'replayed', false, 'items', v_items);

  UPDATE bulk_confirmations SET result = v_response WHERE confirm_key = p_confirm_key;

  RETURN v_response;
END;
$$;

REVOKE EXECUTE ON FUNCTION bulk_confirm_scan(jsonb, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_confirm_scan(jsonb, text, text, text, text) TO anon, authenticated;
