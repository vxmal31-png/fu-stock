/*
# Drop old overloaded RPC functions (2-parameter versions)

## Problem
The first migration created `deduct_stock(text, text)`, `return_tool(text)`, and `clear_scan_session(uuid)`.
The second migration created new 3-parameter versions but did NOT drop the old ones.
Postgres keeps both as overloads, and the Supabase JS client can resolve to the wrong one,
causing scanner deductions to silently fail.

## Fix
Drop all old overloads so only the correct 3-parameter versions remain.
*/

DROP FUNCTION IF EXISTS deduct_stock(text, text);
DROP FUNCTION IF EXISTS return_tool(text);
DROP FUNCTION IF EXISTS clear_scan_session(uuid);

-- Re-grant execute on the surviving versions to be safe
GRANT EXECUTE ON FUNCTION deduct_stock(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION return_tool(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION clear_scan_session(text, uuid) TO anon, authenticated;
