# Project memory

## Product intent & audience

- App named "Fu-Glide_AutoNex"; Engine Workshop Stock Management system.
- Production web app for workshop inventory: add products, generate/print QR labels, scan QR to deduct stock, track stock history.
- Persistent data via Supabase (Postgres database); survives page refresh.
- Existing product IDs and QR tokens preserved so previously printed labels remain valid.

## Brand personality & voice

- Professional, production-grade tone across sidebar, headers, print labels.

## Visual design & UX direction

- Existing layout unchanged: persistent sidebar (desktop) + mobile header.
- Pages: Dashboard, Products, QR Scanner, Stock History, QR Printing.
- QR label layout (both on-screen cards and print): product ID, product name, brand shown below the QR code.
- Products page: brand dropdown on add form, brand filter, category filter, category grouping, read-only product IDs after creation.
- QR Scanner: shows product name, brand, category, product ID, current stock; Out of Stock message at zero.
- Icons via lucide-react, styling via Tailwind, imports via `@/` path alias.

## Decisions, constraints & rationale

- Every product has a unique permanent product ID and unique QR code (token) identifying the exact product, not just name/brand.
- Product fields: name, brand, category, quantity, QR identifier.
- Scan workflow: deduct exactly 1 unit, record transaction in Stock History, prevent negative stock (Out of Stock at zero).
- Duplicate scan on same product updates existing stock—no duplicate product created.
- Database functions `deduct_stock` and `return_tool` use row-level locking (`FOR UPDATE`) to prevent race conditions; old unlocked overloads removed.
- Migration file on disk has doubled ending (`.sql.sql`)—pre-existing, left unchanged.
- Build and typecheck pass after all changes.
- End-to-end DB-level workflow tested (add → save → generate QR → scan → deduct → history); app-screen testing deferred to user.

## Open questions & assumptions

- Full workflow not yet tested through actual app screens (browser); user asked to verify manually.
- `return_tool` function exists (suggests a tool-return/restock feature) but not detailed in requirements.
- Core feature set beyond stock/QR workflow undefined.
- Target users and deployment environment not yet specified.