# BIG BROTHER Local Brain V5/V6 — Direct Sale warehouse-source hotfix

**Status:** STAGED / NOT YET INSTALLED ON LOCAL BRAIN.

**Migration ID:** `20261103_direct_sale_warehouse_source_local_v1`

**Approved SQL candidate:** [20261103_direct_sale_warehouse_source_local_v1.sql](./20261103_direct_sale_warehouse_source_local_v1.sql)

**SHA-256 of exact SQL (UTF-8):** `a6133dd93c0e29b71809cf1d5c71cb924f71f5174653721437a6e99511bf9741`

**Read-only verification:** [20261103_direct_sale_warehouse_source_local_verify.sql](./20261103_direct_sale_warehouse_source_local_verify.sql)

## Mandatory deployment rules

1. Install **only** using the current V3.4 Controller's **Code Sync → checksum-verified Approved SQL Code Gate**; do not rely on Cloud → Local business-data sync or manually run ad-hoc SQL.
2. Register this migration ID, path, checksum and expected target functions in the controller's approved migration manifest. **Registration is not included here because the controller repository is not available in the connected GitHub account.** Do not tell operators that Code Sync can apply it until the gate registration is verified.
3. Take the existing Controller full Local PostgreSQL backup; do not bypass Schema Guard, approved SQL gate, rehearsal or rollback protections.
4. The SQL is one transaction. It checks for the two invoice-line stock triggers and batch-skip guards and aborts on unexpected function definitions.
5. Only Direct Sale warehouse-location movement rows may be repaired. Every original full `stock_activity` row is recorded in `system_activity_log` before update, within the same transaction. Existing invoice sales locations, batch stock, quantities, cost and value are untouched.
6. Do not update `BATCH_PENDING` or `BATCH_ZERO_COST` movements; do not auto-create or alter invoice or staff payment records.
7. Run the read-only verification and require `no_batch_stock_guard = PASS`; confirm a test No Batch sale in a sandbox deducts warehouse only; confirm batch stock remains unchanged.
8. Confirm V5 and V6 both use the updated shared Local PostgreSQL functions; keep V5 (8081) and V6 (8083) separately startable.

## Provenance & testing

The change was dry-run in a BEGIN/ROLLBACK transaction against live Cloud's compatible PostgreSQL schema on 03-Nov-2026, without permanently applying the local migration. The read-only verifier ran on Cloud. **Local Controller verification and application have not yet been performed.**

**Business rule:** Shipping location is the invoice sales location, not the physical stock source. No Batch / Direct Sale = default warehouse purchased/zero-cost buckets only. Batch Sale = assigned batch stock only.
