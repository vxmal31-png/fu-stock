/*
# Remove unlocked stock RPC overloads

1. Problem
- Two older overloads of the stock functions were still present:
  `deduct_stock(text, text, text)` and `return_tool(text, text)`.
- They do not take a row lock, so two simultaneous scans could both read the same stock and
  over-deduct it.
- The scanner calls these functions without the notes argument, so the database picked the
  unlocked overloads.

2. Change
- Drops the two unlocked overloads.
- The locked versions `deduct_stock(text, text, text, text)` and `return_tool(text, text, text)`
  remain, and their notes argument has a default, so the scanner's existing calls use them.

3. Data
- No table data is changed. Only function definitions are removed.

4. Security
- Removing the unlocked overloads also removes their public EXECUTE access.
*/

DROP FUNCTION IF EXISTS public.deduct_stock(text, text, text);
DROP FUNCTION IF EXISTS public.return_tool(text, text);
